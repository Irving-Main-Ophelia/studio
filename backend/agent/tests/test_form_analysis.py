"""Tests for theory_analyze_form (Phase-2 cadence-based form detection)."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.agent_tools import dispatch_tool, theory_analyze_form

FIXTURES = Path(__file__).resolve().parents[3] / "apps" / "desktop" / "public" / "fixtures"


@pytest.fixture()
def bach_musicxml() -> str:
    return (FIXTURES / "bach-chorale-bwv66-6.musicxml").read_text()


def test_analyze_form_returns_required_keys(bach_musicxml: str) -> None:
    result = theory_analyze_form(bach_musicxml)
    assert "key" in result
    assert "total_measures" in result
    assert "phrases" in result
    assert "sections" in result


def test_analyze_form_total_measures_is_positive(bach_musicxml: str) -> None:
    result = theory_analyze_form(bach_musicxml)
    assert result["total_measures"] > 0


def test_analyze_form_phrases_have_start_end(bach_musicxml: str) -> None:
    result = theory_analyze_form(bach_musicxml)
    for ph in result["phrases"]:
        assert "measure_start" in ph
        assert "measure_end" in ph
        assert ph["measure_start"] <= ph["measure_end"]


def test_analyze_form_sections_are_labelled(bach_musicxml: str) -> None:
    result = theory_analyze_form(bach_musicxml)
    for sec in result["sections"]:
        assert "name" in sec
        assert len(sec["name"]) >= 1
        assert "measure_start" in sec
        assert "measure_end" in sec


def test_analyze_form_via_dispatch(bach_musicxml: str) -> None:
    payload, diff = dispatch_tool("theory_analyze_form", {}, bach_musicxml)
    assert diff is None
    assert "phrases" in payload
    assert "sections" in payload
