"""Integration tests for the Phase-0 score & transpose endpoints.

The Anthropic-backed `/agent/chat` is tested separately because it needs a
real API key; here we focus on the music21-backed surface.
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


@pytest.fixture()
def andante_musicxml() -> str:
    return (FIXTURES / "andante-c-sharp-minor.musicxml").read_text()


def test_score_key_bach(client: TestClient, bach_musicxml: str) -> None:
    res = client.post("/score/key", json={"musicxml": bach_musicxml})
    assert res.status_code == 200
    body = res.json()
    # BWV 66.6 sits firmly in F# minor.
    assert body["key"] == "F#"
    assert body["mode"] == "minor"
    assert body["confidence"] > 0.5


def test_score_notes_andante(client: TestClient, andante_musicxml: str) -> None:
    res = client.post("/score/notes", json={"musicxml": andante_musicxml})
    assert res.status_code == 200
    body = res.json()
    assert body["tempo_bpm"] == pytest.approx(76.0)
    assert body["duration_sec"] > 0
    assert len(body["notes"]) > 50
    first = body["notes"][0]
    assert {"midi", "start_sec", "duration_sec", "part_index", "velocity"} <= first.keys()
    assert 21 <= first["midi"] <= 108  # standard piano range


def test_transpose_inherits_source_mode(client: TestClient, bach_musicxml: str) -> None:
    # F# minor → "G" should land in G minor, not G major.
    res = client.post("/transpose", json={"musicxml": bach_musicxml, "target_key": "G"})
    assert res.status_code == 200
    body = res.json()
    assert "G minor" in body["to_key"]


def test_transpose_explicit_major(client: TestClient, bach_musicxml: str) -> None:
    res = client.post("/transpose", json={"musicxml": bach_musicxml, "target_key": "G major"})
    assert res.status_code == 200
    body = res.json()
    assert "G major" in body["to_key"]


def test_invalid_musicxml_returns_400(client: TestClient) -> None:
    res = client.post("/score/notes", json={"musicxml": "<not-musicxml/>"})
    assert res.status_code == 400


def test_chat_without_key_returns_503(client: TestClient) -> None:
    # No ANTHROPIC_API_KEY in tests → service-unavailable.
    res = client.post(
        "/agent/chat",
        json={"messages": [{"role": "user", "content": "hello"}]},
    )
    assert res.status_code == 503
