"""Tests for POST /generate/score.

The route requires ANTHROPIC_API_KEY to actually call Claude. Without a
key it returns 503 (same pattern as /agent/chat).  With a key the route
calls the generator, which we mock here so no real subprocess runs.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.main import create_app

SAMPLE_XML = """\
<?xml version="1.0"?>
<score-partwise version="4.0">
  <part id="P1"><measure number="1"><note><pitch><step>C</step><octave>4</octave></pitch>
  <duration>4</duration><type>whole</type></note></measure></part>
</score-partwise>"""


@pytest.fixture()
def client() -> TestClient:
    return TestClient(create_app())


def test_generate_score_without_key_returns_503(client: TestClient) -> None:
    """Without ANTHROPIC_API_KEY the route must return 503."""
    with patch("app.routes.generate._generate") as mock_gen:
        mock_gen.side_effect = RuntimeError("ANTHROPIC_API_KEY not configured.")
        resp = client.post(
            "/generate/score",
            json={"prompt": "a short étude in C major"},
        )
    assert resp.status_code == 503


def test_generate_score_with_mocked_generator_returns_musicxml(
    client: TestClient,
) -> None:
    """When the generator succeeds the route returns musicxml + script."""
    with patch("app.routes.generate._generate") as mock_gen:
        mock_gen.return_value = {
            "musicxml": SAMPLE_XML,
            "script": "import music21",
            "description": "a short étude in C major",
        }
        resp = client.post(
            "/generate/score",
            json={
                "prompt": "a short étude in C major",
                "constraints": {"bars": 8, "key": "C major"},
            },
        )
    assert resp.status_code == 200
    body = resp.json()
    assert "<score-partwise" in body["musicxml"]
    assert "script" in body
    assert "description" in body


def test_generate_score_propagates_script_error(client: TestClient) -> None:
    """If the generated script fails, the route returns 422."""
    with patch("app.routes.generate._generate") as mock_gen:
        mock_gen.side_effect = RuntimeError("Script failed: SyntaxError")
        resp = client.post(
            "/generate/score",
            json={"prompt": "broken piece"},
        )
    assert resp.status_code == 422
