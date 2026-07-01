"""Auto chord-diagram derivation (Phase 4 / Track A — A5 follow-up, §4.7 Q2).

Derives fret-grid **chord diagrams** to show above the staff, with a GP8-style
**density** control (opt-in, off by default). Chord figures come from the
whole-score harmony (shared with the lead-sheet projection); each figure is voiced
by the algorithmic chord engine (``guitar_engine.chord_voicings``) against the part's
tuning/capo, then flattened to a per-string diagram the SVG strip renders.

Unlike the tab and lead-sheet *projections*, this returns diagram **data**, not view
MusicXML: OSMD does not render MusicXML ``<frame>`` fret diagrams, so the diagrams are
drawn by an SVG annotation strip (the same class of aux view as the A4 fretboard).
OSMD stays the single staff renderer (ADR-0015/0019 intact).
"""

from __future__ import annotations

from typing import Any

from stockhausen_theory.score_io import parse_score

from app.tools.fretboard import STANDARD_TUNING
from app.tools.guitar_engine import chord_voicings

# Shared whole-score harmony extraction (one identifiable chord per measure).
from app.tools.leadsheet_projection import _measure_chord_figures

# GP8-style density: fewer diagrams = less clutter. `off` is handled client-side
# (no request is made), so it is not a server value.
DENSITIES = ("all", "changes", "unique")

MUTED = -1  # per-string sentinel: string not played in the voicing


def _select_measures(figures: dict[int, str], density: str) -> list[tuple[int, str]]:
    """Pick which (measure, figure) pairs get a diagram, honouring the density."""
    ordered = sorted(figures.items())
    if density == "all":
        return ordered
    if density == "changes":
        out: list[tuple[int, str]] = []
        prev: str | None = None
        for mnum, fig in ordered:
            if fig != prev:
                out.append((mnum, fig))
                prev = fig
        return out
    # "unique": the first occurrence of each distinct figure, in measure order —
    # a chord legend at the top of the sheet (GP8's default diagram summary).
    seen: set[str] = set()
    out = []
    for mnum, fig in ordered:
        if fig not in seen:
            seen.add(fig)
            out.append((mnum, fig))
    return out


def _diagram_for(
    figure: str, tuning: list[str], capo: int, max_fret: int
) -> dict[str, Any] | None:
    """Best voicing of ``figure`` as a per-string diagram, or ``None`` if unplayable."""
    result = chord_voicings(
        figure, tuning=tuning, capo=capo, max_fret=max_fret, max_voicings=1
    )
    voicings = result["voicings"]
    if not voicings:
        return None
    best = voicings[0]
    frets = [MUTED] * len(tuning)  # string 1 (highest) first; MUTED = not played
    for pos in best["positions"]:
        frets[pos["string"] - 1] = pos["fret"]
    return {
        "chord": figure,
        "base_fret": best["base_fret"],
        "frets": frets,
        "difficulty": best["difficulty"],
    }


def chord_diagrams(
    musicxml: str,
    *,
    tuning: list[str] | None = None,
    capo: int = 0,
    density: str = "changes",
    max_fret: int = 15,
) -> dict[str, Any]:
    """Auto chord diagrams for a score, one per selected measure (A5 §4.7 Q2).

    Chord figures are read from the whole-score harmony, thinned by ``density``, then
    voiced against ``tuning``/``capo``. Unplayable figures are skipped. Returns the
    diagram list (measure order) plus the count and the density used.
    """
    if density not in DENSITIES:
        raise ValueError(f"unsupported density {density!r}; allowed: {DENSITIES}")
    tuning = list(tuning) if tuning else list(STANDARD_TUNING)
    score = parse_score(musicxml)
    figures = _measure_chord_figures(score)

    diagrams: list[dict[str, Any]] = []
    for mnum, fig in _select_measures(figures, density):
        diagram = _diagram_for(fig, tuning, capo, max_fret)
        if diagram is None:
            continue
        diagram["measure"] = mnum
        diagrams.append(diagram)
    return {"diagrams": diagrams, "count": len(diagrams), "density": density}
