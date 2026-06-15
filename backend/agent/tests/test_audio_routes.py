"""Integration tests for the /audio/* routes."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture()
def client() -> TestClient:
    from app.routes import audio  # noqa: F401

    app = create_app()
    already = any(r.path.startswith("/audio") for r in app.routes)
    if not already:
        from app.routes.audio import router as audio_router
        app.include_router(audio_router)
    return TestClient(app)


def test_audio_capabilities_structure(client: TestClient) -> None:
    """GET /audio/capabilities must return 200 with required fields."""
    res = client.get("/audio/capabilities")
    assert res.status_code == 200
    body = res.json()
    # stem_separation is still a future feature
    assert body["stem_separation"] is False
    # transcription field is present (True if basic-pitch installed, False otherwise)
    assert "transcription" in body
    # requires_modal is False — Basic Pitch runs on CPU
    assert body["requires_modal"] is False


def test_audio_import_missing_payload(client: TestClient) -> None:
    """POST /audio/import with no audio data returns 422."""
    res = client.post("/audio/import", json={"filename": "test.mp3"})
    # Without audio_base64 or audio_url: either 422 (validation) or 503 (no basic-pitch)
    assert res.status_code in (422, 503)


def test_audio_import_no_engines_returns_503(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    """POST /audio/import returns 503 when the AMT venv is not available."""
    import app.routes.audio as audio_mod
    monkeypatch.setattr(audio_mod, "_amt_venv_available", lambda: False)
    res = client.post(
        "/audio/import",
        json={"filename": "test.wav", "audio_base64": "AAAA"},
    )
    assert res.status_code == 503
    assert "venv" in res.json()["detail"].lower()
