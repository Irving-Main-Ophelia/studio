"""Range validator: warn when notes fall outside the part's practical range."""

from __future__ import annotations

from typing import Any

from music21 import note

from stockhausen_theory.instrument_ranges import range_for_part
from stockhausen_theory.score_io import parse_score


def validate_range(musicxml: str) -> dict[str, Any]:
    """Flag notes outside their part's idiomatic range.

    Each warning carries the offending pitch + its measure/beat so the
    UI can highlight it directly. Pillar-2 transposition merges these
    warnings into the diff envelope.
    """
    score = parse_score(musicxml)
    parts = list(score.parts) if score.parts else [score]
    warnings: list[dict[str, Any]] = []
    for idx, part in enumerate(parts):
        ir = range_for_part(part)
        if ir is None:
            continue
        for n in part.flatten().notes:
            if not isinstance(n, note.Note):
                continue
            midi = int(n.pitch.midi)
            measure_obj = n.getContextByClass("Measure")
            location = {
                "part_index": idx,
                "measure": int(measure_obj.number) if measure_obj is not None else 1,
                "beat": float(n.beat),
                "pitch": n.pitch.nameWithOctave,
            }
            if midi < ir.lowest_midi:
                warnings.append(
                    {
                        "kind": "below_range",
                        "instrument": part.partName,
                        "location": location,
                        "expected_min": ir.lowest_name,
                    }
                )
            elif midi > ir.highest_midi:
                warnings.append(
                    {
                        "kind": "above_range",
                        "instrument": part.partName,
                        "location": location,
                        "expected_max": ir.highest_name,
                    }
                )
    return {"warnings": warnings}
