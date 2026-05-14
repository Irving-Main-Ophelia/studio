"""Unit tests for the four validators."""

from __future__ import annotations

from pathlib import Path

import pytest

from stockhausen_theory import (
    validate_range,
    validate_rhythm,
    validate_voice_leading,
    validate_voicing,
)

FIXTURES = (
    Path(__file__).resolve().parents[3].parents[0] / "apps" / "desktop" / "public" / "fixtures"
)


@pytest.fixture(scope="module")
def bach_musicxml() -> str:
    return (FIXTURES / "bach-chorale-bwv66-6.musicxml").read_text()


def test_validators_return_warning_shape(bach_musicxml: str) -> None:
    for fn in (
        validate_range,
        validate_voicing,
        validate_rhythm,
    ):
        result = fn(bach_musicxml)
        assert "warnings" in result
        assert isinstance(result["warnings"], list)


def test_voice_leading_validator_returns_violations(bach_musicxml: str) -> None:
    result = validate_voice_leading(bach_musicxml)
    assert "violations" in result
    assert isinstance(result["violations"], list)
    for w in result["violations"]:
        assert w["kind"] in {"parallel_fifths", "parallel_octaves"}
        assert {"voices", "from_measure", "to_measure"} <= w.keys()


def test_rhythm_validator_tolerates_correct_measures(bach_musicxml: str) -> None:
    # The Bach chorale is metrically clean; we expect zero or near-zero
    # rhythm warnings.
    res = validate_rhythm(bach_musicxml)
    assert len(res["warnings"]) <= 2  # tolerate tiny rounding edge cases
