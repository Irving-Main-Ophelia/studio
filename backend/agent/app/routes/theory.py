"""Theory endpoints — analyzers + validators (M1.3).

Each route is a thin pass-through to the canonical ``stockhausen_theory``
package. Pydantic input models are intentionally permissive so the agent
tool calls share the same surface.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from stockhausen_theory import (
    analyze_cadences,
    analyze_motifs,
    analyze_progression,
    analyze_range,
    analyze_voice_leading,
    transpose_region,
    validate_range,
    validate_rhythm,
    validate_voice_leading,
    validate_voicing,
)

from app.agent_tools import theory_analyze_form, theory_explain

router = APIRouter(prefix="/theory", tags=["theory"])


class ScoreIn(BaseModel):
    musicxml: str = Field(..., description="Source MusicXML 4.0 string.")


class MotifsIn(ScoreIn):
    n: int = Field(4, ge=2, le=10)
    min_occurrences: int = Field(2, ge=2)


class TransposeRegionIn(BaseModel):
    musicxml: str
    target_key: str | None = None
    interval_name: str | None = None
    measure_start: int = Field(..., ge=1)
    measure_end: int = Field(..., ge=1)
    part_indices: list[int] | None = None


def _bad(detail: str) -> HTTPException:
    return HTTPException(status_code=400, detail=detail)


@router.post("/progression")
def route_progression(req: ScoreIn) -> dict[str, Any]:
    try:
        return analyze_progression(req.musicxml)
    except Exception as exc:  # noqa: BLE001
        raise _bad(str(exc)) from exc


@router.post("/voice-leading")
def route_voice_leading(req: ScoreIn) -> dict[str, Any]:
    try:
        return analyze_voice_leading(req.musicxml)
    except Exception as exc:  # noqa: BLE001
        raise _bad(str(exc)) from exc


@router.post("/range")
def route_range(req: ScoreIn) -> dict[str, Any]:
    try:
        return analyze_range(req.musicxml)
    except Exception as exc:  # noqa: BLE001
        raise _bad(str(exc)) from exc


@router.post("/cadences")
def route_cadences(req: ScoreIn) -> dict[str, Any]:
    try:
        return analyze_cadences(req.musicxml)
    except Exception as exc:  # noqa: BLE001
        raise _bad(str(exc)) from exc


@router.post("/motifs")
def route_motifs(req: MotifsIn) -> dict[str, Any]:
    try:
        return analyze_motifs(req.musicxml, n=req.n, min_occurrences=req.min_occurrences)
    except Exception as exc:  # noqa: BLE001
        raise _bad(str(exc)) from exc


@router.post("/validate/voice-leading")
def route_v_voice_leading(req: ScoreIn) -> dict[str, Any]:
    try:
        return validate_voice_leading(req.musicxml)
    except Exception as exc:  # noqa: BLE001
        raise _bad(str(exc)) from exc


@router.post("/validate/range")
def route_v_range(req: ScoreIn) -> dict[str, Any]:
    try:
        return validate_range(req.musicxml)
    except Exception as exc:  # noqa: BLE001
        raise _bad(str(exc)) from exc


@router.post("/validate/voicing")
def route_v_voicing(req: ScoreIn) -> dict[str, Any]:
    try:
        return validate_voicing(req.musicxml)
    except Exception as exc:  # noqa: BLE001
        raise _bad(str(exc)) from exc


@router.post("/validate/rhythm")
def route_v_rhythm(req: ScoreIn) -> dict[str, Any]:
    try:
        return validate_rhythm(req.musicxml)
    except Exception as exc:  # noqa: BLE001
        raise _bad(str(exc)) from exc


@router.post("/form")
def route_form(req: ScoreIn) -> dict[str, Any]:
    """Phase-2 form analysis: cadence-based phrase and section detection."""
    try:
        return theory_analyze_form(req.musicxml)
    except Exception as exc:  # noqa: BLE001
        raise _bad(str(exc)) from exc


class ExplainIn(ScoreIn):
    measure_start: int = Field(..., ge=1)
    measure_end: int = Field(..., ge=1)


@router.post("/explain")
def route_explain(req: ExplainIn) -> dict[str, Any]:
    """Pillar-8 Theory Tutor digest for a measure range."""
    try:
        return theory_explain(
            req.musicxml,
            measure_start=req.measure_start,
            measure_end=req.measure_end,
        )
    except Exception as exc:  # noqa: BLE001
        raise _bad(str(exc)) from exc


@router.post("/transpose-region")
def route_transpose_region(req: TransposeRegionIn) -> dict[str, Any]:
    try:
        return transpose_region(
            req.musicxml,
            target_key=req.target_key,
            interval_name=req.interval_name,
            measure_start=req.measure_start,
            measure_end=req.measure_end,
            part_indices=req.part_indices,
        )
    except ValueError as exc:
        raise _bad(str(exc)) from exc
