"""Motif extraction — interval-sequence shingles.

A motif here is a contiguous run of N pitch intervals (defaults to 4)
that recurs at least twice across the score. We report the first occurrence
location for each, plus the count. Pillar-8 uses this to point the
maintainer at "see also: bar 9 has the same shape as bar 27".
"""

from __future__ import annotations

from collections import Counter
from typing import Any

from music21 import note

from stockhausen_theory.score_io import parse_score


def analyze_motifs(musicxml: str, n: int = 4, min_occurrences: int = 2) -> dict[str, Any]:
    """Find recurring n-gram pitch-interval motifs.

    Output shape::

        {
            "n": 4,
            "motifs": [
                {
                    "intervals": [2, 2, 1, 4],
                    "occurrences": [
                        {"part_index": 0, "measure": 1, "beat": 1.0},
                        ...,
                    ],
                },
                ...,
            ],
        }
    """
    score = parse_score(musicxml)
    parts = list(score.parts) if score.parts else [score]
    grams: Counter[tuple[int, ...]] = Counter()
    occurrences: dict[tuple[int, ...], list[dict[str, Any]]] = {}
    for idx, part in enumerate(parts):
        notes = [n for n in part.flatten().notes if isinstance(n, note.Note)]
        for i in range(len(notes) - n):
            window = notes[i : i + n + 1]
            ivls = tuple(
                int(window[j + 1].pitch.midi - window[j].pitch.midi) for j in range(n)
            )
            grams[ivls] += 1
            measure_obj = window[0].getContextByClass("Measure")
            occurrences.setdefault(ivls, []).append(
                {
                    "part_index": idx,
                    "measure": int(measure_obj.number) if measure_obj is not None else 1,
                    "beat": float(window[0].beat),
                }
            )
    motifs: list[dict[str, Any]] = []
    for ivls, count in grams.most_common():
        if count < min_occurrences:
            continue
        motifs.append(
            {
                "intervals": list(ivls),
                "occurrences": occurrences[ivls],
            }
        )
    return {"n": n, "motifs": motifs}
