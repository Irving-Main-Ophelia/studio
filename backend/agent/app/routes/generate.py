"""Phase-2 — score generation (Pillar 4).

POST /generate/score
  Takes a free-text prompt + optional constraints, uses Claude to emit a
  complete music21 Python script, executes it in a subprocess, and returns
  the resulting MusicXML + the script source for transparency.
"""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.generator import generate_score as _generate

router = APIRouter(prefix="/generate", tags=["generate"])


class GenerateRequest(BaseModel):
    prompt: str = Field(..., description="Free-text description of the desired piece.")
    constraints: dict[str, Any] = Field(
        default_factory=dict,
        description=(
            "Optional hints: key, time, bars, style, texture, tempo_bpm, parts."
        ),
    )


class GenerateResponse(BaseModel):
    musicxml: str
    script: str
    description: str


@router.post("/score", response_model=GenerateResponse)
async def generate_score(req: GenerateRequest) -> GenerateResponse:
    """Generate a MusicXML score from a natural-language prompt."""
    try:
        result = await asyncio.to_thread(
            _generate, req.prompt, req.constraints
        )
    except RuntimeError as exc:
        msg = str(exc)
        status = 503 if "API_KEY" in msg else 422
        raise HTTPException(status_code=status, detail=msg) from exc

    return GenerateResponse(**result)
