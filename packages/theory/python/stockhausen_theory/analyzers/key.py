"""Key estimation (Krumhansl-Schmuckler).

Music note: Krumhansl-Schmuckler compares the pitch-class profile of the
piece against 24 "typical" major/minor profiles measured in cognitive-
science experiments. It's the standard textbook estimator — works well
for tonal music, less well for atonal/jazz/non-Western styles.
"""

from __future__ import annotations

from typing import Any

from music21 import key

from stockhausen_theory.score_io import parse_score


def analyze_key(musicxml: str) -> dict[str, Any]:
    """Estimate the overall key of a MusicXML score.

    Returns ``{ "key": "F#", "mode": "minor", "confidence": 0.78 }``.
    Confidence is the Krumhansl correlation coefficient ∈ [-1, 1] —
    values above ~0.6 are typically convincing.
    """
    score = parse_score(musicxml)
    estimated = score.analyze("key.krumhansl")
    if not isinstance(estimated, key.Key):
        raise ValueError("Could not estimate the key of this score.")
    return {
        "key": estimated.tonic.name,
        "mode": estimated.mode,
        "confidence": float(estimated.correlationCoefficient or 0.0),
    }


def coerce_key(name: str, default_mode: str = "major") -> key.Key:
    """Accept 'F#m', 'Bb', 'G major', etc. and return a music21 Key.

    If the input does not specify a mode, falls back to ``default_mode``.
    """
    stripped = name.strip()
    lowered = stripped.lower()
    if lowered.endswith("m") and not lowered.endswith("maj"):
        tonic = stripped[:-1]
        mode = "minor"
    elif "minor" in lowered:
        tonic = lowered.replace("minor", "").strip().capitalize()
        mode = "minor"
    elif "major" in lowered:
        tonic = lowered.replace("major", "").strip().capitalize()
        mode = "major"
    else:
        tonic = stripped
        mode = default_mode
    return key.Key(tonic, mode)
