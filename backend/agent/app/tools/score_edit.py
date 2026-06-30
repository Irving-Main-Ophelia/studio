"""Symbolic score editing through music21.

Phase 1 (M1.1) keeps the notation editor *server-authoritative*: every note
insertion, removal, articulation toggle, tie change, or dynamic marker travels
to FastAPI, gets applied to the music21 stream, and the freshly serialised
MusicXML 4.0 comes back. The frontend re-renders OSMD with the new string and
treats it as the new source of truth.

Why server-side:

- We get music21's enharmonic spelling, beaming, voice-allocation, and grand-
  staff handling *for free*. Doing those correctly in TypeScript is a long
  road; doing them wrong erodes the maintainer's trust in the score.
- The same code paths are reachable from the agent's tool calls (M1.4) and
  from the upcoming eval harness, keeping a single source of truth.
- Latency is fine for step-time entry on a personal-use app: parse + edit +
  serialize for a 32-bar piano piece runs <100 ms on the M2 Air.

Trade-off: real-time *capture* mode (live polyphonic play-in) is a Phase 2
concern. Phase 1 covers step-time + paste-from-buffer, which is what the
maintainer asked for.
"""

from __future__ import annotations

from typing import Any, Literal, cast

from music21 import articulations, dynamics, expressions, key, spanner, stream
from music21 import base as m21base
from music21 import chord as m21chord
from music21 import duration as m21duration
from music21 import interval as m21interval
from music21 import note as m21note
from music21 import pitch as m21pitch
from music21 import tie as m21tie

from .theory import _parse as _parse_raw

TieType = Literal["start", "stop", "continue", "none"]

# Connective guitar techniques: a spanner is drawn from the addressed note to
# the immediately following note (ADR-0020). The authoring gesture is a single
# cursor; the two-note span is an implementation detail.
ALLOWED_CONNECTIVE_TECHNIQUES: dict[str, type[spanner.Spanner]] = {
    "hammer_on": articulations.HammerOn,
    "pull_off": articulations.PullOff,
    "slide": spanner.Glissando,
}

# Point technical markers attached to one note (ADR-0020). Each toggles on/off;
# the handler in ``toggle_technical_marker`` knows whether it lives on the note's
# articulations, expressions, notehead, or as a single-note spanner.
ALLOWED_TECHNICAL_MARKERS: tuple[str, ...] = (
    "natural_harmonic",
    "artificial_harmonic",
    "vibrato",
    "dead_note",
    "ghost_note",
    "strum_up",
    "strum_down",
)

# Bracketed spans drawn across a range as a dashed/solid bracket (ADR-0020).
# music21 has no semantic palm-mute/let-ring element, so the line style carries
# the distinction (dashed = palm mute, solid = let ring) — a documented caveat.
ALLOWED_BRACKET_SPANS: dict[str, str] = {
    "palm_mute": "dashed",
    "let_ring": "solid",
}

# Quarter-note tolerance for "this offset matches that note". 1/250 of a beat
# is well below 1 ms at any practical tempo and survives music21's float
# rounding when notes round-trip through MusicXML divisions.
OFFSET_TOLERANCE = 1e-2

# Fermata lives under `music21.expressions`, not `articulations` — but for the
# editor it behaves like an articulation, so we expose it through the same map.
ALLOWED_ARTICULATIONS: dict[str, type[m21base.Music21Object]] = {
    "staccato": articulations.Staccato,
    "accent": articulations.Accent,
    "marcato": articulations.StrongAccent,
    "tenuto": articulations.Tenuto,
    "fermata": expressions.Fermata,
}

ALLOWED_DYNAMICS: tuple[str, ...] = ("pp", "p", "mp", "mf", "f", "ff", "ppp", "fff")


def _coerce_duration_types(score: stream.Score) -> None:
    """Fix notes/rests with missing duration types that music21 cannot export.

    music21 can parse MusicXML notes whose <type> is absent but cannot
    round-trip them. recurse() visits every sub-stream (including Voice
    objects inside multi-voice measures) so no element is skipped.

    Called both at parse time (pre-fix) and as a _serialise fallback.
    """
    for el in score.recurse().notesAndRests:
        dtype = el.duration.type
        if not dtype or dtype in ("zero", ""):
            ql = float(el.duration.quarterLength)
            if ql > 0:
                el.duration.type = m21duration.Duration(quarterLength=ql).type
            else:
                el.duration.type = "eighth"


def _parse(musicxml: str) -> stream.Score:
    """Parse MusicXML and immediately normalise unexportable duration types.

    Wraps the theory._parse with a pre-fix so that every score that enters
    the edit pipeline is guaranteed to be round-trippable before any edit.
    """
    score = _parse_raw(musicxml)
    _coerce_duration_types(score)
    return score


def _serialise(score: stream.Score) -> str:
    """music21 only serialises through a file. Read it back and return."""
    try:
        path = score.write("musicxml")  # type: ignore[no-untyped-call]
    except Exception:
        # Belt-and-suspenders: coerce again in case the edit introduced new
        # elements (e.g. replacement Note for a Chord) with missing types.
        _coerce_duration_types(score)
        path = score.write("musicxml")  # type: ignore[no-untyped-call]
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def _get_part(score: stream.Score, part_index: int) -> stream.Part:
    parts = list(score.parts) if score.parts else []
    if not parts:
        raise ValueError("Score has no parts.")
    if part_index < 0 or part_index >= len(parts):
        raise ValueError(f"part_index {part_index} out of range (score has {len(parts)} parts)")
    return parts[part_index]


def _get_measure(part: stream.Part, measure_number: int) -> stream.Measure:
    measure = part.measure(measure_number)
    if measure is None:
        raise ValueError(
            f"part has no measure numbered {measure_number}; "
            f"available: {[m.number for m in part.getElementsByClass(stream.Measure)]}"
        )
    return measure


def _find_voice_or_measure(measure: stream.Measure, voice_id: int | None) -> stream.Stream[Any]:
    """Return either the requested voice substream or the measure itself."""
    if voice_id is None:
        return measure
    voices = list(measure.voices)
    if not voices:
        return measure
    for v in voices:
        if _voice_id(v) == voice_id:
            return cast("stream.Stream[Any]", v)
    raise ValueError(f"measure has no voice {voice_id}; voices: {[v.id for v in voices]}")


def _voice_id(v: stream.Voice) -> int | None:
    try:
        return int(v.id)
    except (ValueError, TypeError):
        return None


def _find_note_at(
    container: stream.Stream[Any],
    beat_offset: float,
    tolerance: float = OFFSET_TOLERANCE,
) -> m21note.GeneralNote | None:
    """Look up the note or rest whose offset is closest to ``beat_offset``."""
    candidates = list(container.notesAndRests)
    # Multi-voice measures store notes inside Voice sub-streams; notesAndRests
    # on the Measure itself returns [] in that case.
    if not candidates and isinstance(container, stream.Measure):
        for v in container.voices:
            candidates.extend(list(v.notesAndRests))
    if not candidates:
        return None
    best: tuple[float, m21note.GeneralNote] | None = None
    for el in candidates:
        delta = abs(float(el.offset) - beat_offset)
        if delta <= tolerance and (best is None or delta < best[0]):
            best = (delta, el)
    if best is not None:
        return best[1]
    # Fallback: nearest pitched element within half a beat (floating-point slop).
    for el in candidates:
        if isinstance(el, m21note.Rest):
            continue
        delta = abs(float(el.offset) - beat_offset)
        if delta <= 0.5 and (best is None or delta < best[0]):
            best = (delta, el)
    return best[1] if best else None


def _make_note(pitch: str, duration_quarters: float) -> m21note.Note:
    p = m21pitch.Pitch(pitch)
    n = m21note.Note(p)
    n.duration = m21duration.Duration(duration_quarters)
    return n


def insert_note(
    musicxml: str,
    *,
    part_index: int,
    measure_number: int,
    beat_offset: float,
    pitch: str,
    duration_quarters: float,
    voice: int | None = None,
    replace: bool = True,
) -> dict[str, Any]:
    """Insert a note at the given position.

    If a note or rest already starts at ``beat_offset`` and ``replace`` is
    True (the default), it's swapped out. Otherwise the new note is layered
    onto the same beat (mostly useful for adding voices later).
    """
    if duration_quarters <= 0:
        raise ValueError("duration_quarters must be positive")
    score = _parse(musicxml)
    part = _get_part(score, part_index)
    measure = _get_measure(part, measure_number)
    target_container = _find_voice_or_measure(measure, voice)

    existing = _find_note_at(target_container, beat_offset) if replace else None
    new_note = _make_note(pitch, duration_quarters)

    if existing is not None and replace:
        target_container.replace(existing, new_note)
    else:
        target_container.insert(beat_offset, new_note)  # type: ignore[no-untyped-call]

    next_offset = beat_offset + duration_quarters
    return {
        "musicxml": _serialise(score),
        "next_cursor": {
            "part_index": part_index,
            "measure_number": measure_number,
            "beat_offset": next_offset,
            "voice": voice,
        },
        "inserted_note": {
            "pitch": new_note.pitch.nameWithOctave,
            "midi": int(new_note.pitch.midi),
            "duration_quarters": duration_quarters,
        },
    }


def insert_rest(
    musicxml: str,
    *,
    part_index: int,
    measure_number: int,
    beat_offset: float,
    duration_quarters: float,
    voice: int | None = None,
) -> dict[str, Any]:
    if duration_quarters <= 0:
        raise ValueError("duration_quarters must be positive")
    score = _parse(musicxml)
    part = _get_part(score, part_index)
    measure = _get_measure(part, measure_number)
    target_container = _find_voice_or_measure(measure, voice)

    existing = _find_note_at(target_container, beat_offset)
    rest = m21note.Rest()
    rest.duration = m21duration.Duration(duration_quarters)
    if existing is not None:
        target_container.replace(existing, rest)
    else:
        target_container.insert(beat_offset, rest)  # type: ignore[no-untyped-call]

    next_offset = beat_offset + duration_quarters
    return {
        "musicxml": _serialise(score),
        "next_cursor": {
            "part_index": part_index,
            "measure_number": measure_number,
            "beat_offset": next_offset,
            "voice": voice,
        },
    }


def remove_note(
    musicxml: str,
    *,
    part_index: int,
    measure_number: int,
    beat_offset: float,
    voice: int | None = None,
) -> dict[str, Any]:
    """Replace the note at the position with a rest of the same duration.

    Errors out if the target slot is not a Note (or Chord). Removing a rest
    is a no-op the editor never needs and that the maintainer almost always
    triggers by accident — surfacing it as a 400 lets the UI show feedback.
    """
    score = _parse(musicxml)
    part = _get_part(score, part_index)
    measure = _get_measure(part, measure_number)
    container = _find_voice_or_measure(measure, voice)
    existing = _find_note_at(container, beat_offset)
    if existing is None or not isinstance(existing, m21note.NotRest):
        raise ValueError(
            f"No note found at part={part_index} measure={measure_number} beat={beat_offset}"
        )
    rest = m21note.Rest()
    rest.duration = existing.duration
    container.replace(existing, rest)
    return {"musicxml": _serialise(score)}


def toggle_articulation(
    musicxml: str,
    *,
    part_index: int,
    measure_number: int,
    beat_offset: float,
    articulation: str,
    voice: int | None = None,
) -> dict[str, Any]:
    if articulation not in ALLOWED_ARTICULATIONS:
        raise ValueError(
            f"unsupported articulation '{articulation}'; allowed: {sorted(ALLOWED_ARTICULATIONS)}"
        )
    score = _parse(musicxml)
    part = _get_part(score, part_index)
    measure = _get_measure(part, measure_number)
    container = _find_voice_or_measure(measure, voice)
    existing = _find_note_at(container, beat_offset)
    if existing is None or not isinstance(existing, m21note.NotRest):
        raise ValueError(
            f"No note found at part={part_index} measure={measure_number} beat={beat_offset}"
        )

    cls = ALLOWED_ARTICULATIONS[articulation]
    target_notes: list[m21note.Note] = []
    if isinstance(existing, m21note.Note):
        target_notes = [existing]
    elif isinstance(existing, m21chord.Chord):
        target_notes = list(existing.notes)

    if not target_notes:
        raise ValueError("No pitched notes to articulate at this position.")

    action = "added"
    if issubclass(cls, expressions.Expression):
        cls_expr: type[expressions.Expression] = cls
        if any(isinstance(a, cls_expr) for n in target_notes for a in n.expressions):
            for n in target_notes:
                n.expressions = [a for a in n.expressions if not isinstance(a, cls_expr)]
            action = "removed"
        else:
            for n in target_notes:
                n.expressions.append(cls_expr())
            action = "added"
    else:
        cls_art = cast(type[articulations.Articulation], cls)
        if any(isinstance(a, cls_art) for n in target_notes for a in n.articulations):
            for n in target_notes:
                n.articulations = [a for a in n.articulations if not isinstance(a, cls_art)]
            action = "removed"
        else:
            for n in target_notes:
                n.articulations.append(cls_art())
            action = "added"
    return {"musicxml": _serialise(score), "action": action}


def set_tie(
    musicxml: str,
    *,
    part_index: int,
    measure_number: int,
    beat_offset: float,
    tie_type: TieType,
    voice: int | None = None,
) -> dict[str, Any]:
    score = _parse(musicxml)
    part = _get_part(score, part_index)
    measure = _get_measure(part, measure_number)
    container = _find_voice_or_measure(measure, voice)
    existing = _find_note_at(container, beat_offset)
    if existing is None or not isinstance(existing, m21note.Note):
        raise ValueError(
            f"No note found at part={part_index} measure={measure_number} beat={beat_offset}"
        )
    if tie_type == "none":
        existing.tie = None
    else:
        existing.tie = m21tie.Tie(tie_type)  # type: ignore[no-untyped-call]
    return {"musicxml": _serialise(score)}


def set_bend(
    musicxml: str,
    *,
    part_index: int,
    measure_number: int,
    beat_offset: float,
    bend_alter: int,
    pre_bend: bool = False,
    release: float | None = None,
    voice: int | None = None,
) -> dict[str, Any]:
    """Add, change, or remove a string bend on the note at the position.

    ``bend_alter`` is the bend target in semitones (positive = bend up,
    negative = bend down); ``0`` removes any existing bend. ``pre_bend`` marks
    the string as already bent at the note's onset; ``release`` is the
    quarter-length offset at which the bend is released, if any.

    Maps to music21 ``articulations.FretBend`` → MusicXML ``<bend>`` (ADR-0020).
    """
    score = _parse(musicxml)
    part = _get_part(score, part_index)
    measure = _get_measure(part, measure_number)
    container = _find_voice_or_measure(measure, voice)
    existing = _find_note_at(container, beat_offset)
    if existing is None or not isinstance(existing, m21note.Note):
        raise ValueError(
            f"No note found at part={part_index} measure={measure_number} beat={beat_offset}"
        )

    had_bend = any(isinstance(a, articulations.FretBend) for a in existing.articulations)
    existing.articulations = [
        a for a in existing.articulations if not isinstance(a, articulations.FretBend)
    ]

    if bend_alter == 0:
        action = "removed" if had_bend else "unchanged"
    else:
        existing.articulations.append(
            articulations.FretBend(
                bendAlter=m21interval.ChromaticInterval(bend_alter),
                preBend=pre_bend,
                release=release,
            )
        )
        action = "changed" if had_bend else "added"

    return {"musicxml": _serialise(score), "action": action}


def _notrests_in(container: stream.Stream[Any]) -> list[m21note.NotRest]:
    """Pitched notes/chords in a container, descending into voices when needed."""
    items: list[m21base.Music21Object] = list(container.notesAndRests)
    if not items and isinstance(container, stream.Measure):
        for v in container.voices:
            items.extend(list(v.notesAndRests))
    return [el for el in items if isinstance(el, m21note.NotRest)]


def _next_notrest_after(
    part: stream.Part,
    container: stream.Stream[Any],
    note: m21note.NotRest,
) -> m21note.NotRest | None:
    """Return the next pitched note after ``note`` in performance order.

    Searches the same container first; if ``note`` is the last pitched element
    there, spills into the first pitched element of a following measure.
    """
    start_off = float(note.offset)
    later = sorted(
        (el for el in _notrests_in(container) if float(el.offset) > start_off),
        key=lambda el: float(el.offset),
    )
    if later:
        return later[0]

    current_measure = note.getContextByClass(stream.Measure)
    if current_measure is None:
        return None
    measures = list(part.getElementsByClass(stream.Measure))
    try:
        idx = measures.index(current_measure)
    except ValueError:
        return None
    for following in measures[idx + 1 :]:
        nxt = sorted(_notrests_in(following), key=lambda el: float(el.offset))
        if nxt:
            return nxt[0]
    return None


def set_connective_technique(
    musicxml: str,
    *,
    part_index: int,
    measure_number: int,
    beat_offset: float,
    technique: str,
    action: str = "set",
    voice: int | None = None,
) -> dict[str, Any]:
    """Attach or remove a connective guitar technique (hammer-on, pull-off).

    The cursor addresses the *start* note; ``set`` draws the spanner from it to
    the immediately following note, ``remove`` clears any spanner of this kind
    starting at the note. Follows the ``/tie/set`` start/stop discipline but
    keeps a single-cursor authoring gesture (ADR-0020).

    Maps to music21 ``HammerOn``/``PullOff`` spanners → MusicXML
    ``<hammer-on>``/``<pull-off>`` start/stop pairs.
    """
    if technique not in ALLOWED_CONNECTIVE_TECHNIQUES:
        raise ValueError(
            f"unsupported technique '{technique}'; "
            f"allowed: {sorted(ALLOWED_CONNECTIVE_TECHNIQUES)}"
        )
    if action not in ("set", "remove"):
        raise ValueError(f"action must be 'set' or 'remove', got '{action}'")

    cls = ALLOWED_CONNECTIVE_TECHNIQUES[technique]
    score = _parse(musicxml)
    part = _get_part(score, part_index)
    measure = _get_measure(part, measure_number)
    container = _find_voice_or_measure(measure, voice)
    start = _find_note_at(container, beat_offset)
    if start is None or not isinstance(start, m21note.NotRest):
        raise ValueError(
            f"No note found at part={part_index} measure={measure_number} beat={beat_offset}"
        )

    # Remove any existing spanner of this kind starting here (idempotent set,
    # and the body of remove).
    removed = 0
    for sp in list(score.recurse().getElementsByClass(cls)):
        if sp.getFirst() is start:
            score.remove(sp, recurse=True)
            removed += 1

    if action == "remove":
        return {
            "musicxml": _serialise(score),
            "action": "removed" if removed else "unchanged",
        }

    nxt = _next_notrest_after(part, container, start)
    if nxt is None:
        raise ValueError(
            f"{technique.replace('_', ' ')} needs a following note to connect to; "
            f"none found after part={part_index} measure={measure_number} beat={beat_offset}"
        )
    sp = cls(start, nxt)
    if isinstance(sp, spanner.Glissando):
        # A guitar slide reads as a straight line, not the default wavy gliss.
        sp.lineType = "solid"
    part.insert(0, sp)  # type: ignore[no-untyped-call]
    return {
        "musicxml": _serialise(score),
        "action": "changed" if removed else "added",
    }


def toggle_technical_marker(
    musicxml: str,
    *,
    part_index: int,
    measure_number: int,
    beat_offset: float,
    marker: str,
    voice: int | None = None,
) -> dict[str, Any]:
    """Toggle a point technical marker on the note at the position (ADR-0020).

    ``marker`` is one of ``ALLOWED_TECHNICAL_MARKERS``: natural/artificial
    harmonic, vibrato, dead/ghost note, strum up/down. Adds the marker if absent,
    removes it if present; harmonic and strum variants are mutually exclusive.
    """
    if marker not in ALLOWED_TECHNICAL_MARKERS:
        raise ValueError(
            f"unsupported marker '{marker}'; allowed: {list(ALLOWED_TECHNICAL_MARKERS)}"
        )
    score = _parse(musicxml)
    part = _get_part(score, part_index)
    measure = _get_measure(part, measure_number)
    container = _find_voice_or_measure(measure, voice)
    note = _find_note_at(container, beat_offset)
    if note is None or not isinstance(note, m21note.NotRest):
        raise ValueError(
            f"No note found at part={part_index} measure={measure_number} beat={beat_offset}"
        )

    if marker in ("natural_harmonic", "artificial_harmonic"):
        htype = "natural" if marker == "natural_harmonic" else "artificial"
        had = any(
            isinstance(a, articulations.StringHarmonic) and a.harmonicType == htype
            for a in note.articulations
        )
        # Harmonic type is mutually exclusive — drop any existing one first.
        note.articulations = [
            a for a in note.articulations if not isinstance(a, articulations.StringHarmonic)
        ]
        if had:
            action = "removed"
        else:
            harmonic = articulations.StringHarmonic()
            harmonic.harmonicType = htype
            note.articulations.append(harmonic)
            action = "added"
    elif marker in ("strum_up", "strum_down"):
        direction = "up" if marker == "strum_up" else "down"
        had = any(
            isinstance(e, expressions.ArpeggioMark) and e.type == direction
            for e in note.expressions
        )
        note.expressions = [
            e for e in note.expressions if not isinstance(e, expressions.ArpeggioMark)
        ]
        if had:
            action = "removed"
        else:
            note.expressions.append(expressions.ArpeggioMark(direction))
            action = "added"
    elif marker == "dead_note":
        if note.notehead == "x":
            note.notehead = "normal"
            action = "removed"
        else:
            note.notehead = "x"
            action = "added"
    elif marker == "ghost_note":
        if note.noteheadParenthesis:
            note.noteheadParenthesis = False
            action = "removed"
        else:
            note.noteheadParenthesis = True
            action = "added"
    else:  # vibrato — a single-note wavy line (TrillExtension spanner)
        existing_vib = [
            sp
            for sp in score.recurse().getElementsByClass(expressions.TrillExtension)
            if sp.getFirst() is note
        ]
        if existing_vib:
            for sp in existing_vib:
                score.remove(sp, recurse=True)
            action = "removed"
        else:
            part.insert(0, expressions.TrillExtension(note, note))  # type: ignore[no-untyped-call]
            action = "added"

    return {"musicxml": _serialise(score), "action": action}


def set_bracket_span(
    musicxml: str,
    *,
    part_index: int,
    measure_number: int,
    beat_offset: float,
    technique: str,
    action: str = "set",
    end_measure_number: int | None = None,
    end_beat_offset: float | None = None,
    voice: int | None = None,
) -> dict[str, Any]:
    """Set or clear a bracketed-span technique (palm mute, let ring).

    The cursor addresses the *start* note. ``set`` draws a bracket to the end
    note — given explicitly via ``end_measure_number``/``end_beat_offset``, or
    defaulting to the last note of the start note's measure. ``remove`` clears
    any bracket starting at the note. Follows the ``/tie/set`` start/stop
    discipline; renders as a music21 ``Line`` → MusicXML ``<bracket>`` (ADR-0020).
    """
    if technique not in ALLOWED_BRACKET_SPANS:
        raise ValueError(
            f"unsupported span technique '{technique}'; allowed: {sorted(ALLOWED_BRACKET_SPANS)}"
        )
    if action not in ("set", "remove"):
        raise ValueError(f"action must be 'set' or 'remove', got '{action}'")

    score = _parse(musicxml)
    part = _get_part(score, part_index)
    measure = _get_measure(part, measure_number)
    container = _find_voice_or_measure(measure, voice)
    start = _find_note_at(container, beat_offset)
    if start is None or not isinstance(start, m21note.NotRest):
        raise ValueError(
            f"No note found at part={part_index} measure={measure_number} beat={beat_offset}"
        )

    removed = 0
    for sp in list(score.recurse().getElementsByClass(spanner.Line)):
        if sp.getFirst() is start:
            score.remove(sp, recurse=True)
            removed += 1

    if action == "remove":
        return {
            "musicxml": _serialise(score),
            "action": "removed" if removed else "unchanged",
        }

    if end_measure_number is not None and end_beat_offset is not None:
        end_measure = _get_measure(part, end_measure_number)
        end_container = _find_voice_or_measure(end_measure, voice)
        end = _find_note_at(end_container, end_beat_offset)
    else:
        here = _notrests_in(container)
        end = here[-1] if here else start
    if end is None or not isinstance(end, m21note.NotRest):
        raise ValueError("Could not resolve the end note for the bracketed span.")

    line = spanner.Line(start, end)
    line.lineType = ALLOWED_BRACKET_SPANS[technique]
    part.insert(0, line)  # type: ignore[no-untyped-call]
    return {
        "musicxml": _serialise(score),
        "action": "changed" if removed else "added",
    }


def set_dynamic(
    musicxml: str,
    *,
    part_index: int,
    measure_number: int,
    beat_offset: float,
    dynamic: str,
) -> dict[str, Any]:
    if dynamic not in ALLOWED_DYNAMICS:
        raise ValueError(f"unsupported dynamic '{dynamic}'; allowed: {ALLOWED_DYNAMICS}")
    score = _parse(musicxml)
    part = _get_part(score, part_index)
    measure = _get_measure(part, measure_number)
    existing_dynamics = [
        d
        for d in measure.getElementsByClass(dynamics.Dynamic)
        if abs(float(d.offset) - beat_offset) <= OFFSET_TOLERANCE
    ]
    for d in existing_dynamics:
        measure.remove(d)
    marker = dynamics.Dynamic(dynamic)  # type: ignore[no-untyped-call]
    measure.insert(beat_offset, marker)  # type: ignore[no-untyped-call]
    return {"musicxml": _serialise(score)}


def get_note_info(
    musicxml: str,
    *,
    part_index: int,
    measure_number: int,
    beat_offset: float,
    voice: int | None = None,
) -> dict[str, Any]:
    """Return metadata for the note at a score position (for the edit overlay)."""
    score = _parse(musicxml)
    part = _get_part(score, part_index)
    measure = _get_measure(part, measure_number)
    container = _find_voice_or_measure(measure, voice)
    existing = _find_note_at(container, beat_offset)
    if existing is None or not isinstance(existing, m21note.NotRest):
        raise ValueError(
            f"No note found at part={part_index} measure={measure_number} beat={beat_offset}"
        )

    part_name = str(getattr(part, "partName", None) or f"Part {part_index + 1}")
    articulations_list = (
        [type(a).__name__.lower() for a in existing.articulations]
        if isinstance(existing, m21note.Note)
        else []
    )
    expressions_list = (
        [type(e).__name__.lower() for e in existing.expressions]
        if isinstance(existing, m21note.Note)
        else []
    )

    pitch_name: str | None = None
    midi_val: int | None = None
    if isinstance(existing, m21note.Note):
        pitch_name = existing.pitch.nameWithOctave
        midi_val = int(existing.pitch.midi)

    return {
        "part_index": part_index,
        "measure_number": measure_number,
        "beat_offset": beat_offset,
        "voice": voice,
        "part_name": part_name,
        "pitch": pitch_name,
        "midi": midi_val,
        "duration_quarters": float(existing.duration.quarterLength),
        "articulations": articulations_list + expressions_list,
        "is_rest": isinstance(existing, m21note.Rest),
    }


def change_note_duration(
    musicxml: str,
    *,
    part_index: int,
    measure_number: int,
    beat_offset: float,
    duration_quarters: float,
    voice: int | None = None,
) -> dict[str, Any]:
    if duration_quarters <= 0:
        raise ValueError("duration_quarters must be positive")
    score = _parse(musicxml)
    part = _get_part(score, part_index)
    measure = _get_measure(part, measure_number)
    container = _find_voice_or_measure(measure, voice)
    existing = _find_note_at(container, beat_offset)
    if existing is None or not isinstance(existing, m21note.NotRest):
        raise ValueError(
            f"No note found at part={part_index} measure={measure_number} beat={beat_offset}"
        )
    existing.duration = m21duration.Duration(duration_quarters)
    return {"musicxml": _serialise(score)}


def respell_note(
    musicxml: str,
    *,
    part_index: int,
    measure_number: int,
    beat_offset: float,
    voice: int | None = None,
) -> dict[str, Any]:
    """Toggle enharmonic spelling for the note at the given position."""
    score = _parse(musicxml)
    part = _get_part(score, part_index)
    measure = _get_measure(part, measure_number)
    container = _find_voice_or_measure(measure, voice)
    existing = _find_note_at(container, beat_offset)
    if existing is None or not isinstance(existing, m21note.Note):
        raise ValueError(
            f"No note found at part={part_index} measure={measure_number} beat={beat_offset}"
        )
    existing.pitch = existing.pitch.getEnharmonic()
    return {
        "musicxml": _serialise(score),
        "pitch": existing.pitch.nameWithOctave,
    }


def change_note_pitch(
    musicxml: str,
    *,
    part_index: int,
    measure_number: int,
    beat_offset: float,
    pitch: str,
    voice: int | None = None,
) -> dict[str, Any]:
    """Replace the note or chord at ``beat_offset`` with a single pitched note."""
    score = _parse(musicxml)
    part = _get_part(score, part_index)
    measure = _get_measure(part, measure_number)
    container = _find_voice_or_measure(measure, voice)
    existing = _find_note_at(container, beat_offset)
    if existing is None or not isinstance(existing, m21note.NotRest):
        raise ValueError(
            f"No note found at part={part_index} measure={measure_number} beat={beat_offset}"
        )
    dur = float(existing.duration.quarterLength)
    new_note = _make_note(pitch, dur)
    container.replace(existing, new_note)
    return {
        "musicxml": _serialise(score),
        "pitch": new_note.pitch.nameWithOctave,
    }


def transpose_note_semitones(
    musicxml: str,
    *,
    part_index: int,
    measure_number: int,
    beat_offset: float,
    semitones: int,
    voice: int | None = None,
) -> dict[str, Any]:
    """Move the top pitch of a note/chord up or down by ``semitones``."""
    if semitones == 0:
        raise ValueError("semitones must be non-zero")
    score = _parse(musicxml)
    part = _get_part(score, part_index)
    measure = _get_measure(part, measure_number)
    container = _find_voice_or_measure(measure, voice)
    existing = _find_note_at(container, beat_offset)
    if existing is None or not isinstance(existing, m21note.NotRest):
        raise ValueError(
            f"No note found at part={part_index} measure={measure_number} beat={beat_offset}"
        )
    if isinstance(existing, m21chord.Chord):
        top = existing.sortAscending().pitches[-1]
        transposed = top.transpose(semitones, inPlace=False)
        dur = float(existing.duration.quarterLength)
        new_note = _make_note(transposed.nameWithOctave, dur)
        container.replace(existing, new_note)
        return {"musicxml": _serialise(score), "pitch": transposed.nameWithOctave}
    if isinstance(existing, m21note.Note):
        transposed = existing.pitch.transpose(semitones, inPlace=False)
        existing.pitch = transposed
        return {"musicxml": _serialise(score), "pitch": transposed.nameWithOctave}
    raise ValueError("Cannot transpose a rest.")


def set_key_signature(
    musicxml: str,
    *,
    tonic: str,
    mode: str = "major",
) -> dict[str, Any]:
    """Apply a key signature to the first measure of every part."""
    score = _parse(musicxml)
    ks = key.Key(tonic, mode)
    for part in score.parts:
        measures = list(part.getElementsByClass(stream.Measure))
        if not measures:
            continue
        first = measures[0]
        for existing in list(first.getElementsByClass(key.KeySignature)):
            first.remove(existing)
        first.insert(0, ks)
    return {
        "musicxml": _serialise(score),
        "key": f"{tonic} {mode}",
    }


def _beat_hint_distance(note_beat: float, hint: float) -> float:
    """Compare a music21 beat to a hint that may be quarters or a measure fraction."""
    return min(abs(note_beat - h) for h in (hint, hint * 4.0, hint / 4.0))


def find_note_by_hint(
    musicxml: str,
    *,
    measure_number: int,
    pitch: str,
    beat_hint: float,
) -> dict[str, Any]:
    """Resolve the authoritative score position for a visual note click."""
    notes = list_notes(musicxml)["notes"]
    in_measure = [n for n in notes if int(n["measure_number"]) == measure_number]
    if not in_measure:
        raise ValueError(f"No notes in measure {measure_number}")

    primary = pitch.split("-")[0].strip()
    pitch_hits = [
        n
        for n in in_measure
        if n["pitch"] == pitch
        or str(n["pitch"]).startswith(f"{primary}-")
        or primary in str(n["pitch"]).split("-")
    ]
    pool = pitch_hits or in_measure
    return min(pool, key=lambda n: _beat_hint_distance(float(n["beat_offset"]), beat_hint))


def list_notes(musicxml: str) -> dict[str, Any]:
    """Enumerate every pitched note in score order (for SVG annotation)."""
    score = _parse(musicxml)
    out: list[dict[str, Any]] = []
    for part_idx, part in enumerate(score.parts):
        part_name = str(getattr(part, "partName", None) or f"Part {part_idx + 1}")
        for measure in part.getElementsByClass(stream.Measure):
            voices = list(measure.voices)
            # When MusicXML has <backup> elements, music21 stores notes inside
            # Voice sub-streams; measure.notesAndRests returns [] in that case.
            sources: list[tuple[stream.Stream[Any], int | None]] = (
                [(v, _voice_id(v)) for v in voices] if voices else [(measure, None)]
            )
            for container, voice_id in sources:
                for el in container.notesAndRests:
                    if isinstance(el, m21note.Note):
                        out.append(
                            {
                                "part_index": part_idx,
                                "measure_number": int(measure.number),
                                "beat_offset": float(el.offset),
                                "voice": voice_id,
                                "part_name": part_name,
                                "pitch": el.pitch.nameWithOctave,
                                "midi": int(el.pitch.midi),
                                "duration_quarters": float(el.duration.quarterLength),
                            }
                        )
                    elif isinstance(el, m21chord.Chord):
                        pitches = "-".join(p.nameWithOctave for p in el.pitches)
                        top = el.sortAscending().pitches[-1] if el.pitches else None
                        out.append(
                            {
                                "part_index": part_idx,
                                "measure_number": int(measure.number),
                                "beat_offset": float(el.offset),
                                "voice": voice_id,
                                "part_name": part_name,
                                "pitch": pitches,
                                "midi": int(top.midi) if top is not None else None,
                                "duration_quarters": float(el.duration.quarterLength),
                            }
                        )
    return {"notes": out}


def append_measure(
    musicxml: str,
    *,
    part_index: int,
) -> dict[str, Any]:
    """Append a single empty measure (with a single whole-measure rest) to part."""
    score = _parse(musicxml)
    part = _get_part(score, part_index)
    measures = list(part.getElementsByClass(stream.Measure))
    if not measures:
        raise ValueError("Part has no measures to extend.")
    last = measures[-1]
    new_measure = stream.Measure(number=int(last.number) + 1)
    new_measure.timeSignature = last.timeSignature
    rest_len = (
        float(last.timeSignature.barDuration.quarterLength)
        if last.timeSignature is not None
        else 4.0
    )
    rest = m21note.Rest()
    rest.duration = m21duration.Duration(rest_len)
    new_measure.append(rest)  # type: ignore[no-untyped-call]
    part.append(new_measure)  # type: ignore[no-untyped-call]
    return {
        "musicxml": _serialise(score),
        "new_measure_number": int(new_measure.number),
    }
