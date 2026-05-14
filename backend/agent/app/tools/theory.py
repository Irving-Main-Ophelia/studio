"""Thin shim that re-exports the canonical theory engine.

The actual implementation lives in ``stockhausen_theory`` (under
``packages/theory/python``). The agent backend depends on that package
in editable mode; this file keeps the historical import path
``app.tools.theory.analyze_key`` working for the existing routes while we
migrate them off in M1.3.

ADR-0011 describes the move and the rationale.
"""

from __future__ import annotations

from typing import Any

from stockhausen_theory import (
    analyze_cadences,
    analyze_key,
    analyze_motifs,
    analyze_progression,
    analyze_range,
    analyze_voice_leading,
    extract_notes,
    parse_score,
    transpose_region,
    validate_range,
    validate_rhythm,
    validate_voice_leading,
    validate_voicing,
)
from stockhausen_theory import (
    transpose as _transpose,
)


# Historical name kept for the FastAPI route. New callers should import
# ``stockhausen_theory.transpose`` directly.
def transpose_musicxml(musicxml: str, target_key: str) -> dict[str, Any]:
    """Backwards-compatible alias for stockhausen_theory.transpose."""
    return _transpose(musicxml, target_key)


# Backwards-compatible private alias for the score_edit module — the
# notation editor parses MusicXML via this helper.
_parse = parse_score

__all__ = [
    "_parse",
    "analyze_cadences",
    "analyze_key",
    "analyze_motifs",
    "analyze_progression",
    "analyze_range",
    "analyze_voice_leading",
    "extract_notes",
    "transpose_musicxml",
    "transpose_region",
    "validate_range",
    "validate_rhythm",
    "validate_voice_leading",
    "validate_voicing",
]
