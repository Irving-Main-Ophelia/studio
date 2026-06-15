"""Integration tests for the Pillar-12 production export endpoints."""

from __future__ import annotations

import base64
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app

FIXTURES = Path(__file__).resolve().parents[3] / "apps" / "desktop" / "public" / "fixtures"

MINIMAL_MUSICXML = """\
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC
  "-//Recordare//DTD MusicXML 4.0 Partwise//EN"
  "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <direction placement="above">
        <direction-type>
          <metronome parentheses="no">
            <beat-unit>quarter</beat-unit>
            <per-minute>120</per-minute>
          </metronome>
        </direction-type>
        <sound tempo="120"/>
      </direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><rest/><duration>1</duration><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>
"""


@pytest.fixture()
def client() -> TestClient:
    return TestClient(create_app())


@pytest.fixture()
def bach_musicxml() -> str:
    return (FIXTURES / "bach-chorale-bwv66-6.musicxml").read_text()


# ---------------------------------------------------------------------------
# Click-track tests
# ---------------------------------------------------------------------------


def test_click_track_returns_wav_b64(client: TestClient) -> None:
    """POST /export/click-track must return 200 with a non-empty, decodable wav_b64."""
    res = client.post(
        "/export/click-track",
        json={"musicxml": MINIMAL_MUSICXML, "tempo_bpm": 120.0, "beats_per_bar": 4},
    )
    assert res.status_code == 200
    body = res.json()
    assert "wav_b64" in body
    assert body["wav_b64"], "wav_b64 must be non-empty"
    raw = base64.b64decode(body["wav_b64"])
    assert raw[:4] == b"RIFF", "Decoded bytes should start with RIFF (WAV header)"
    assert raw[8:12] == b"WAVE"


def test_click_track_has_correct_tempo(client: TestClient) -> None:
    """Response tempo_bpm should echo back 120 when explicitly requested."""
    res = client.post(
        "/export/click-track",
        json={"musicxml": MINIMAL_MUSICXML, "tempo_bpm": 120.0, "beats_per_bar": 4},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["tempo_bpm"] == pytest.approx(120.0)
    assert body["beats_per_bar"] == 4


def test_click_track_duration_override(client: TestClient) -> None:
    """duration_sec override should be respected in the response."""
    res = client.post(
        "/export/click-track",
        json={
            "musicxml": MINIMAL_MUSICXML,
            "tempo_bpm": 100.0,
            "beats_per_bar": 3,
            "duration_sec": 5.0,
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["duration_sec"] == pytest.approx(5.0, abs=0.1)


def test_click_track_with_bach_fixture(client: TestClient, bach_musicxml: str) -> None:
    """Click-track generation should succeed with a real multi-part score."""
    res = client.post("/export/click-track", json={"musicxml": bach_musicxml})
    assert res.status_code == 200
    body = res.json()
    raw = base64.b64decode(body["wav_b64"])
    assert raw[:4] == b"RIFF"
    assert body["duration_sec"] > 0


# ---------------------------------------------------------------------------
# Minus-one tests
# ---------------------------------------------------------------------------


def test_minus_one_returns_stub(client: TestClient) -> None:
    """POST /export/minus-one must return 200 with status='stub'."""
    res = client.post(
        "/export/minus-one",
        json={"musicxml": MINIMAL_MUSICXML, "omit_part_index": 0},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "stub"
    assert "omit_part_name" in body


def test_minus_one_returns_part_name(client: TestClient, bach_musicxml: str) -> None:
    """omit_part_name should reflect the actual part name from the score."""
    res = client.post(
        "/export/minus-one",
        json={"musicxml": bach_musicxml, "omit_part_index": 0},
    )
    assert res.status_code == 200
    body = res.json()
    # Bach BWV 66-6 has named parts; the first part name should be non-empty
    assert body["omit_part_name"]


# ---------------------------------------------------------------------------
# Stems tests
# ---------------------------------------------------------------------------


def test_stems_returns_stub(client: TestClient) -> None:
    """POST /export/stems must return 200 with status='stub'."""
    res = client.post("/export/stems", json={"musicxml": MINIMAL_MUSICXML})
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "stub"


def test_stems_returns_stub_with_parts(client: TestClient, bach_musicxml: str) -> None:
    """POST /export/stems with a multi-part Bach score must list all parts."""
    res = client.post("/export/stems", json={"musicxml": bach_musicxml})
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "stub"
    assert isinstance(body["parts"], list)
    assert len(body["parts"]) > 0, "Bach BWV 66-6 has multiple parts"
    for item in body["parts"]:
        assert "index" in item
        assert "name" in item
