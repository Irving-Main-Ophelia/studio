"""FastAPI entry point for the local Stockhausen agent backend."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.config import get_settings
from app.routes import audio, chat, export, generate, health, multi_agent, orchestration, practice, score, score_edit, style, theory, transpose

settings = get_settings()
logging.basicConfig(level=settings.log_level.upper())
logger = logging.getLogger(__name__)


class _CORSErrorMiddleware:
    """Catch unhandled route exceptions and return JSON 500 WITH CORS headers.

    Must be added AFTER CORSMiddleware via add_middleware so it sits INSIDE
    the CORS wrapper in the built chain:
        ServerErrorMiddleware → CORSMiddleware → _CORSErrorMiddleware → ExceptionMiddleware → Routes

    When a route raises an exception that ExceptionMiddleware re-raises (because
    no handler is registered for it), it propagates here. We intercept it and
    call `send` — which at this point IS already the CORSMiddleware-wrapped send
    — so the 500 response carries Access-Control-Allow-Origin.
    """

    def __init__(self, app: Any) -> None:
        self._app = app

    async def __call__(self, scope: Any, receive: Any, send: Any) -> None:
        if scope["type"] != "http":
            await self._app(scope, receive, send)
            return
        try:
            await self._app(scope, receive, send)
        except Exception as exc:
            logger.error("unhandled route exception: %s", exc, exc_info=True)
            body = b'{"detail":"Internal server error"}'
            await send({
                "type": "http.response.start",
                "status": 500,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode()),
                ],
            })
            await send({"type": "http.response.body", "body": body, "more_body": False})


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

    # add_middleware prepends — last added = outermost. Order here is intentional:
    # _CORSErrorMiddleware added first → innermost user middleware (inside CORS).
    # CORSMiddleware added second → outermost user middleware (wraps everything).
    # Built chain: ServerErrorMiddleware → CORS → _CORSErrorMiddleware → ExceptionMiddleware → Routes
    app.add_middleware(_CORSErrorMiddleware)
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
    app.include_router(theory.router)
    app.include_router(export.router)
    app.include_router(generate.router)
    app.include_router(orchestration.router)
    app.include_router(audio.router)
    app.include_router(practice.router)
    app.include_router(style.router)
    app.include_router(chat.router)
    app.include_router(multi_agent.router)

    return app


app = create_app()
