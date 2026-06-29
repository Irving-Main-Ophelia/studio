"""Shared pytest fixtures for the agent backend tests."""

from __future__ import annotations

import pytest

from app.config import get_settings


@pytest.fixture()
def no_anthropic_key(monkeypatch: pytest.MonkeyPatch) -> None:
    """Force the absence of `ANTHROPIC_API_KEY` for "no key → 503" tests.

    `backend/agent/.env` normally carries a real key (PREREQUISITES.md / CLAUDE.md),
    and `get_settings()` is `lru_cache`d, so the no-key tests otherwise fail in any
    environment where the key is configured — which is the maintainer's normal setup.
    This clears the key and busts the settings cache for the duration of the test,
    then restores it so other tests still see the real key.
    """
    monkeypatch.setenv("ANTHROPIC_API_KEY", "")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()
