"""Voicing-spacing validator.

Classical part-writing rule of thumb: between adjacent upper voices the
gap should rarely exceed an octave; between tenor and bass two octaves
is acceptable. We flag intervals that grossly exceed these guidelines.
"""

from __future__ import annotations

from typing import Any

from stockhausen_theory.analyzers.voice_leading import analyze_voice_leading

MAX_GAP_SEMITONES_UPPER = 12  # one octave between adjacent upper voices
MAX_GAP_SEMITONES_LOWER = 24  # two octaves between tenor and bass


def validate_voicing(musicxml: str) -> dict[str, Any]:
    """Flag wide spacings between adjacent voices.

    The last pair (bass-to-tenor) gets a more lenient threshold; everywhere
    else we warn above one octave.
    """
    data = analyze_voice_leading(musicxml)
    warnings: list[dict[str, Any]] = []
    pairs = data["pairs"]
    for i, pair in enumerate(pairs):
        is_lowest_pair = i == len(pairs) - 1
        threshold = MAX_GAP_SEMITONES_LOWER if is_lowest_pair else MAX_GAP_SEMITONES_UPPER
        for ev in pair["intervals"]:
            gap = abs(ev["midi"][0] - ev["midi"][1])
            if gap > threshold:
                warnings.append(
                    {
                        "kind": "wide_spacing",
                        "voices": pair["voices"],
                        "measure": ev["measure"],
                        "beat": ev["beat"],
                        "semitones": gap,
                        "threshold": threshold,
                    }
                )
    return {"warnings": warnings}
