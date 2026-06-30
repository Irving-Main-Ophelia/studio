"""Fretboard chord/scale engine endpoints (Phase 4 / Track A — A5 + A6).

Generates guitar chord voicings and scale shapes algorithmically (no static DB),
honouring a part's tuning/capo. Consumed by the fretboard viewer (A4) and reachable
from the agent. Pure derivation — no score mutation, no persistence.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.tools.fretboard import DEFAULT_MAX_FRET
from app.tools.guitar_engine import SCALE_INTERVALS, chord_voicings, scale_shape

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/guitar", tags=["guitar-engine"])


class ChordVoicingsIn(BaseModel):
    chord: str = Field(..., description="Chord symbol, e.g. 'Cmaj7', 'Am', 'G7', 'Bb'.")
    tuning: list[str] | None = Field(
        None, description="Open-string pitches, string 1 (highest) first. Null ⇒ standard."
    )
    capo: int = Field(0, ge=0, le=24)
    max_fret: int = Field(15, ge=3, le=24)
    max_voicings: int = Field(6, ge=1, le=20)


class FretPositionOut(BaseModel):
    string: int
    fret: int
    midi: int
    pitch: str
    is_root: bool


class VoicingOut(BaseModel):
    positions: list[FretPositionOut]
    base_fret: int
    fret_span: int
    lowest_pitch: str
    root_in_bass: bool
    difficulty: str


class ChordVoicingsResponse(BaseModel):
    chord: str
    root_pc: int
    pitch_classes: list[int]
    voicings: list[VoicingOut]
    count: int


class ScaleShapeIn(BaseModel):
    tonic: str = Field(..., description="Tonic pitch name, e.g. 'A', 'F#', 'Bb'.")
    scale: str = Field("major", description=f"One of: {sorted(SCALE_INTERVALS)}")
    tuning: list[str] | None = None
    capo: int = Field(0, ge=0, le=24)
    min_fret: int = Field(0, ge=0, le=24)
    span: int = Field(4, ge=1, le=12)
    max_fret: int = Field(DEFAULT_MAX_FRET, ge=1, le=36)


class ScalePositionOut(BaseModel):
    string: int
    fret: int
    midi: int
    pitch: str
    is_root: bool
    degree: int


class ScaleShapeResponse(BaseModel):
    tonic: str
    scale: str
    pitch_classes: list[int]
    tonic_pc: int
    positions: list[ScalePositionOut]
    min_fret: int
    max_fret: int


@router.post("/chord/voicings", response_model=ChordVoicingsResponse)
def route_chord_voicings(req: ChordVoicingsIn) -> ChordVoicingsResponse:
    try:
        result = chord_voicings(
            req.chord,
            tuning=req.tuning,
            capo=req.capo,
            max_fret=req.max_fret,
            max_voicings=req.max_voicings,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.warning("chord voicings failed: %s", exc)
        raise HTTPException(status_code=400, detail=f"Could not voice chord: {exc}") from exc
    return ChordVoicingsResponse(**result)


@router.post("/scale/shape", response_model=ScaleShapeResponse)
def route_scale_shape(req: ScaleShapeIn) -> ScaleShapeResponse:
    try:
        result = scale_shape(
            req.tonic,
            req.scale,
            tuning=req.tuning,
            capo=req.capo,
            min_fret=req.min_fret,
            span=req.span,
            max_fret=req.max_fret,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.warning("scale shape failed: %s", exc)
        raise HTTPException(status_code=400, detail=f"Could not build scale shape: {exc}") from exc
    return ScaleShapeResponse(**result)
