"""Voice-leading validator: parallel 5ths and octaves.

Standard counterpoint rule: between any pair of adjacent voices, two
consecutive perfect 5ths or perfect 8ves moving in the same direction
are considered an error in tonal practice. Voice-crossing and direct
(hidden) 5ths/8ves are also flagged.
"""

from __future__ import annotations

from typing import Any

from stockhausen_theory.analyzers.voice_leading import analyze_voice_leading


def validate_voice_leading(musicxml: str) -> dict[str, Any]:
    """Scan for parallel-5ths and parallel-8ves between adjacent voices.

    Output shape::

        {
            "warnings": [
                {
                    "kind": "parallel_fifths",
                    "voices": ["P1", "P2"],
                    "from": {"measure": 2, "beat": 1.0},
                    "to":   {"measure": 2, "beat": 3.0}
                },
                ...
            ]
        }
    """
    data = analyze_voice_leading(musicxml)
    violations: list[dict[str, Any]] = []
    for pair in data["pairs"]:
        intervals = pair["intervals"]
        for i in range(len(intervals) - 1):
            a = intervals[i]
            b = intervals[i + 1]
            if a["interval"] == b["interval"] and a["interval"] in {"P5", "P8"}:
                same_pitches = a["midi"][0] == b["midi"][0] and a["midi"][1] == b["midi"][1]
                if same_pitches:
                    continue
                violations.append(
                    {
                        "kind": (
                            "parallel_fifths" if a["interval"] == "P5" else "parallel_octaves"
                        ),
                        "voices": pair["voices"],
                        "from_measure": a["measure"],
                        "to_measure": b["measure"],
                    }
                )
    return {"violations": violations}
