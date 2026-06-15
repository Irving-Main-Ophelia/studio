"""Integration tests for the /practice/* routes (Pillar-10)."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes.practice import router as practice_router

FIXTURES = Path(__file__).resolve().parents[3] / "apps" / "desktop" / "public" / "fixtures"


def _make_app() -> FastAPI:
    app = FastAPI()
    app.include_router(practice_router)
    return app


@pytest.fixture()
def client() -> TestClient:
    return TestClient(_make_app())


@pytest.fixture()
def bach_musicxml() -> str:
    return (FIXTURES / "bach-chorale-bwv66-6.musicxml").read_text()


def test_compare_returns_result(client: TestClient, bach_musicxml: str) -> None:
    """POST /practice/compare with same xml twice should return 200 and total_errors == 0."""
    res = client.post(
        "/practice/compare",
        json={
            "target_musicxml": bach_musicxml,
            "performance_musicxml": bach_musicxml,
        },
    )
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    body = res.json()
    assert "total_errors" in body
    assert body["total_errors"] == 0, (
        f"Expected 0 errors comparing score against itself, got {body['total_errors']}"
    )
    assert "heat_map" in body
    assert "errors_by_measure" in body


def test_plan_returns_list(client: TestClient, bach_musicxml: str) -> None:
    """POST /practice/plan should return 200 and practice_plan as a list."""
    res = client.post(
        "/practice/plan",
        json={
            "target_musicxml": bach_musicxml,
            "performance_musicxml": bach_musicxml,
        },
    )
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    body = res.json()
    assert "practice_plan" in body, "Expected 'practice_plan' key in response"
    assert isinstance(body["practice_plan"], list), "'practice_plan' should be a list"
