"""Unit tests for stockhausen_theory.orchestration (Pillar 6 baseline)."""

from __future__ import annotations

from pathlib import Path

import pytest

from stockhausen_theory import apply_profile, list_profiles

FIXTURES = (
    Path(__file__).resolve().parents[4]
    / "apps"
    / "desktop"
    / "public"
    / "fixtures"
)


@pytest.fixture()
def bach_xml() -> str:
    return (FIXTURES / "bach-chorale-bwv66-6.musicxml").read_text()


# ---------------------------------------------------------------------------
# list_profiles
# ---------------------------------------------------------------------------

def test_list_profiles_includes_known_names() -> None:
    names = {p["name"] for p in list_profiles()}
    assert "string_quartet" in names
    assert "woodwind_quintet" in names
    assert "piano_reduction" in names


def test_list_profiles_each_has_display_name() -> None:
    for p in list_profiles():
        assert p["display_name"]


# ---------------------------------------------------------------------------
# apply_profile
# ---------------------------------------------------------------------------

def test_apply_returns_musicxml(bach_xml: str) -> None:
    result = apply_profile(bach_xml, "string_quartet")
    assert result["musicxml"].startswith("<?xml")


def test_apply_string_quartet_has_four_slots(bach_xml: str) -> None:
    result = apply_profile(bach_xml, "string_quartet")
    assert len(result["assignment"]) == 4


def test_apply_piano_reduction_has_two_slots(bach_xml: str) -> None:
    result = apply_profile(bach_xml, "piano_reduction")
    assert len(result["assignment"]) == 2


def test_apply_profile_assignment_fields(bach_xml: str) -> None:
    result = apply_profile(bach_xml, "string_quartet")
    for a in result["assignment"]:
        assert "slot_index" in a
        assert "slot_name" in a
        assert "source_part_index" in a


def test_apply_warnings_is_list(bach_xml: str) -> None:
    result = apply_profile(bach_xml, "string_quartet")
    assert isinstance(result["warnings"], list)


def test_apply_unknown_profile_raises_value_error(bach_xml: str) -> None:
    with pytest.raises(ValueError, match="Unknown profile"):
        apply_profile(bach_xml, "definitely_not_a_profile")


def test_apply_slot_names_match_profile(bach_xml: str) -> None:
    result = apply_profile(bach_xml, "string_quartet")
    names = [a["slot_name"] for a in result["assignment"]]
    assert names == ["Violin I", "Violin II", "Viola", "Cello"]


def test_apply_vocal_satb_has_four_slots(bach_xml: str) -> None:
    result = apply_profile(bach_xml, "vocal_satb")
    assert len(result["assignment"]) == 4
