"""Tests for POST /agent/panel — multi-agent composition panel.

The endpoint returns 200 in all cases (even without an API key), since
the panel degrades gracefully instead of raising a 503. Without a key
the summary contains "requires" or "API key" and each contribution has
reply="[API key required]".
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app

FIXTURES = Path(__file__).resolve().parents[3] / "apps" / "desktop" / "public" / "fixtures"

SAMPLE_XML = """\
<?xml version="1.0"?>
<score-partwise version="4.0">
  <part id="P1"><measure number="1"><note><pitch><step>C</step><octave>4</octave></pitch>
  <duration>4</duration><type>whole</type></note></measure></part>
</score-partwise>"""


@pytest.fixture()
def client() -> TestClient:
    return TestClient(create_app())


def test_panel_without_api_key_returns_stub(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Without ANTHROPIC_API_KEY the panel returns 200 with a stub summary."""
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)

    resp = client.post(
        "/agent/panel",
        json={"message": "Write a short étude in C major."},
    )
    assert resp.status_code == 200
    body = resp.json()
    summary_lower = body["summary"].lower()
    assert "api key" in summary_lower or "requires" in summary_lower


def test_panel_contributions_have_four_agents(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The contributions list always contains exactly 4 items with 'agent' and 'reply'."""
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)

    resp = client.post(
        "/agent/panel",
        json={"message": "Compose a fugue in D minor."},
    )
    assert resp.status_code == 200
    body = resp.json()
    contributions = body["contributions"]
    assert len(contributions) == 4
    for c in contributions:
        assert "agent" in c
        assert "reply" in c


def test_panel_accepts_score_musicxml(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Sending score_musicxml alongside the message returns 200 without error."""
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)

    resp = client.post(
        "/agent/panel",
        json={
            "message": "Reharmonize the opening phrase.",
            "score_musicxml": SAMPLE_XML,
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "summary" in body
    assert "contributions" in body


def test_panel_without_score(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Sending score_musicxml=null (omitted) returns 200 without error."""
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)

    resp = client.post(
        "/agent/panel",
        json={"message": "Plan the form of a piano sonata.", "score_musicxml": None},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "summary" in body
    assert len(body["contributions"]) == 4
