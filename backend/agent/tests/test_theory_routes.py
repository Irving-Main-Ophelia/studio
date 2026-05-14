"""Integration tests for the /theory/* routes (M1.3).

These guarantee the route surface stays in sync with the canonical
``stockhausen_theory`` package and that the frontend can rely on stable
response shapes.
"""

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


def test_progression_shape(client: TestClient, bach_musicxml: str) -> None:
    res = client.post("/theory/progression", json={"musicxml": bach_musicxml})
    assert res.status_code == 200
    body = res.json()
    assert "key" in body
    assert isinstance(body["chords"], list)
    assert len(body["chords"]) > 0
    first = body["chords"][0]
    assert {"measure", "beat", "pitches", "roman", "symbol"} <= first.keys()


def test_voice_leading_pairs(client: TestClient, bach_musicxml: str) -> None:
    res = client.post("/theory/voice-leading", json={"musicxml": bach_musicxml})
    assert res.status_code == 200
    body = res.json()
    # Bach chorale: 4 voices ⇒ 3 adjacent pairs (S-A, A-T, T-B).
    assert len(body["pairs"]) == 3
    for pair in body["pairs"]:
        assert isinstance(pair["intervals"], list)
        assert pair["intervals"], "expected non-empty intervals"


def test_range_warnings_run(client: TestClient, bach_musicxml: str) -> None:
    res = client.post("/theory/range", json={"musicxml": bach_musicxml})
    assert res.status_code == 200
    body = res.json()
    assert "parts" in body
    assert isinstance(body["parts"], list)


def test_cadences_detect_authentic(client: TestClient, bach_musicxml: str) -> None:
    res = client.post("/theory/cadences", json={"musicxml": bach_musicxml})
    assert res.status_code == 200
    body = res.json()
    kinds = {c["kind"] for c in body["cadences"]}
    # A four-part chorale almost always lands an authentic cadence.
    assert kinds, "expected at least one cadence"


def test_motifs_run(client: TestClient, bach_musicxml: str) -> None:
    res = client.post(
        "/theory/motifs",
        json={"musicxml": bach_musicxml, "n": 3, "min_occurrences": 2},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["n"] == 3
    assert isinstance(body["motifs"], list)


def test_validate_voice_leading_runs(client: TestClient, bach_musicxml: str) -> None:
    res = client.post("/theory/validate/voice-leading", json={"musicxml": bach_musicxml})
    assert res.status_code == 200
    body = res.json()
    assert "violations" in body
    assert isinstance(body["violations"], list)


def test_validate_range(client: TestClient, bach_musicxml: str) -> None:
    res = client.post("/theory/validate/range", json={"musicxml": bach_musicxml})
    assert res.status_code == 200
    body = res.json()
    assert "warnings" in body


def test_validate_voicing_runs(client: TestClient, bach_musicxml: str) -> None:
    res = client.post("/theory/validate/voicing", json={"musicxml": bach_musicxml})
    assert res.status_code == 200
    body = res.json()
    assert "warnings" in body


def test_validate_rhythm_runs(client: TestClient, bach_musicxml: str) -> None:
    res = client.post("/theory/validate/rhythm", json={"musicxml": bach_musicxml})
    assert res.status_code == 200
    body = res.json()
    assert "warnings" in body


def test_transpose_region_first_two_measures(client: TestClient, bach_musicxml: str) -> None:
    res = client.post(
        "/theory/transpose-region",
        json={
            "musicxml": bach_musicxml,
            "interval_name": "M2",
            "measure_start": 1,
            "measure_end": 2,
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert "<score-partwise" in body["musicxml"]
    assert body["interval"] == "M2"


def test_transpose_region_invalid_payload(client: TestClient, bach_musicxml: str) -> None:
    res = client.post(
        "/theory/transpose-region",
        json={
            "musicxml": bach_musicxml,
            "measure_start": 1,
            "measure_end": 2,
        },
    )
    assert res.status_code == 400
