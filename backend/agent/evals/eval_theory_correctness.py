"""Eval harness — theory correctness measures.

Measures:
- voice_leading_violations_per_operation: run score_reharmonize on bach,
  count warnings with kind containing "parallel" in the reharmonized
  score's voice-leading check. Should be < 5 (lenient threshold).
- range_warnings_per_orchestration: apply string_quartet profile to bach,
  count range warnings. Should be < 10.
- cadence_detection_precision: analyze_cadences on bach, count cadences
  found. Should be >= 1.
- key_detection_confidence: analyze_key on bach. Confidence should be >= 0.5.
"""

from __future__ import annotations

from app.agent_tools import score_reharmonize
from stockhausen_theory import analyze_cadences, analyze_key
from stockhausen_theory.orchestration import apply_profile
from stockhausen_theory.validators.voice_leading import validate_voice_leading


def test_voice_leading_violations_per_operation(bach_xml: str) -> None:
    """Reharmonize bach measures 1–4 (no API key → fallback), check parallel violations."""
    diff = score_reharmonize(bach_xml, measure_start=1, measure_end=4)
    reharmonized_xml = diff.preview_musicxml
    result = validate_voice_leading(reharmonized_xml)
    violations = result.get("violations", [])
    parallel_count = sum(
        1 for v in violations if "parallel" in v.get("kind", "").lower()
    )
    assert parallel_count < 5, (
        f"Expected < 5 parallel voice-leading violations after reharmonize, "
        f"got {parallel_count}"
    )


def test_range_warnings_per_orchestration(bach_xml: str) -> None:
    """Apply string_quartet profile to bach and count range warnings."""
    result = apply_profile(bach_xml, "string_quartet")
    warnings = result.get("warnings", [])
    assert len(warnings) < 10, (
        f"Expected < 10 range warnings for string_quartet orchestration, "
        f"got {len(warnings)}"
    )


def test_cadence_detection_precision(bach_xml: str) -> None:
    """analyze_cadences on bach should find at least one cadence."""
    result = analyze_cadences(bach_xml)
    cadences = result.get("cadences", [])
    assert len(cadences) >= 1, (
        f"Expected >= 1 cadence detected in bach chorale, got {len(cadences)}"
    )


def test_key_detection_confidence(bach_xml: str) -> None:
    """analyze_key on bach should return confidence >= 0.5."""
    result = analyze_key(bach_xml)
    confidence = result.get("confidence", 0.0)
    assert confidence >= 0.5, (
        f"Expected key detection confidence >= 0.5 for bach chorale, got {confidence}"
    )
