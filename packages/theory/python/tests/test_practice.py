"""Tests for the Pillar-10 practice coach (compare_performance)."""

from __future__ import annotations

from pathlib import Path

import pytest

from stockhausen_theory.practice import compare_performance

FIXTURES = Path(__file__).resolve().parents[4] / "apps" / "desktop" / "public" / "fixtures"


@pytest.fixture()
def bach_xml() -> str:
    return (FIXTURES / "bach-chorale-bwv66-6.musicxml").read_text()


@pytest.fixture()
def andante_xml() -> str:
    return (FIXTURES / "andante-c-sharp-minor.musicxml").read_text()


def test_compare_identical_scores_zero_errors(bach_xml: str) -> None:
    """Comparing a score against itself should produce zero total errors."""
    result = compare_performance(bach_xml, bach_xml)
    assert result["total_errors"] == 0, (
        f"Expected 0 errors when comparing score against itself, "
        f"got {result['total_errors']}"
    )


def test_compare_returns_heat_map(bach_xml: str) -> None:
    """compare_performance result must contain a 'heat_map' key with a list."""
    result = compare_performance(bach_xml, bach_xml)
    assert "heat_map" in result, "Expected 'heat_map' key in result"
    assert isinstance(result["heat_map"], list), "'heat_map' should be a list"


def test_compare_returns_practice_plan(bach_xml: str) -> None:
    """compare_performance result must contain a 'practice_plan' key."""
    result = compare_performance(bach_xml, bach_xml)
    assert "practice_plan" in result, "Expected 'practice_plan' key in result"
    assert isinstance(result["practice_plan"], list), "'practice_plan' should be a list"


def test_heat_map_severity_zero_errors(bach_xml: str) -> None:
    """When comparing identical scores, all heat-map entries should be 'low'."""
    result = compare_performance(bach_xml, bach_xml)
    for cell in result["heat_map"]:
        assert cell["severity"] == "low", (
            f"Expected severity 'low' for measure {cell['measure']} with 0 errors, "
            f"got '{cell['severity']}'"
        )


def test_compare_different_scores(bach_xml: str, andante_xml: str) -> None:
    """Comparing bach against andante (different pieces) should yield total_errors > 0."""
    result = compare_performance(bach_xml, andante_xml)
    assert result["total_errors"] > 0, (
        "Expected > 0 errors when comparing different scores (bach vs andante), "
        f"got {result['total_errors']}"
    )
