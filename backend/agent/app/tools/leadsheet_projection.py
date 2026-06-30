"""Lead-sheet view projection (Phase 4 / Track A — A8).

Derives a *view* of a part as a lead sheet: rhythmic **slash** noteheads plus
**chord symbols** above the staff, the way a guitarist reads changes. Like the tab
projection (A1), the canonical score stays standard notation and stays the single
source of truth (ADR-0015); this is an on-demand projection that round-trips through
MusicXML (``<harmony>`` + ``<notehead>slash</notehead>``, both OSMD renders).

Chord symbols are derived from the **whole score's** harmony (chordify), so a melody
or comping part gets the real changes — not a chord guessed from its own line. This
is opt-in per part (PHASE_4 §4.7 Q2: lead-sheet mode is for parts that are "just
changes", not the maintainer's contrapuntal default).
"""

from __future__ import annotations

from typing import Any

from music21 import chord as m21chord
from music21 import harmony
from music21 import stream

from stockhausen_theory.score_io import parse_score, serialise_score

_UNIDENTIFIED = "Cannot Be Identified"


def _measure_chord_figures(score: stream.Score) -> dict[int, str]:
    """First identifiable chord symbol of each measure, from the full-score harmony."""
    figures: dict[int, str] = {}
    try:
        chordified = score.chordify()
    except Exception:  # noqa: BLE001 — degenerate scores
        return figures
    for c in chordified.recurse().getElementsByClass(m21chord.Chord):
        measure_obj = c.getContextByClass(stream.Measure)
        if measure_obj is None:
            continue
        mnum = int(measure_obj.number)
        if mnum in figures:
            continue  # one symbol per measure (downbeat) keeps the sheet readable
        try:
            fig = harmony.chordSymbolFigureFromChord(c)
        except Exception:  # noqa: BLE001 — music21 raises a wide set
            continue
        if fig and _UNIDENTIFIED not in fig:
            figures[mnum] = fig
    return figures


def project_leadsheet(
    musicxml: str,
    *,
    part_index: int = 0,
    slashes: bool = True,
    chords: bool = True,
) -> dict[str, Any]:
    """Return a lead-sheet view of ``part_index``: slash noteheads + chord symbols.

    ``slashes`` turns noteheads into rhythmic slashes; ``chords`` adds ``<harmony>``
    chord symbols above the staff. Returns the view MusicXML plus the count of
    chord symbols placed.
    """
    score = parse_score(musicxml)
    parts = list(score.parts) if score.parts else [score]
    if not (0 <= part_index < len(parts)):
        raise ValueError(f"part_index {part_index} out of range (0..{len(parts) - 1})")
    part = parts[part_index]

    figures = _measure_chord_figures(score) if chords else {}
    placed = 0
    for measure in part.getElementsByClass(stream.Measure):
        mnum = int(measure.number)
        if chords and mnum in figures:
            try:
                measure.insert(0, harmony.ChordSymbol(figures[mnum]))
                placed += 1
            except Exception:  # noqa: BLE001 — skip a figure music21 won't build
                pass
        if slashes:
            for n in measure.notes:
                n.notehead = "slash"

    return {"musicxml": serialise_score(score), "chord_symbols": placed}
