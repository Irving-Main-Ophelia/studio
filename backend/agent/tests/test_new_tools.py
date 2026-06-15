"""Tests for the 20 new agent tools added in Phase 2 (Sub-task A2).

Covers orchestration, audio stubs, score, theory, playback, and project tools.
All tests run without an ANTHROPIC_API_KEY.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.agent_tools import (
    audio_stem_separate,
    orchestration_add_part,
    orchestration_change_instrument,
    orchestration_remove_part,
    orchestration_set_profile,
    playback_set_tempo,
    project_revert,
    project_snapshot,
    theory_check_orchestration,
    theory_suggest_modulation,
    dispatch_tool,
)
from app.score_diff import ScoreDiff

FIXTURES = Path(__file__).resolve().parents[3] / "apps" / "desktop" / "public" / "fixtures"


@pytest.fixture()
def bach_musicxml() -> str:
    return (FIXTURES / "bach-chorale-bwv66-6.musicxml").read_text()


# ---------------------------------------------------------------------------
# 1. theory.suggest_modulation
# ---------------------------------------------------------------------------


def test_theory_suggest_modulation_returns_three_suggestions(bach_musicxml: str) -> None:
    result = theory_suggest_modulation(bach_musicxml)
    assert "current_key" in result
    assert "suggestions" in result
    suggestions = result["suggestions"]
    assert len(suggestions) == 3
    relationships = {s["relationship"] for s in suggestions}
    assert relationships == {"relative", "subdominant", "dominant"}
    for s in suggestions:
        assert "to_key" in s
        assert "roman_numeral" in s


def test_theory_suggest_modulation_with_style(bach_musicxml: str) -> None:
    result = theory_suggest_modulation(bach_musicxml, target_style="jazz")
    assert result.get("target_style") == "jazz"


# ---------------------------------------------------------------------------
# 2. theory.check_orchestration
# ---------------------------------------------------------------------------


def test_theory_check_orchestration_valid_profile(bach_musicxml: str) -> None:
    result = theory_check_orchestration(bach_musicxml, profile_id="string_quartet")
    assert result["profile"] == "string_quartet"
    assert "range_warnings" in result
    assert isinstance(result["range_warnings"], list)
    assert result["warning_count"] == len(result["range_warnings"])


# ---------------------------------------------------------------------------
# 3. orchestration.set_profile with "string_quartet"
# ---------------------------------------------------------------------------


def test_orchestration_set_profile_string_quartet(bach_musicxml: str) -> None:
    diff = orchestration_set_profile(bach_musicxml, profile_id="string_quartet")
    assert isinstance(diff, ScoreDiff)
    assert diff.tool == "orchestration.set_profile"
    assert "<score-partwise" in diff.preview_musicxml
    assert len(diff.operations) == 1
    assert diff.operations[0].kind == "score_set_profile"
    assert diff.operations[0].forward["profile_id"] == "string_quartet"


# ---------------------------------------------------------------------------
# 4. orchestration.add_part adds one part
# ---------------------------------------------------------------------------


def test_orchestration_add_part_increases_part_count(bach_musicxml: str) -> None:
    from stockhausen_theory.score_io import parse_score

    original_score = parse_score(bach_musicxml)
    original_count = len(list(original_score.parts)) if original_score.parts else 1

    diff = orchestration_add_part(bach_musicxml, instrument_name="Flute")
    assert isinstance(diff, ScoreDiff)
    assert diff.tool == "orchestration.add_part"
    assert "<score-partwise" in diff.preview_musicxml

    new_score = parse_score(diff.preview_musicxml)
    new_count = len(list(new_score.parts)) if new_score.parts else 1
    assert new_count == original_count + 1


# ---------------------------------------------------------------------------
# 5. orchestration.remove_part removes a part
# ---------------------------------------------------------------------------


def test_orchestration_remove_part_decreases_part_count(bach_musicxml: str) -> None:
    from stockhausen_theory.score_io import parse_score

    original_score = parse_score(bach_musicxml)
    original_count = len(list(original_score.parts)) if original_score.parts else 1
    assert original_count >= 1, "Bach fixture must have at least one part"

    diff = orchestration_remove_part(bach_musicxml, part_index=0)
    assert isinstance(diff, ScoreDiff)
    assert diff.tool == "orchestration.remove_part"
    assert "<score-partwise" in diff.preview_musicxml

    new_score = parse_score(diff.preview_musicxml)
    new_count = len(list(new_score.parts)) if new_score.parts else 0
    assert new_count == original_count - 1


def test_orchestration_remove_part_invalid_index_raises(bach_musicxml: str) -> None:
    with pytest.raises(ValueError, match="out of range"):
        orchestration_remove_part(bach_musicxml, part_index=9999)


# ---------------------------------------------------------------------------
# 6. project.snapshot stores snapshot info
# ---------------------------------------------------------------------------


def test_project_snapshot_stores_and_returns_info(bach_musicxml: str) -> None:
    from app.agent_tools import _SNAPSHOTS

    result = project_snapshot(bach_musicxml, name="test-snap")
    assert "snapshot_id" in result
    assert result["name"] == "test-snap"
    assert "path" in result

    snap_id = result["snapshot_id"]
    assert snap_id in _SNAPSHOTS
    assert _SNAPSHOTS[snap_id]["musicxml"] == bach_musicxml


# ---------------------------------------------------------------------------
# 7. project.revert retrieves and returns ScoreDiff
# ---------------------------------------------------------------------------


def test_project_revert_returns_score_diff(bach_musicxml: str) -> None:
    snap_result = project_snapshot(bach_musicxml, name="revert-test")
    snap_id = snap_result["snapshot_id"]

    diff = project_revert(snap_id)
    assert isinstance(diff, ScoreDiff)
    assert diff.tool == "project.revert"
    assert diff.preview_musicxml == bach_musicxml
    assert "Revert to snapshot" in diff.description


def test_project_revert_unknown_id_raises() -> None:
    with pytest.raises(ValueError, match="Unknown snapshot_id"):
        project_revert("00000000-0000-0000-0000-000000000000")


# ---------------------------------------------------------------------------
# 8. playback.set_tempo returns ScoreDiff
# ---------------------------------------------------------------------------


def test_playback_set_tempo_returns_score_diff(bach_musicxml: str) -> None:
    diff = playback_set_tempo(bach_musicxml, bpm=120)
    assert isinstance(diff, ScoreDiff)
    assert diff.tool == "playback.set_tempo"
    assert "<score-partwise" in diff.preview_musicxml
    assert len(diff.operations) == 1
    assert diff.operations[0].kind == "score_set_tempo"
    assert diff.operations[0].forward["bpm"] == 120


# ---------------------------------------------------------------------------
# 9. audio.stem_separate returns stub with reason
# ---------------------------------------------------------------------------


def test_audio_stem_separate_returns_stub() -> None:
    result = audio_stem_separate("/path/to/audio.mp3")
    assert result["stub"] is True
    assert "Demucs" in result["reason"]
    assert result["stems"] == []


# ---------------------------------------------------------------------------
# 10. orchestration.change_instrument changes part name in musicxml
# ---------------------------------------------------------------------------


def test_orchestration_change_instrument_updates_part_name(bach_musicxml: str) -> None:
    from stockhausen_theory.score_io import parse_score

    diff = orchestration_change_instrument(
        bach_musicxml, part_index=0, new_instrument="Electric Guitar"
    )
    assert isinstance(diff, ScoreDiff)
    assert diff.tool == "orchestration.change_instrument"
    assert "<score-partwise" in diff.preview_musicxml

    new_score = parse_score(diff.preview_musicxml)
    new_parts = list(new_score.parts) if new_score.parts else [new_score]
    assert new_parts[0].partName == "Electric Guitar"


def test_orchestration_change_instrument_invalid_index_raises(bach_musicxml: str) -> None:
    with pytest.raises(ValueError, match="out of range"):
        orchestration_change_instrument(
            bach_musicxml, part_index=9999, new_instrument="Tuba"
        )


# ---------------------------------------------------------------------------
# dispatch_tool routing tests for new tools
# ---------------------------------------------------------------------------


def test_dispatch_routes_orchestration_set_profile(bach_musicxml: str) -> None:
    payload, diff = dispatch_tool(
        "orchestration_set_profile", {"profile_id": "string_quartet"}, bach_musicxml
    )
    assert diff is not None
    assert payload["tool"] == "orchestration.set_profile"


def test_dispatch_routes_audio_stem_separate(bach_musicxml: str) -> None:
    payload, diff = dispatch_tool(
        "audio_stem_separate", {"audio_file_path": "/tmp/test.mp3"}, bach_musicxml
    )
    assert diff is None
    assert payload["stub"] is True


def test_dispatch_routes_theory_suggest_modulation(bach_musicxml: str) -> None:
    payload, diff = dispatch_tool(
        "theory_suggest_modulation", {}, bach_musicxml
    )
    assert diff is None
    assert "suggestions" in payload
    assert len(payload["suggestions"]) == 3


def test_dispatch_routes_playback_set_tempo(bach_musicxml: str) -> None:
    payload, diff = dispatch_tool(
        "playback_set_tempo", {"bpm": 96}, bach_musicxml
    )
    assert diff is not None
    assert payload["tool"] == "playback.set_tempo"


def test_dispatch_routes_project_snapshot_and_revert(bach_musicxml: str) -> None:
    payload, diff = dispatch_tool(
        "project_snapshot", {"name": "dispatch-test"}, bach_musicxml
    )
    assert diff is None
    snap_id = payload["snapshot_id"]

    payload2, diff2 = dispatch_tool(
        "project_revert", {"snapshot_id": snap_id}, bach_musicxml
    )
    assert diff2 is not None
    assert payload2["tool"] == "project.revert"
