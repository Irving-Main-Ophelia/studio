"""Tests for the /orchestration/* routes (Pillar 6 baseline, M2.3)."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app

FIXTURES = Path(__file__).resolve().parents[3] / "apps" / "desktop" / "public" / "fixtures"


@pytest.fixture()
def client() -> TestClient:
    return TestClient(create_app())


@pytest.fixture()
def bach_musicxml() -> str:
    return (FIXTURES / "bach-chorale-bwv66-6.musicxml").read_text()


def test_list_profiles_returns_known_names(client: TestClient) -> None:
    res = client.get("/orchestration/profiles")
    assert res.status_code == 200
    names = {p["name"] for p in res.json()}
    assert {"string_quartet", "woodwind_quintet", "piano_reduction"}.issubset(names)
    for p in res.json():
        assert "name" in p
        assert "display_name" in p


def test_apply_string_quartet_returns_musicxml(client: TestClient, bach_musicxml: str) -> None:
    res = client.post("/orchestration/apply", json={"musicxml": bach_musicxml, "profile": "string_quartet"})
    assert res.status_code == 200
    body = res.json()
    assert "musicxml" in body
    assert body["musicxml"].startswith("<?xml")
    assert "profile" in body
    assert body["profile"]["name"] == "string_quartet"


def test_apply_returns_assignment_list(client: TestClient, bach_musicxml: str) -> None:
    res = client.post("/orchestration/apply", json={"musicxml": bach_musicxml, "profile": "string_quartet"})
    body = res.json()
    assignment = body["assignment"]
    assert len(assignment) == 4   # string quartet has 4 slots
    for a in assignment:
        assert "slot_index" in a
        assert "slot_name" in a
        assert "source_part_index" in a


def test_apply_returns_warnings_list(client: TestClient, bach_musicxml: str) -> None:
    res = client.post("/orchestration/apply", json={"musicxml": bach_musicxml, "profile": "string_quartet"})
    body = res.json()
    # warnings may be empty — just assert it's a list
    assert isinstance(body["warnings"], list)


def test_apply_unknown_profile_returns_400(client: TestClient, bach_musicxml: str) -> None:
    res = client.post("/orchestration/apply", json={"musicxml": bach_musicxml, "profile": "does_not_exist"})
    assert res.status_code == 400
    assert "does_not_exist" in res.json()["detail"]


def test_apply_piano_reduction_has_two_slots(client: TestClient, bach_musicxml: str) -> None:
    res = client.post("/orchestration/apply", json={"musicxml": bach_musicxml, "profile": "piano_reduction"})
    assert res.status_code == 200
    body = res.json()
    assert len(body["assignment"]) == 2
    names = {a["slot_name"] for a in body["assignment"]}
    assert "Piano RH" in names
    assert "Piano LH" in names
