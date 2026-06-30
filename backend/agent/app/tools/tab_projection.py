"""Project a canonical (standard-notation) MusicXML score into a tablature view
for OSMD to render (Phase 4 / Track A — A1).

The canonical score in ``ScoreEngine`` stays standard notation and stays the single
source of truth (ADR-0015); this module derives a *view-specific* MusicXML on demand:

- ``staff`` — the input unchanged (standard staff; today's behaviour).
- ``tab``   — the target part becomes a single tab staff (TAB clef + ``<staff-details>``
              line count + per-note ``<string>``/``<fret>``).
- ``both``  — the target part becomes two staves: staff 1 standard notation, staff 2 tab.

OSMD renders a tab staff via VexFlow's ``TabStave`` whenever a staff's clef is
``TAB``; it reads the line count from ``<staff-details><staff-lines>`` and the fret
numbers from each note's ``<technical><string>/<fret>``. music21 exports the TAB clef
and ``<string>/<fret>`` but **not** ``<staff-details>``, so we inject it here.

We operate at the XML level (``xml.etree.ElementTree``) rather than round-tripping
through music21: the canonical part is left byte-for-byte intact in ``both`` view, and
we never risk music21 re-serialisation altering the score the maintainer edits.

A note that already carries an authored ``<string>/<fret>`` (e.g. an imported Guitar
Pro part) keeps it; computed positions only fill the gaps.
"""

from __future__ import annotations

import copy
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from typing import Any

from app.tools.fretboard import (
    DEFAULT_MAX_FRET,
    STANDARD_TUNING,
    assign_fret,
    pitch_name_to_midi,
    step_alter_octave_to_midi,
)

VIEW_MODES = ("staff", "tab", "both")


@dataclass
class PartView:
    """A single part's requested notation view."""

    part_index: int
    view_mode: str
    tuning: list[str] = field(default_factory=lambda: list(STANDARD_TUNING))
    capo: int = 0
    max_fret: int = DEFAULT_MAX_FRET

# Voice-number offset for the derived tab staff in ``both`` view, so its voices stay
# distinct from the notation staff's (MusicXML voices are unique within a part).
_TAB_VOICE_OFFSET = 10


def project_views(musicxml: str, specs: list[PartView]) -> str:
    """Project several parts at once, each into its own ``view_mode``.

    Parts requesting ``staff`` are left untouched. If no part needs a tab view the
    input is returned verbatim (cheap no-op for an all-staff score).
    """
    for spec in specs:
        if spec.view_mode not in VIEW_MODES:
            raise ValueError(f"unsupported view_mode {spec.view_mode!r}; allowed: {VIEW_MODES}")
    active = [s for s in specs if s.view_mode != "staff"]
    if not active:
        return musicxml

    root = ET.fromstring(musicxml)
    parts = root.findall("part")
    if not parts:
        raise ValueError("no <part> in score")
    for spec in active:
        if not (0 <= spec.part_index < len(parts)):
            raise ValueError(
                f"part_index {spec.part_index} out of range (0..{len(parts) - 1})"
            )
        _apply_to_part(parts[spec.part_index], spec)

    return '<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(root, encoding="unicode")


def project_view(
    musicxml: str,
    *,
    part_index: int = 0,
    view_mode: str,
    tuning: list[str] | None = None,
    capo: int = 0,
    max_fret: int = DEFAULT_MAX_FRET,
) -> str:
    """Return MusicXML projected into ``view_mode`` for the part at ``part_index``."""
    if view_mode not in VIEW_MODES:
        raise ValueError(f"unsupported view_mode {view_mode!r}; allowed: {VIEW_MODES}")
    return project_views(
        musicxml,
        [
            PartView(
                part_index=part_index,
                view_mode=view_mode,
                tuning=list(tuning) if tuning else list(STANDARD_TUNING),
                capo=capo,
                max_fret=max_fret,
            )
        ],
    )


def reassign_fret_positions(
    musicxml: str,
    *,
    part_index: int,
    tuning: list[str] | None = None,
    capo: int = 0,
    max_fret: int = DEFAULT_MAX_FRET,
) -> dict[str, Any]:
    """Recompute every note's ``<string>/<fret>`` in a part from its current pitch.

    This is the tab side of Pillar-2 respelling (PHASE_4 A3): after a transposition
    or a tuning/capo change, fretboard positions must follow the new pitches and the
    part's tuning. Unlike the tab *projection* — which preserves an authored position
    — this **rewrites** positions, so it is an explicit edit of the canonical score.
    A note unplayable in the tuning loses its position rather than misstate the pitch.

    Returns the new MusicXML plus counts of positions reassigned and cleared.
    """
    tuning = list(tuning) if tuning else list(STANDARD_TUNING)
    root = ET.fromstring(musicxml)
    parts = root.findall("part")
    if not parts:
        raise ValueError("no <part> in score")
    if not (0 <= part_index < len(parts)):
        raise ValueError(f"part_index {part_index} out of range (0..{len(parts) - 1})")

    reassigned = 0
    cleared = 0
    for measure in parts[part_index].findall("measure"):
        for note in measure.findall("note"):
            pitch = note.find("pitch")
            if pitch is None:  # rest
                continue
            step = (pitch.findtext("step") or "").strip()
            octave_txt = pitch.findtext("octave")
            if not step or octave_txt is None:
                continue
            alter = int(float(pitch.findtext("alter") or "0"))
            midi = step_alter_octave_to_midi(step, alter, int(octave_txt))
            pos = assign_fret(midi, tuning, capo, max_fret)

            technical = _find_or_none_technical(note)
            if technical is not None:
                for tag in ("string", "fret"):
                    for el in technical.findall(tag):
                        technical.remove(el)

            if pos is None:
                cleared += 1
                continue

            if technical is None:
                notations = note.find("notations")
                if notations is None:
                    notations = ET.Element("notations")
                    _insert_before_lyric(note, notations)
                technical = ET.SubElement(notations, "technical")
            s = ET.SubElement(technical, "string")
            s.text = str(pos.string)
            f = ET.SubElement(technical, "fret")
            f.text = str(pos.fret)
            reassigned += 1

    out = '<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(root, encoding="unicode")
    return {"musicxml": out, "reassigned": reassigned, "cleared": cleared}


def _apply_to_part(part: ET.Element, spec: PartView) -> None:
    tuning = spec.tuning or list(STANDARD_TUNING)
    if spec.view_mode == "tab":
        _project_part_to_tab(part, tuning, spec.capo, spec.max_fret)
    elif spec.view_mode == "both":
        _project_part_to_both(part, tuning, spec.capo, spec.max_fret)


# --------------------------------------------------------------------------- #
# tab view — single tab staff
# --------------------------------------------------------------------------- #


def _project_part_to_tab(
    part: ET.Element, tuning: list[str], capo: int, max_fret: int
) -> None:
    for measure in part.findall("measure"):
        attrs = measure.find("attributes")
        if attrs is not None:
            _make_clef_tab(attrs, len(tuning), tuning, number=None)
        for note in measure.findall("note"):
            _ensure_tab_position(note, tuning, capo, max_fret)


# --------------------------------------------------------------------------- #
# both view — notation staff (1) + tab staff (2)
# --------------------------------------------------------------------------- #


def _project_part_to_both(
    part: ET.Element, tuning: list[str], capo: int, max_fret: int
) -> None:
    for measure in part.findall("measure"):
        attrs = measure.find("attributes")
        if attrs is not None:
            _set_two_staves(attrs, len(tuning), tuning)

        # Capture the original timed sequence (notes + backups + forwards) in order,
        # *before* mutating, so the staff-2 copy reproduces multi-voice timing exactly.
        timed = [c for c in list(measure) if c.tag in ("note", "backup", "forward")]

        # Tag the existing (notation) content as staff 1.
        for child in timed:
            if child.tag == "note":
                _set_staff(child, 1)

        # Build the parallel tab staff: a backup to the measure start, then a clone of
        # the whole timed sequence routed to staff 2 (notes get a fret position).
        measure_duration = _measure_duration(measure)
        if measure_duration > 0:
            backup = ET.Element("backup")
            dur = ET.SubElement(backup, "duration")
            dur.text = str(measure_duration)
            measure.append(backup)
        for child in timed:
            clone = copy.deepcopy(child)
            if clone.tag == "note":
                _set_staff(clone, 2)
                _offset_voice(clone, _TAB_VOICE_OFFSET)
                _ensure_tab_position(clone, tuning, capo, max_fret)
            measure.append(clone)


def _measure_duration(measure: ET.Element) -> int:
    """Net cursor advance across a measure, in divisions (= measure length).

    Non-chord notes and ``<forward>`` advance the cursor; ``<backup>`` retreats it;
    chord notes share the previous note's time and do not advance.
    """
    total = 0
    for child in measure:
        if child.tag == "note":
            if child.find("chord") is not None:
                continue
            total += _duration_of(child)
        elif child.tag == "forward":
            total += _duration_of(child)
        elif child.tag == "backup":
            total -= _duration_of(child)
    return total


def _duration_of(el: ET.Element) -> int:
    d = el.find("duration")
    if d is None or not d.text:
        return 0
    try:
        return int(float(d.text))
    except ValueError:
        return 0


# --------------------------------------------------------------------------- #
# element helpers
# --------------------------------------------------------------------------- #


def _make_clef_tab(
    attrs: ET.Element, lines: int, tuning: list[str], number: int | None
) -> None:
    """Turn the (single) clef in ``attrs`` into a TAB clef and add staff-details."""
    clef = attrs.find("clef")
    if clef is None:
        clef = ET.SubElement(attrs, "clef")
    if number is not None:
        clef.set("number", str(number))
    _set_child_text(clef, "sign", "TAB")
    _set_child_text(clef, "line", "5")
    # A tab clef carries no octave change.
    oc = clef.find("clef-octave-change")
    if oc is not None:
        clef.remove(oc)
    _insert_staff_details(attrs, lines, tuning, number)


def _set_two_staves(attrs: ET.Element, lines: int, tuning: list[str]) -> None:
    """Make ``attrs`` describe two staves: notation (1) + tab (2)."""
    # <staves> goes after <time>, before <clef> (DTD order).
    if attrs.find("staves") is None:
        staves = ET.Element("staves")
        staves.text = "2"
        idx = _last_index(attrs, ("divisions", "key", "time")) + 1
        attrs.insert(idx, staves)
    else:
        attrs.find("staves").text = "2"

    # Number the existing clef as staff 1, then add a TAB clef for staff 2.
    clef1 = attrs.find("clef")
    if clef1 is not None and clef1.get("number") is None:
        clef1.set("number", "1")
    tab_clef = ET.Element("clef")
    tab_clef.set("number", "2")
    _set_child_text(tab_clef, "sign", "TAB")
    _set_child_text(tab_clef, "line", "5")
    # Insert the tab clef right after the last existing clef.
    clefs = attrs.findall("clef")
    insert_at = list(attrs).index(clefs[-1]) + 1 if clefs else len(list(attrs))
    attrs.insert(insert_at, tab_clef)
    _insert_staff_details(attrs, lines, tuning, number=2)


def _insert_staff_details(
    attrs: ET.Element, lines: int, tuning: list[str], number: int | None
) -> None:
    """Insert ``<staff-details>`` (line count + per-string tuning) after the clefs."""
    details = ET.Element("staff-details")
    if number is not None:
        details.set("number", str(number))
    sl = ET.SubElement(details, "staff-lines")
    sl.text = str(lines)
    # staff-tuning line 1 = bottom = lowest (last) string; line N = top = string 1.
    for line in range(1, len(tuning) + 1):
        pitch_name = tuning[len(tuning) - line]
        midi = pitch_name_to_midi(pitch_name)
        st = ET.SubElement(details, "staff-tuning")
        st.set("line", str(line))
        _set_child_text(st, "tuning-step", pitch_name[0].upper())
        _set_child_text(st, "tuning-octave", str(midi // 12 - 1))
    # staff-details comes after <clef> in DTD order.
    clefs = attrs.findall("clef")
    insert_at = list(attrs).index(clefs[-1]) + 1 if clefs else len(list(attrs))
    attrs.insert(insert_at, details)


def _ensure_tab_position(
    note: ET.Element, tuning: list[str], capo: int, max_fret: int
) -> None:
    """Add ``<technical><string>/<fret>`` to a pitched note, unless it already has it."""
    pitch = note.find("pitch")
    if pitch is None:  # rest
        return
    technical = _find_or_none_technical(note)
    if technical is not None and technical.find("string") is not None:
        return  # authored position wins

    step = (pitch.findtext("step") or "").strip()
    octave_txt = pitch.findtext("octave")
    if not step or octave_txt is None:
        return
    alter = int(float(pitch.findtext("alter") or "0"))
    midi = step_alter_octave_to_midi(step, alter, int(octave_txt))
    pos = assign_fret(midi, tuning, capo, max_fret)
    if pos is None:
        return  # unplayable in this tuning; leave position-less rather than misstate it

    if technical is None:
        notations = note.find("notations")
        if notations is None:
            notations = ET.Element("notations")
            _insert_before_lyric(note, notations)
        technical = ET.SubElement(notations, "technical")
    s = ET.SubElement(technical, "string")
    s.text = str(pos.string)
    f = ET.SubElement(technical, "fret")
    f.text = str(pos.fret)


def _find_or_none_technical(note: ET.Element) -> ET.Element | None:
    notations = note.find("notations")
    return notations.find("technical") if notations is not None else None


def _set_staff(note: ET.Element, staff: int) -> None:
    el = note.find("staff")
    if el is None:
        el = ET.Element("staff")
        _insert_before(note, el, ("beam", "notations", "lyric"))
    el.text = str(staff)


def _offset_voice(note: ET.Element, offset: int) -> None:
    voice = note.find("voice")
    if voice is not None and voice.text:
        try:
            voice.text = str(int(voice.text) + offset)
        except ValueError:
            pass


def _insert_before_lyric(note: ET.Element, el: ET.Element) -> None:
    _insert_before(note, el, ("lyric", "play"))


def _insert_before(parent: ET.Element, el: ET.Element, before_tags: tuple[str, ...]) -> None:
    """Insert ``el`` before the first child whose tag is in ``before_tags``, else append."""
    children = list(parent)
    for i, child in enumerate(children):
        if child.tag in before_tags:
            parent.insert(i, el)
            return
    parent.append(el)


def _set_child_text(parent: ET.Element, tag: str, text: str) -> None:
    child = parent.find(tag)
    if child is None:
        child = ET.SubElement(parent, tag)
    child.text = text


def _last_index(parent: ET.Element, tags: tuple[str, ...]) -> int:
    """Index of the last child whose tag is in ``tags`` (-1 if none)."""
    last = -1
    for i, child in enumerate(parent):
        if child.tag in tags:
            last = i
    return last
