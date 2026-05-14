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

from music21 import articulations, dynamics, expressions, stream
from music21 import base as m21base
from music21 import duration as m21duration
from music21 import note as m21note
from music21 import pitch as m21pitch
from music21 import tie as m21tie

from .theory import _parse

TieType = Literal["start", "stop", "continue", "none"]

# Quarter-note tolerance for "this offset matches that note". 1/250 of a beat
# is well below 1 ms at any practical tempo and survives music21's float
# rounding when notes round-trip through MusicXML divisions.
OFFSET_TOLERANCE = 1e-3

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


def _serialise(score: stream.Score) -> str:
    """music21 only serialises through a file. Read it back and return."""
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
        if int(v.id) == voice_id:
            return cast("stream.Stream[Any]", v)
    raise ValueError(f"measure has no voice {voice_id}; voices: {[v.id for v in voices]}")


def _find_note_at(
    container: stream.Stream[Any],
    beat_offset: float,
    tolerance: float = OFFSET_TOLERANCE,
) -> m21note.GeneralNote | None:
    """Look up the note or rest whose offset is closest to ``beat_offset``."""
    candidates = list(container.notesAndRests)
    if not candidates:
        return None
    best: tuple[float, m21note.GeneralNote] | None = None
    for el in candidates:
        delta = abs(float(el.offset) - beat_offset)
        if delta <= tolerance and (best is None or delta < best[0]):
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
    if existing is None or not isinstance(existing, m21note.Note):
        raise ValueError(
            f"No note found at part={part_index} measure={measure_number} beat={beat_offset}"
        )

    cls = ALLOWED_ARTICULATIONS[articulation]
    # Fermata is an Expression; everything else is an Articulation. Both live
    # on the Note, but on different lists.
    if issubclass(cls, expressions.Expression):
        cls_expr: type[expressions.Expression] = cls
        present_e = [a for a in existing.expressions if isinstance(a, cls_expr)]
        if present_e:
            existing.expressions = [a for a in existing.expressions if not isinstance(a, cls_expr)]
            action = "removed"
        else:
            existing.expressions.append(cls_expr())
            action = "added"
    else:
        cls_art = cast(type[articulations.Articulation], cls)
        present_a = [a for a in existing.articulations if isinstance(a, cls_art)]
        if present_a:
            existing.articulations = [
                a for a in existing.articulations if not isinstance(a, cls_art)
            ]
            action = "removed"
        else:
            existing.articulations.append(cls_art())
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
