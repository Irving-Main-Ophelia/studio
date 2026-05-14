"""Per-part range analysis + instrument-range lookup.

Returns the lowest/highest pitch per part plus a comparison against a
canonical instrument range table. Used by Pillar-2 transposition to warn
when a target key pushes notes out of range.
"""

from __future__ import annotations

from typing import Any

from music21 import note

from stockhausen_theory.instrument_ranges import INSTRUMENT_RANGE, range_for_part
from stockhausen_theory.score_io import parse_score


def analyze_range(musicxml: str) -> dict[str, Any]:
    """Return per-part lowest and highest sounding pitch + range warnings.

    Output shape::

        {
            "parts": [
                {
                    "part_index": 0,
                    "name": "Violin",
                    "lowest": "G3",
                    "highest": "A6",
                    "instrument_range": {"lowest": "G3", "highest": "E7"},
                    "warnings": []
                },
                ...
            ]
        }
    """
    score = parse_score(musicxml)
    parts = list(score.parts) if score.parts else [score]
    out: list[dict[str, Any]] = []
    for idx, part in enumerate(parts):
        notes = [n for n in part.flatten().notes if isinstance(n, note.Note)]
        if not notes:
            continue
        lowest = min(notes, key=lambda n: n.pitch.midi).pitch
        highest = max(notes, key=lambda n: n.pitch.midi).pitch
        name = part.partName or "Unknown"
        ir = range_for_part(part)
        warnings: list[str] = []
        if ir is not None:
            if int(lowest.midi) < ir.lowest_midi:
                warnings.append(
                    f"Lowest note {lowest.nameWithOctave} sits below typical "
                    f"{name} range ({ir.lowest_name}).",
                )
            if int(highest.midi) > ir.highest_midi:
                warnings.append(
                    f"Highest note {highest.nameWithOctave} sits above typical "
                    f"{name} range ({ir.highest_name}).",
                )
        out.append(
            {
                "part_index": idx,
                "name": name,
                "lowest": lowest.nameWithOctave,
                "highest": highest.nameWithOctave,
                "instrument_range": (
                    {"lowest": ir.lowest_name, "highest": ir.highest_name}
                    if ir is not None
                    else None
                ),
                "warnings": warnings,
            }
        )
    return {"parts": out, "known_instruments": sorted(INSTRUMENT_RANGE)}
