"""Rhythm validator: check that each measure's durations fit the time signature.

A measure where the sum of beats doesn't equal `beats_per_bar` is almost
always a notation mistake we want to surface — though we also tolerate
upbeat (pickup) measures.
"""

from __future__ import annotations

from typing import Any

from music21 import meter, stream

from stockhausen_theory.score_io import parse_score

TOLERANCE = 1e-3


def validate_rhythm(musicxml: str) -> dict[str, Any]:
    """Flag measures whose total duration disagrees with the time signature.

    Pickup (anacrusis) measures — the *first* measure of a part when its
    duration is shorter than the time signature — are tolerated silently;
    everything else gets flagged.
    """
    score = parse_score(musicxml)
    parts = list(score.parts) if score.parts else [score]
    warnings: list[dict[str, Any]] = []
    for idx, part in enumerate(parts):
        ts: Any = None
        for i, measure in enumerate(part.getElementsByClass(stream.Measure)):
            for s in measure.getElementsByClass(meter.TimeSignature):
                ts = s
            if ts is None:
                continue
            expected = float(ts.barDuration.quarterLength)
            actual = sum(
                float(n.duration.quarterLength)
                for n in measure.notesAndRests
                if float(n.duration.quarterLength) > 0
            )
            if i == 0 and actual < expected - TOLERANCE:
                continue
            if abs(actual - expected) > TOLERANCE:
                warnings.append(
                    {
                        "kind": "measure_duration_mismatch",
                        "part_index": idx,
                        "measure": int(measure.number),
                        "expected_quarters": expected,
                        "actual_quarters": actual,
                    }
                )
    return {"warnings": warnings}
