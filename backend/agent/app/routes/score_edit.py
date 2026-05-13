"""Symbolic score-editing endpoints used by the M1.1 notation editor.

Every endpoint takes the current MusicXML, applies a *single* operation,
and returns the freshly serialised MusicXML. The frontend mirrors the
operation into its `OperationLog` so undo/redo travels along the same
journal as transpositions.

Errors are surfaced as HTTP 400 with a human-readable detail string so
they can be displayed inline in the editor.
"""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

from app.tools.score_edit import (
    ALLOWED_ARTICULATIONS,
    ALLOWED_DYNAMICS,
    append_measure,
    insert_note,
    insert_rest,
    remove_note,
    set_dynamic,
    set_tie,
    toggle_articulation,
)

router = APIRouter(prefix="/score/edit", tags=["score-edit"])


class _Common(BaseModel):
    musicxml: str = Field(..., description="Current canonical MusicXML.")
    part_index: int = Field(0, ge=0, description="0-indexed part within the score.")
    measure_number: int = Field(1, ge=1, description="1-indexed measure number.")
    beat_offset: float = Field(
        0.0,
        ge=0.0,
        description="Quarter-note offset within the measure (0 = downbeat).",
    )
    voice: int | None = Field(None, ge=1)


class InsertNoteIn(_Common):
    pitch: str = Field(..., description="Scientific pitch name, e.g. 'C5', 'F#4'.")
    duration_quarters: float = Field(..., gt=0)
    replace: bool = True


class InsertRestIn(_Common):
    duration_quarters: float = Field(..., gt=0)


class RemoveNoteIn(_Common):
    pass


class ArticulationIn(_Common):
    articulation: str = Field(...)

    @field_validator("articulation")
    @classmethod
    def _allowed(cls, v: str) -> str:
        if v not in ALLOWED_ARTICULATIONS:
            raise ValueError(
                f"Unsupported articulation '{v}'. Allowed: {sorted(ALLOWED_ARTICULATIONS)}"
            )
        return v


class TieIn(_Common):
    tie_type: Literal["start", "stop", "continue", "none"]


class DynamicIn(BaseModel):
    musicxml: str
    part_index: int = Field(0, ge=0)
    measure_number: int = Field(1, ge=1)
    beat_offset: float = Field(0.0, ge=0.0)
    dynamic: str

    @field_validator("dynamic")
    @classmethod
    def _allowed(cls, v: str) -> str:
        if v not in ALLOWED_DYNAMICS:
            raise ValueError(f"Unsupported dynamic '{v}'. Allowed: {ALLOWED_DYNAMICS}")
        return v


class AppendMeasureIn(BaseModel):
    musicxml: str
    part_index: int = Field(0, ge=0)


class EditCursor(BaseModel):
    part_index: int
    measure_number: int
    beat_offset: float
    voice: int | None = None


class InsertResponse(BaseModel):
    musicxml: str
    next_cursor: EditCursor


class InsertedNote(BaseModel):
    pitch: str
    midi: int
    duration_quarters: float


class InsertNoteResponse(InsertResponse):
    inserted_note: InsertedNote


class MusicxmlOnly(BaseModel):
    musicxml: str


class ToggleResponse(MusicxmlOnly):
    action: Literal["added", "removed"]


class AppendMeasureResponse(MusicxmlOnly):
    new_measure_number: int


def _bad(detail: str) -> HTTPException:
    return HTTPException(status_code=400, detail=detail)


@router.post("/note/insert", response_model=InsertNoteResponse)
def route_insert_note(req: InsertNoteIn) -> InsertNoteResponse:
    try:
        result = insert_note(
            req.musicxml,
            part_index=req.part_index,
            measure_number=req.measure_number,
            beat_offset=req.beat_offset,
            pitch=req.pitch,
            duration_quarters=req.duration_quarters,
            voice=req.voice,
            replace=req.replace,
        )
        return InsertNoteResponse(**result)
    except ValueError as exc:
        raise _bad(str(exc)) from exc


@router.post("/note/rest", response_model=InsertResponse)
def route_insert_rest(req: InsertRestIn) -> InsertResponse:
    try:
        result = insert_rest(
            req.musicxml,
            part_index=req.part_index,
            measure_number=req.measure_number,
            beat_offset=req.beat_offset,
            duration_quarters=req.duration_quarters,
            voice=req.voice,
        )
        return InsertResponse(**result)
    except ValueError as exc:
        raise _bad(str(exc)) from exc


@router.post("/note/remove", response_model=MusicxmlOnly)
def route_remove_note(req: RemoveNoteIn) -> MusicxmlOnly:
    try:
        return MusicxmlOnly(
            **remove_note(
                req.musicxml,
                part_index=req.part_index,
                measure_number=req.measure_number,
                beat_offset=req.beat_offset,
                voice=req.voice,
            )
        )
    except ValueError as exc:
        raise _bad(str(exc)) from exc


@router.post("/articulation/toggle", response_model=ToggleResponse)
def route_articulation(req: ArticulationIn) -> ToggleResponse:
    try:
        return ToggleResponse(
            **toggle_articulation(
                req.musicxml,
                part_index=req.part_index,
                measure_number=req.measure_number,
                beat_offset=req.beat_offset,
                articulation=req.articulation,
                voice=req.voice,
            )
        )
    except ValueError as exc:
        raise _bad(str(exc)) from exc


@router.post("/tie/set", response_model=MusicxmlOnly)
def route_tie(req: TieIn) -> MusicxmlOnly:
    try:
        return MusicxmlOnly(
            **set_tie(
                req.musicxml,
                part_index=req.part_index,
                measure_number=req.measure_number,
                beat_offset=req.beat_offset,
                tie_type=req.tie_type,
                voice=req.voice,
            )
        )
    except ValueError as exc:
        raise _bad(str(exc)) from exc


@router.post("/dynamic/set", response_model=MusicxmlOnly)
def route_dynamic(req: DynamicIn) -> MusicxmlOnly:
    try:
        return MusicxmlOnly(
            **set_dynamic(
                req.musicxml,
                part_index=req.part_index,
                measure_number=req.measure_number,
                beat_offset=req.beat_offset,
                dynamic=req.dynamic,
            )
        )
    except ValueError as exc:
        raise _bad(str(exc)) from exc


@router.post("/measure/append", response_model=AppendMeasureResponse)
def route_append_measure(req: AppendMeasureIn) -> AppendMeasureResponse:
    try:
        return AppendMeasureResponse(**append_measure(req.musicxml, part_index=req.part_index))
    except ValueError as exc:
        raise _bad(str(exc)) from exc
