"""Symbolic transposition endpoint backed by music21."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.tools.theory import transpose_musicxml

router = APIRouter(tags=["score"])


class TransposeRequest(BaseModel):
    musicxml: str = Field(..., description="Source score as a MusicXML 4.0 string.")
    target_key: str = Field(
        ...,
        description="Target key as a tonal name with mode, e.g. 'F#m', 'Bb', 'G major'.",
    )


class TransposeResponse(BaseModel):
    musicxml: str
    from_key: str | None
    to_key: str
    interval: str


@router.post("/transpose", response_model=TransposeResponse)
def transpose(req: TransposeRequest) -> TransposeResponse:
    try:
        result = transpose_musicxml(req.musicxml, req.target_key)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return TransposeResponse(**result)
