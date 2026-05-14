"""Cadence detection (lightweight).

Pillar-8 utility. Identifies authentic (V→I), plagal (IV→I), half (→V),
and deceptive (V→vi or V→VI) cadences by sliding a 2-chord window over
the Roman-numeral progression.
"""

from __future__ import annotations

from typing import Any

from stockhausen_theory.analyzers.progression import analyze_progression


def analyze_cadences(musicxml: str) -> dict[str, Any]:
    """Find candidate cadences in the score.

    Output shape::

        {
            "key": "C major",
            "cadences": [
                {"type": "authentic", "from": "V", "to": "I", "measure": 4, "beat": 3.0},
                ...
            ]
        }
    """
    prog = analyze_progression(musicxml)
    chords = prog["chords"]
    cadences: list[dict[str, Any]] = []
    for i in range(len(chords) - 1):
        a = chords[i]["roman"]
        b = chords[i + 1]["roman"]
        cad_kind = _classify(a, b)
        if cad_kind is not None:
            cadences.append(
                {
                    "kind": cad_kind,
                    "roman_progression": [a, b],
                    "measure": chords[i + 1]["measure"],
                    "beat": chords[i + 1]["beat"],
                }
            )
    return {"key": prog["key"], "cadences": cadences}


def _classify(a: str, b: str) -> str | None:
    al = a.lower()
    bl = b.lower()
    if al == "v" and bl in {"i", "i6"}:
        return "authentic"
    if al == "iv" and bl in {"i", "i6"}:
        return "plagal"
    if bl == "v":
        return "half"
    if al == "v" and bl in {"vi", "vi6", "bvi"}:
        return "deceptive"
    return None
