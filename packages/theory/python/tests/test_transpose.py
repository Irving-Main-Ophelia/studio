"""Unit tests for the Pillar-2 transposition module."""

from __future__ import annotations

from pathlib import Path

import pytest

from stockhausen_theory import analyze_key, transpose, transpose_region

FIXTURES = (
    Path(__file__).resolve().parents[3].parents[0] / "apps" / "desktop" / "public" / "fixtures"
)


@pytest.fixture(scope="module")
def bach_musicxml() -> str:
    return (FIXTURES / "bach-chorale-bwv66-6.musicxml").read_text()


def test_transpose_returns_target_key(bach_musicxml: str) -> None:
    res = transpose(bach_musicxml, "G")
    assert "G minor" in res["to_key"]
    # The output is still valid MusicXML.
    re_analyzed = analyze_key(res["musicxml"])
    assert re_analyzed["key"] == "G"


def test_transpose_explicit_major(bach_musicxml: str) -> None:
    res = transpose(bach_musicxml, "G major")
    assert "G major" in res["to_key"]


def test_transpose_region_by_interval(bach_musicxml: str) -> None:
    res = transpose_region(
        bach_musicxml,
        target_key=None,
        interval_name="P5",
        measure_start=1,
        measure_end=2,
    )
    assert "musicxml" in res
    assert res["interval"]
    # Warnings is a list, possibly empty.
    assert isinstance(res["warnings"], list)


def test_transpose_region_rejects_empty_spec(bach_musicxml: str) -> None:
    with pytest.raises(ValueError):
        transpose_region(
            bach_musicxml,
            target_key=None,
            interval_name=None,
            measure_start=1,
            measure_end=2,
        )
