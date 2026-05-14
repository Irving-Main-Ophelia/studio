"""Voice-leading analysis: pairs of consecutive intervals between adjacent voices.

For each pair of adjacent parts (e.g. Soprano-Alto, Alto-Tenor) we scan
all consecutive note offsets and report the harmonic interval. This
data feeds both the Theory Tutor explanations and the parallel-5ths/
8ves validator.
"""

from __future__ import annotations

from typing import Any

from music21 import interval, note, stream

from stockhausen_theory.score_io import parse_score


def analyze_voice_leading(musicxml: str) -> dict[str, Any]:
    """Return adjacent-voice harmonic intervals at each beat.

    Output shape::

        {
            "pairs": [
                {
                    "voices": ["P1", "P2"],
                    "intervals": [
                        {"measure": 1, "beat": 1.0, "interval": "M3", "midi": [60, 64]},
                        ...
                    ]
                },
                ...
            ]
        }
    """
    score = parse_score(musicxml)
    parts = list(score.parts) if score.parts else [score]
    pairs: list[dict[str, Any]] = []
    for i in range(len(parts) - 1):
        upper = parts[i]
        lower = parts[i + 1]
        intervals_data = _adjacent_voice_intervals(upper, lower)
        pairs.append(
            {
                "voices": [upper.id or f"P{i + 1}", lower.id or f"P{i + 2}"],
                "intervals": intervals_data,
            }
        )
    return {"pairs": pairs}


def _adjacent_voice_intervals(
    upper: stream.Stream[Any], lower: stream.Stream[Any]
) -> list[dict[str, Any]]:
    upper_notes = sorted(
        (n for n in upper.flatten().notes if isinstance(n, note.Note)),
        key=lambda n: float(n.offset),
    )
    lower_notes = sorted(
        (n for n in lower.flatten().notes if isinstance(n, note.Note)),
        key=lambda n: float(n.offset),
    )
    by_offset_upper = {round(float(n.offset), 4): n for n in upper_notes}
    by_offset_lower = {round(float(n.offset), 4): n for n in lower_notes}
    common = sorted(set(by_offset_upper) & set(by_offset_lower))
    out: list[dict[str, Any]] = []
    for off in common:
        up = by_offset_upper[off]
        lo = by_offset_lower[off]
        ivl = interval.Interval(noteStart=lo, noteEnd=up)  # type: ignore[no-untyped-call]
        measure_obj = up.getContextByClass("Measure")
        measure_num = int(measure_obj.number) if measure_obj is not None else 1
        out.append(
            {
                "measure": measure_num,
                "beat": float(up.beat),
                "interval": ivl.name,
                "midi": [int(up.pitch.midi), int(lo.pitch.midi)],
            }
        )
    return out
