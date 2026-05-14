"""Unit tests for the six analyzers."""

from __future__ import annotations

from pathlib import Path

import pytest

from stockhausen_theory import (
    analyze_cadences,
    analyze_key,
    analyze_motifs,
    analyze_progression,
    analyze_range,
    analyze_voice_leading,
)

FIXTURES = (
    Path(__file__).resolve().parents[3].parents[0] / "apps" / "desktop" / "public" / "fixtures"
)


@pytest.fixture(scope="module")
def bach_musicxml() -> str:
    return (FIXTURES / "bach-chorale-bwv66-6.musicxml").read_text()


@pytest.fixture(scope="module")
def andante_musicxml() -> str:
    return (FIXTURES / "andante-c-sharp-minor.musicxml").read_text()


def test_analyze_key_recognises_bach_chorale(bach_musicxml: str) -> None:
    res = analyze_key(bach_musicxml)
    assert res["key"] == "F#"
    assert res["mode"] == "minor"
    assert res["confidence"] > 0.5


def test_analyze_progression_returns_chords(bach_musicxml: str) -> None:
    res = analyze_progression(bach_musicxml)
    assert res["key"]["tonic"] == "F#"
    assert res["key"]["mode"] == "minor"
    assert len(res["chords"]) > 5
    for c in res["chords"][:5]:
        assert {"measure", "beat", "pitches", "roman", "symbol"} <= c.keys()
    assert res["summary"]


def test_analyze_voice_leading_returns_pairs(bach_musicxml: str) -> None:
    res = analyze_voice_leading(bach_musicxml)
    assert len(res["pairs"]) >= 1
    first = res["pairs"][0]
    assert "intervals" in first
    if first["intervals"]:
        ev = first["intervals"][0]
        assert {"measure", "beat", "interval", "midi"} <= ev.keys()


def test_analyze_range_andante(andante_musicxml: str) -> None:
    res = analyze_range(andante_musicxml)
    assert "parts" in res
    assert len(res["parts"]) >= 1
    p = res["parts"][0]
    assert p["lowest"] and p["highest"]


def test_analyze_cadences_runs(bach_musicxml: str) -> None:
    res = analyze_cadences(bach_musicxml)
    assert "cadences" in res
    assert isinstance(res["cadences"], list)


def test_analyze_motifs_returns_recurring_shapes(bach_musicxml: str) -> None:
    res = analyze_motifs(bach_musicxml, n=3, min_occurrences=2)
    assert "motifs" in res
    if res["motifs"]:
        first = res["motifs"][0]
        assert len(first["occurrences"]) >= 2
        assert len(first["intervals"]) == 3
