"""Tablature-view projection endpoint (Phase 4 / Track A — A1).

Given the canonical (standard-notation) MusicXML plus a part's tuning/capo and a
view mode, returns the view-specific MusicXML OSMD renders. The canonical score
stays standard notation and stays the source of truth (ADR-0015); this is a pure,
on-demand projection — no edit, no persistence.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

from app.tools.fretboard import DEFAULT_MAX_FRET, STANDARD_TUNING
from app.tools.tab_projection import PartView, VIEW_MODES, project_views

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/score/tab", tags=["tablature"])


class TabPartView(BaseModel):
    part_index: int = Field(0, ge=0)
    view_mode: str = Field(...)
    tuning: list[str] | None = Field(
        None, description="Open-string pitch names, string 1 (highest) first. Null ⇒ standard."
    )
    capo: int = Field(0, ge=0, le=24)
    max_fret: int = Field(DEFAULT_MAX_FRET, ge=1, le=36)

    @field_validator("view_mode")
    @classmethod
    def _allowed(cls, v: str) -> str:
        if v not in VIEW_MODES:
            raise ValueError(f"Unsupported view_mode '{v}'. Allowed: {VIEW_MODES}")
        return v


class TabProjectIn(BaseModel):
    musicxml: str
    # Per-part views (A1). For a single part, send a one-element list. The legacy
    # single-part fields below are accepted as a fallback when `parts` is omitted.
    parts: list[TabPartView] | None = None
    part_index: int = Field(0, ge=0)
    view_mode: str | None = None
    tuning: list[str] | None = None
    capo: int = Field(0, ge=0, le=24)
    max_fret: int = Field(DEFAULT_MAX_FRET, ge=1, le=36)

    @field_validator("view_mode")
    @classmethod
    def _allowed(cls, v: str | None) -> str | None:
        if v is not None and v not in VIEW_MODES:
            raise ValueError(f"Unsupported view_mode '{v}'. Allowed: {VIEW_MODES}")
        return v


class TabProjectResponse(BaseModel):
    musicxml: str


@router.post("/project", response_model=TabProjectResponse)
def route_project_view(req: TabProjectIn) -> TabProjectResponse:
    if req.parts is not None:
        specs = [
            PartView(
                part_index=p.part_index,
                view_mode=p.view_mode,
                tuning=p.tuning or list(STANDARD_TUNING),
                capo=p.capo,
                max_fret=p.max_fret,
            )
            for p in req.parts
        ]
    elif req.view_mode is not None:
        specs = [
            PartView(
                part_index=req.part_index,
                view_mode=req.view_mode,
                tuning=req.tuning or list(STANDARD_TUNING),
                capo=req.capo,
                max_fret=req.max_fret,
            )
        ]
    else:
        raise HTTPException(status_code=422, detail="Provide either `parts` or `view_mode`.")

    try:
        out = project_views(req.musicxml, specs)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001 — surface parse failures as 400, not 500
        logger.warning("tab projection failed: %s", exc)
        raise HTTPException(status_code=400, detail=f"Could not project tab view: {exc}") from exc
    return TabProjectResponse(musicxml=out)
