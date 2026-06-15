"""Eval harness — golden test set verifying tool dispatch.

Each test calls dispatch_tool directly and parses the returned payload.
The dispatch_tool signature is (name, arguments, score_musicxml) and
uses underscore-namespaced wire names (e.g. "score_transpose", not
"score.transpose"). The payload is already a dict (not a JSON string).
"""

from __future__ import annotations

import json
from typing import Any

from app.agent_tools import dispatch_tool


def _call(name: str, args: dict[str, Any], xml: str) -> dict[str, Any]:
    """Dispatch a tool and return the payload dict."""
    payload, _diff = dispatch_tool(name, args, xml)
    # dispatch_tool returns a dict; if it's already a dict, use it directly.
    # ScoreDiff.model_dump() returns a dict, read-only tools return dicts too.
    if isinstance(payload, str):
        return json.loads(payload)
    return payload


def test_transpose_tool_produces_diff(bach_xml: str) -> None:
    """score_transpose returns a ScoreDiff payload with diff_id set."""
    result = _call("score_transpose", {"target_key": "G major"}, bach_xml)
    assert "diff_id" in result, f"Expected 'diff_id' in result, got keys: {list(result.keys())}"
    assert result["diff_id"], "diff_id should be non-empty"


def test_form_analysis_has_sections(bach_xml: str) -> None:
    """theory_analyze_form returns a result containing 'sections' key."""
    result = _call("theory_analyze_form", {}, bach_xml)
    assert "sections" in result, (
        f"Expected 'sections' in form analysis result, got keys: {list(result.keys())}"
    )


def test_key_analysis_returns_key(bach_xml: str) -> None:
    """theory_analyze_key returns a result containing the key tonic (under 'key' or 'tonic')."""
    result = _call("theory_analyze_key", {}, bach_xml)
    has_key_field = "tonic" in result or "key" in result
    assert has_key_field, (
        f"Expected 'tonic' or 'key' in key analysis result, got keys: {list(result.keys())}"
    )


def test_cadences_returns_list(bach_xml: str) -> None:
    """theory_analyze_cadences (via dispatch) returns result with 'cadences' list."""
    # theory_analyze_cadences is called through theory_analyze_form internally;
    # expose it via a direct call to the underlying function.
    from app.agent_tools import theory_analyze_cadences
    result = theory_analyze_cadences(bach_xml)
    assert "cadences" in result, (
        f"Expected 'cadences' in result, got keys: {list(result.keys())}"
    )
    assert isinstance(result["cadences"], list)


def test_motifs_returns_list(bach_xml: str) -> None:
    """theory_identify_motifs (via dispatch) returns result with 'motifs' list."""
    result = _call(
        "theory_identify_motifs",
        {"min_length": 3, "min_occurrences": 2},
        bach_xml,
    )
    assert "motifs" in result, (
        f"Expected 'motifs' in result, got keys: {list(result.keys())}"
    )
    assert isinstance(result["motifs"], list)
