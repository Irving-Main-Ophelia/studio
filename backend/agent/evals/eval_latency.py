"""Eval harness — latency budget tests.

Each tool should complete in under 30 seconds on a developer machine.
The reharmonize stub (no API key) should complete in under 5 seconds.
"""

from __future__ import annotations

import time

from app.agent_tools import score_reharmonize, theory_analyze_cadences, theory_analyze_key
from stockhausen_theory import analyze_progression


def test_key_analysis_latency(bach_xml: str) -> None:
    """analyze_key should complete in under 30 seconds."""
    start = time.perf_counter()
    result = theory_analyze_key(bach_xml)
    elapsed = time.perf_counter() - start
    # analyze_key returns {"key": ..., "mode": ..., "confidence": ...}
    assert "key" in result or "tonic" in result
    assert elapsed < 30.0, (
        f"theory_analyze_key took {elapsed:.2f}s, expected < 30s"
    )


def test_cadence_analysis_latency(bach_xml: str) -> None:
    """analyze_cadences should complete in under 30 seconds."""
    start = time.perf_counter()
    result = theory_analyze_cadences(bach_xml)
    elapsed = time.perf_counter() - start
    assert "cadences" in result
    assert elapsed < 30.0, (
        f"theory_analyze_cadences took {elapsed:.2f}s, expected < 30s"
    )


def test_progression_analysis_latency(bach_xml: str) -> None:
    """analyze_progression should complete in under 30 seconds."""
    start = time.perf_counter()
    result = analyze_progression(bach_xml)
    elapsed = time.perf_counter() - start
    assert "chords" in result
    assert elapsed < 30.0, (
        f"analyze_progression took {elapsed:.2f}s, expected < 30s"
    )


def test_reharmonize_stub_latency(bach_xml: str) -> None:
    """score_reharmonize with no API key (stub path) should complete in under 5 seconds."""
    # No ANTHROPIC_API_KEY set → Claude call is skipped → fast stub path.
    start = time.perf_counter()
    diff = score_reharmonize(bach_xml, measure_start=1, measure_end=4)
    elapsed = time.perf_counter() - start
    assert diff is not None
    assert elapsed < 5.0, (
        f"score_reharmonize stub took {elapsed:.2f}s, expected < 5s (no API key path)"
    )
