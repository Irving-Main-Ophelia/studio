"""Liveness/readiness endpoint."""

from fastapi import APIRouter

from app import __phase__, __version__

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "version": __version__, "phase": __phase__}
