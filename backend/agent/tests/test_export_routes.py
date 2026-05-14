"""Integration tests for the /export/* routes (M1.5)."""

from __future__ import annotations

import base64
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app

FIXTURES = Path(__file__).resolve().parents[3] / "apps" / "desktop" / "public" / "fixtures"


@pytest.fixture()
def client() -> TestClient:
    return TestClient(create_app())


@pytest.fixture()
def andante_musicxml() -> str:
    return (FIXTURES / "andante-c-sharp-minor.musicxml").read_text()


def test_export_musicxml_round_trips(client: TestClient, andante_musicxml: str) -> None:
    res = client.post("/export/musicxml", json={"musicxml": andante_musicxml})
    assert res.status_code == 200
    body = res.json()
    assert "<score-partwise" in body["musicxml"]


def test_export_midi_returns_bytes(client: TestClient, andante_musicxml: str) -> None:
    res = client.post("/export/midi", json={"musicxml": andante_musicxml})
    assert res.status_code == 200
    body = res.json()
    raw = base64.b64decode(body["midi_base64"])
    assert raw.startswith(b"MThd"), "MIDI header should be 'MThd'"
    assert body["byte_count"] == len(raw)


def test_export_wav_returns_audio(client: TestClient, andante_musicxml: str) -> None:
    res = client.post("/export/wav", json={"musicxml": andante_musicxml})
    assert res.status_code == 200
    body = res.json()
    raw = base64.b64decode(body["wav_base64"])
    assert raw[0:4] == b"RIFF"
    assert raw[8:12] == b"WAVE"
    assert body["sample_rate"] == 44100
    assert body["duration_sec"] > 0
