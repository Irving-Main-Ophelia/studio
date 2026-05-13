"""Score utility endpoints — note extraction for playback."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.tools.theory import analyze_key, extract_notes

router = APIRouter(prefix="/score", tags=["score"])


class ScoreIn(BaseModel):
    musicxml: str = Field(..., description="Source MusicXML 4.0 string.")


class NoteOut(BaseModel):
    midi: int
    start_sec: float
    duration_sec: float
    part_index: int
    velocity: int


class NotesResponse(BaseModel):
    tempo_bpm: float
    duration_sec: float
    notes: list[NoteOut]


class KeyResponse(BaseModel):
    key: str
    mode: str
    confidence: float


@router.post("/notes", response_model=NotesResponse)
def notes(req: ScoreIn) -> NotesResponse:
    try:
        return NotesResponse(**extract_notes(req.musicxml))
    except Exception as exc:  # noqa: BLE001 — surface parse errors to the client
        raise HTTPException(status_code=400, detail=f"Could not parse MusicXML: {exc}") from exc


@router.post("/key", response_model=KeyResponse)
def analyze(req: ScoreIn) -> KeyResponse:
    try:
        return KeyResponse(**analyze_key(req.musicxml))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Could not analyze key: {exc}") from exc
