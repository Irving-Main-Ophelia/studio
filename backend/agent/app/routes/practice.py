"""Pillar-10 practice coach endpoints.

POST /practice/compare  — full comparison report (errors, heat-map, plan)
POST /practice/plan     — practice plan only (subset of compare)
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from stockhausen_theory import compare_performance

router = APIRouter(prefix="/practice", tags=["practice"])


class CompareRequest(BaseModel):
    target_musicxml: str = Field(..., description="Target MusicXML (what should be played).")
    performance_musicxml: str = Field(
        ..., description="Performance MusicXML (what was actually played, MIDI-derived)."
    )


def _bad(detail: str) -> HTTPException:
    return HTTPException(status_code=400, detail=detail)


@router.post("/compare")
def route_compare(req: CompareRequest) -> dict[str, Any]:
    """Compare a performance against the target score.

    Returns a full report: total errors, errors by measure, heat-map, and
    the top-5 practice plan ordered worst-first.
    """
    try:
        return compare_performance(req.target_musicxml, req.performance_musicxml)
    except Exception as exc:  # noqa: BLE001
        raise _bad(f"Practice comparison failed: {exc}") from exc


@router.post("/plan")
def route_plan(req: CompareRequest) -> dict[str, Any]:
    """Return the practice plan only (top-5 measures, worst-first).

    Runs the same comparison as /practice/compare but returns only the
    practice_plan list so the frontend can render a focused view.
    """
    try:
        result = compare_performance(req.target_musicxml, req.performance_musicxml)
        return {"practice_plan": result["practice_plan"]}
    except Exception as exc:  # noqa: BLE001
        raise _bad(f"Practice plan generation failed: {exc}") from exc
