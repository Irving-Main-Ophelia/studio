"""Pillar-6 orchestration endpoints.

POST /orchestration/profiles  — list available profiles
POST /orchestration/apply     — apply a profile to a score
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from stockhausen_theory import apply_profile, list_profiles

router = APIRouter(prefix="/orchestration", tags=["orchestration"])


class ApplyProfileRequest(BaseModel):
    musicxml: str = Field(..., description="Source MusicXML string.")
    profile: str = Field(..., description="Profile name (e.g. 'string_quartet').")


def _bad(detail: str) -> HTTPException:
    return HTTPException(status_code=400, detail=detail)


@router.get("/profiles")
def route_list_profiles() -> list[dict[str, str]]:
    """Return [{name, display_name}] for all available profiles."""
    return list_profiles()


@router.post("/apply")
def route_apply_profile(req: ApplyProfileRequest) -> dict[str, Any]:
    """Apply an orchestration profile — reassign parts, validate ranges."""
    try:
        return apply_profile(req.musicxml, req.profile)
    except ValueError as exc:
        raise _bad(str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise _bad(f"Orchestration failed: {exc}") from exc
