"""FastAPI entry point for the local Stockhausen agent backend."""

from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.config import get_settings
from app.routes import chat, health, score, score_edit, transpose

settings = get_settings()
logging.basicConfig(level=settings.log_level.upper())
logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    """Construct the FastAPI app. Imported by uvicorn."""
    app = FastAPI(
        title="Stockhausen Agent",
        version=__version__,
        description=(
            "Local agent backend for Stockhausen — music21 theory tools + "
            "Claude tool-use chat. Bound to 127.0.0.1; never exposed."
        ),
    )

    # The desktop app runs on a tauri:// origin; we accept localhost during dev.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:1420", "tauri://localhost"],
        allow_methods=["*"],
        allow_headers=["*"],
        allow_credentials=False,
    )

    app.include_router(health.router)
    app.include_router(transpose.router)
    app.include_router(score.router)
    app.include_router(score_edit.router)
    app.include_router(chat.router)

    return app


app = create_app()
