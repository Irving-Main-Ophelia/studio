"""Unit tests for the M1.4 agent tools (ScoreDiff envelope + diff-returning facades).

These tests bypass the LLM entirely; they exercise the diff-builder
layer that the tool-use loop calls into. The LLM loop itself is tested
indirectly via the existing /agent/chat integration (which is gated on
an ANTHROPIC_API_KEY).
"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.agent_tools import (
    dispatch_tool,
    score_add_section,
    score_modulate,
    score_reharmonize,
    score_replace_bars,
    score_transpose,
    theory_explain,
)
from app.score_diff import ScoreDiff, score_hash

FIXTURES = Path(__file__).resolve().parents[3] / "apps" / "desktop" / "public" / "fixtures"


@pytest.fixture()
def bach_musicxml() -> str:
    return (FIXTURES / "bach-chorale-bwv66-6.musicxml").read_text()


def test_score_transpose_returns_diff(bach_musicxml: str) -> None:
    diff = score_transpose(bach_musicxml, target_key="A minor")
    assert isinstance(diff, ScoreDiff)
    assert diff.tool == "score.transpose"
    assert diff.base_score_hash == score_hash(bach_musicxml)
    assert "<score-partwise" in diff.preview_musicxml
    assert len(diff.operations) == 1
    op = diff.operations[0]
    assert op.kind == "score_transpose"
    assert op.forward["musicxml"] == diff.preview_musicxml
    assert op.inverse["musicxml"] == bach_musicxml


def test_score_modulate_includes_warnings(bach_musicxml: str) -> None:
    diff = score_modulate(bach_musicxml, target_key="C major", method="pivot-chord", at_bar=4)
    assert diff.tool == "score.modulate"
    assert diff.operations[0].forward["method"] == "pivot-chord"
    assert diff.operations[0].forward["at_bar"] == 4
    # Output is a valid MusicXML; warnings is a list (may be empty for this fixture).
    assert "<score-partwise" in diff.preview_musicxml
    assert isinstance(diff.warnings, list)


def test_score_reharmonize_is_phase1_stub(bach_musicxml: str) -> None:
    diff = score_reharmonize(
        bach_musicxml, measure_start=1, measure_end=4, style="secondary-dominants"
    )
    assert diff.preview_musicxml == bach_musicxml
    assert any(w.kind == "phase1_stub" for w in diff.warnings)


def test_score_add_section_is_phase1_stub(bach_musicxml: str) -> None:
    diff = score_add_section(bach_musicxml, plan={"description": "bridge"})
    assert diff.preview_musicxml == bach_musicxml
    assert any(w.kind == "phase1_stub" for w in diff.warnings)


def test_score_replace_bars_runs_validators(bach_musicxml: str) -> None:
    diff = score_replace_bars(bach_musicxml, new_musicxml=bach_musicxml)
    assert diff.preview_musicxml == bach_musicxml
    # Even when the content is identical the validators run cleanly.
    assert isinstance(diff.warnings, list)


def test_theory_explain_returns_region_digest(bach_musicxml: str) -> None:
    res = theory_explain(bach_musicxml, measure_start=1, measure_end=2)
    assert res["region"] == {"measure_start": 1, "measure_end": 2}
    assert "key" in res
    assert isinstance(res["chords"], list)
    assert isinstance(res["voice_leading"], list)


def test_dispatch_tool_routes_read_only(bach_musicxml: str) -> None:
    payload, diff = dispatch_tool("theory_analyze_key", {}, bach_musicxml)
    assert diff is None
    assert payload["key"] == "F#"


def test_dispatch_tool_routes_score_mutating(bach_musicxml: str) -> None:
    payload, diff = dispatch_tool("score_transpose", {"target_key": "G major"}, bach_musicxml)
    assert diff is not None
    assert "diff_id" in payload
    assert payload["diff_id"] == diff.diff_id


def test_dispatch_tool_no_score_raises() -> None:
    with pytest.raises(ValueError, match="needs a score"):
        dispatch_tool("theory_analyze_key", {}, None)


def test_dispatch_tool_unknown_tool_raises(bach_musicxml: str) -> None:
    with pytest.raises(ValueError, match="Unknown tool"):
        dispatch_tool("does_not_exist", {}, bach_musicxml)


def test_score_hash_is_stable(bach_musicxml: str) -> None:
    assert score_hash(bach_musicxml) == score_hash(bach_musicxml)
    assert score_hash(bach_musicxml) != score_hash(bach_musicxml + " ")
