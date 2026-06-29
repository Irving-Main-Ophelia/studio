"""Integration tests for the /style/* routes."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes.style import router as style_router

FIXTURES = Path(__file__).resolve().parents[3] / "apps" / "desktop" / "public" / "fixtures"


def _make_app() -> FastAPI:
    app = FastAPI()
    app.include_router(style_router)
    return app


@pytest.fixture()
def client() -> TestClient:
    return TestClient(_make_app())


@pytest.fixture()
def bach_musicxml() -> str:
    return (FIXTURES / "bach-chorale-bwv66-6.musicxml").read_text()


def test_list_composers_returns_six(client: TestClient) -> None:
    """GET /style/composers returns 200 and exactly 6 entries."""
    res = client.get("/style/composers")
    assert res.status_code == 200
    body = res.json()
    assert isinstance(body, list)
    assert len(body) == 6
    ids = {c["id"] for c in body}
    assert "rachmaninoff" in ids
    assert "brouwer" in ids
    assert "ponce" in ids


def test_list_guitar_styles_returns_eight(client: TestClient) -> None:
    """GET /style/guitar/styles returns 200 and all 8 variation styles."""
    res = client.get("/style/guitar/styles")
    assert res.status_code == 200
    body = res.json()
    assert "styles" in body
    assert len(body["styles"]) == 8
    ids = {s["id"] for s in body["styles"]}
    assert "chan_cil_tema" in ids
    assert "var2_brouwer" in ids
    assert "coda_memoria" in ids


def test_apply_no_api_key_returns_503(
    client: TestClient, bach_musicxml: str, no_anthropic_key: None
) -> None:
    """POST /style/apply returns 503 when ANTHROPIC_API_KEY is absent."""
    # In the test environment there is no real API key, so the endpoint returns 503.
    res = client.post(
        "/style/apply",
        json={"musicxml": bach_musicxml, "composer_id": "rachmaninoff", "intensity": 0.4},
    )
    assert res.status_code == 503
    assert "ANTHROPIC_API_KEY" in res.json()["detail"]


def test_apply_unknown_composer_returns_422(client: TestClient, bach_musicxml: str) -> None:
    """POST /style/apply with an unknown composer_id returns 422."""
    res = client.post(
        "/style/apply",
        json={"musicxml": bach_musicxml, "composer_id": "chopin", "intensity": 0.4},
    )
    assert res.status_code == 422


def test_apply_guitar_style_no_api_key_returns_503(
    client: TestClient, bach_musicxml: str, no_anthropic_key: None
) -> None:
    """POST /style/guitar/apply returns 503 when ANTHROPIC_API_KEY is absent."""
    res = client.post(
        "/style/guitar/apply",
        json={"musicxml": bach_musicxml, "style_id": "var3_ponce", "intensity": 0.6},
    )
    assert res.status_code == 503


def test_apply_guitar_style_unknown_id_returns_422(
    client: TestClient, bach_musicxml: str
) -> None:
    """POST /style/guitar/apply with an unknown style_id returns 422."""
    res = client.post(
        "/style/guitar/apply",
        json={"musicxml": bach_musicxml, "style_id": "unknown_style", "intensity": 0.5},
    )
    assert res.status_code == 422
