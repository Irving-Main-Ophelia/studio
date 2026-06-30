"""Symbolic score-editing endpoints used by the M1.1 notation editor.

Every endpoint takes the current MusicXML, applies a *single* operation,
and returns the freshly serialised MusicXML. The frontend mirrors the
operation into its `OperationLog` so undo/redo travels along the same
journal as transpositions.

Errors are surfaced as HTTP 400 with a human-readable detail string so
they can be displayed inline in the editor.
"""

from __future__ import annotations

import logging
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

logger = logging.getLogger(__name__)

from app.tools.score_edit import (
    ALLOWED_ARTICULATIONS,
    ALLOWED_BRACKET_SPANS,
    ALLOWED_CONNECTIVE_TECHNIQUES,
    ALLOWED_DYNAMICS,
    ALLOWED_TECHNICAL_MARKERS,
    append_measure,
    change_note_duration,
    change_note_pitch,
    find_note_by_hint,
    get_note_info,
    insert_note,
    insert_rest,
    list_notes,
    remove_note,
    respell_note,
    set_bend,
    set_bracket_span,
    set_connective_technique,
    set_dynamic,
    set_key_signature,
    set_tie,
    toggle_articulation,
    toggle_technical_marker,
    transpose_note_semitones,
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


class BendIn(_Common):
    bend_alter: int = Field(
        ..., description="Bend target in semitones (+ up, − down); 0 removes the bend."
    )
    pre_bend: bool = Field(False, description="String already bent at the note's onset.")
    release: float | None = Field(
        None, ge=0.0, description="Quarter-length offset at which the bend is released."
    )


class ConnectiveTechniqueIn(_Common):
    technique: Literal["hammer_on", "pull_off", "slide"]
    action: Literal["set", "remove"] = "set"

    @field_validator("technique")
    @classmethod
    def _allowed(cls, v: str) -> str:
        if v not in ALLOWED_CONNECTIVE_TECHNIQUES:
            raise ValueError(
                f"Unsupported technique '{v}'. Allowed: {sorted(ALLOWED_CONNECTIVE_TECHNIQUES)}"
            )
        return v


class TechnicalMarkerIn(_Common):
    marker: Literal[
        "natural_harmonic",
        "artificial_harmonic",
        "vibrato",
        "dead_note",
        "ghost_note",
        "strum_up",
        "strum_down",
    ]

    @field_validator("marker")
    @classmethod
    def _allowed(cls, v: str) -> str:
        if v not in ALLOWED_TECHNICAL_MARKERS:
            raise ValueError(
                f"Unsupported marker '{v}'. Allowed: {list(ALLOWED_TECHNICAL_MARKERS)}"
            )
        return v


class BracketSpanIn(_Common):
    technique: Literal["palm_mute", "let_ring"]
    action: Literal["set", "remove"] = "set"
    end_measure_number: int | None = Field(None, ge=1)
    end_beat_offset: float | None = Field(None, ge=0.0)

    @field_validator("technique")
    @classmethod
    def _allowed(cls, v: str) -> str:
        if v not in ALLOWED_BRACKET_SPANS:
            raise ValueError(
                f"Unsupported span technique '{v}'. Allowed: {sorted(ALLOWED_BRACKET_SPANS)}"
            )
        return v


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


class ChangeDurationIn(_Common):
    duration_quarters: float = Field(..., gt=0)


class ChangePitchIn(_Common):
    pitch: str = Field(..., description="Scientific pitch, e.g. 'F4', 'A#3'.")


class TransposeSemitonesIn(_Common):
    semitones: int = Field(..., description="Positive = up, negative = down.")


class KeySignatureIn(BaseModel):
    musicxml: str
    tonic: str = Field(..., description="Tonic pitch class, e.g. 'A', 'F#', 'Bb'.")
    mode: str = Field("major", description="'major' or 'minor'.")


class NoteInfoResponse(BaseModel):
    part_index: int
    measure_number: int
    beat_offset: float
    voice: int | None
    part_name: str
    pitch: str | None
    midi: int | None
    duration_quarters: float
    articulations: list[str]
    is_rest: bool


class MusicxmlOnly(BaseModel):
    musicxml: str


class ListNotesIn(BaseModel):
    musicxml: str


class ListedNote(BaseModel):
    part_index: int
    measure_number: int
    beat_offset: float
    voice: int | None
    part_name: str
    pitch: str
    midi: int | None
    duration_quarters: float


class ListNotesResponse(BaseModel):
    notes: list[ListedNote]


class RespellResponse(MusicxmlOnly):
    pitch: str


class PitchResponse(MusicxmlOnly):
    pitch: str


class KeySignatureResponse(MusicxmlOnly):
    key: str


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


class ToggleResponse(MusicxmlOnly):
    action: Literal["added", "removed"]


class TechnicalResponse(MusicxmlOnly):
    action: Literal["added", "removed", "changed", "unchanged"]


class AppendMeasureResponse(MusicxmlOnly):
    new_measure_number: int


def _bad(detail: str) -> HTTPException:
    return HTTPException(status_code=400, detail=detail)


def _route_error(exc: Exception) -> HTTPException:
    """Convert any tool exception to a 400 with a human-readable message.

    ValueError → expected bad input; log at WARNING.
    Anything else → unexpected; log full traceback at ERROR so we can debug.
    """
    if isinstance(exc, ValueError):
        logger.warning("score-edit bad request: %s", exc)
    else:
        logger.error("score-edit unexpected error: %s", exc, exc_info=True)
    return HTTPException(status_code=400, detail=str(exc))


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
    except Exception as exc:
        raise _route_error(exc) from exc


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
    except Exception as exc:
        raise _route_error(exc) from exc


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
    except Exception as exc:
        raise _route_error(exc) from exc


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
    except Exception as exc:
        raise _route_error(exc) from exc


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
    except Exception as exc:
        raise _route_error(exc) from exc


@router.post("/technical/bend", response_model=TechnicalResponse)
def route_bend(req: BendIn) -> TechnicalResponse:
    try:
        return TechnicalResponse(
            **set_bend(
                req.musicxml,
                part_index=req.part_index,
                measure_number=req.measure_number,
                beat_offset=req.beat_offset,
                bend_alter=req.bend_alter,
                pre_bend=req.pre_bend,
                release=req.release,
                voice=req.voice,
            )
        )
    except Exception as exc:
        raise _route_error(exc) from exc


@router.post("/technical/connect", response_model=TechnicalResponse)
def route_connect(req: ConnectiveTechniqueIn) -> TechnicalResponse:
    try:
        return TechnicalResponse(
            **set_connective_technique(
                req.musicxml,
                part_index=req.part_index,
                measure_number=req.measure_number,
                beat_offset=req.beat_offset,
                technique=req.technique,
                action=req.action,
                voice=req.voice,
            )
        )
    except Exception as exc:
        raise _route_error(exc) from exc


@router.post("/technical/toggle", response_model=TechnicalResponse)
def route_technical_marker(req: TechnicalMarkerIn) -> TechnicalResponse:
    try:
        return TechnicalResponse(
            **toggle_technical_marker(
                req.musicxml,
                part_index=req.part_index,
                measure_number=req.measure_number,
                beat_offset=req.beat_offset,
                marker=req.marker,
                voice=req.voice,
            )
        )
    except Exception as exc:
        raise _route_error(exc) from exc


@router.post("/technical/span", response_model=TechnicalResponse)
def route_bracket_span(req: BracketSpanIn) -> TechnicalResponse:
    try:
        return TechnicalResponse(
            **set_bracket_span(
                req.musicxml,
                part_index=req.part_index,
                measure_number=req.measure_number,
                beat_offset=req.beat_offset,
                technique=req.technique,
                action=req.action,
                end_measure_number=req.end_measure_number,
                end_beat_offset=req.end_beat_offset,
                voice=req.voice,
            )
        )
    except Exception as exc:
        raise _route_error(exc) from exc


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
    except Exception as exc:
        raise _route_error(exc) from exc


@router.post("/measure/append", response_model=AppendMeasureResponse)
def route_append_measure(req: AppendMeasureIn) -> AppendMeasureResponse:
    try:
        return AppendMeasureResponse(**append_measure(req.musicxml, part_index=req.part_index))
    except Exception as exc:
        raise _route_error(exc) from exc


@router.post("/notes/list", response_model=ListNotesResponse)
def route_list_notes(req: ListNotesIn) -> ListNotesResponse:
    try:
        return ListNotesResponse(**list_notes(req.musicxml))
    except Exception as exc:
        raise _route_error(exc) from exc


class ResolveNoteIn(BaseModel):
    musicxml: str
    measure_number: int = Field(..., ge=1)
    pitch: str = Field(..., description="Pitch from the renderer, e.g. 'E4' or 'B4-D2'.")
    beat_hint: float = Field(0.0, ge=0.0, description="Approximate quarter-note beat within the measure.")


@router.post("/note/resolve", response_model=ListedNote)
def route_resolve_note(req: ResolveNoteIn) -> ListedNote:
    try:
        return ListedNote(**find_note_by_hint(
            req.musicxml,
            measure_number=req.measure_number,
            pitch=req.pitch,
            beat_hint=req.beat_hint,
        ))
    except Exception as exc:
        raise _route_error(exc) from exc


@router.post("/note/info", response_model=NoteInfoResponse)
def route_note_info(req: RemoveNoteIn) -> NoteInfoResponse:
    try:
        return NoteInfoResponse(
            **get_note_info(
                req.musicxml,
                part_index=req.part_index,
                measure_number=req.measure_number,
                beat_offset=req.beat_offset,
                voice=req.voice,
            )
        )
    except Exception as exc:
        raise _route_error(exc) from exc


@router.post("/note/duration", response_model=MusicxmlOnly)
def route_change_duration(req: ChangeDurationIn) -> MusicxmlOnly:
    try:
        return MusicxmlOnly(
            **change_note_duration(
                req.musicxml,
                part_index=req.part_index,
                measure_number=req.measure_number,
                beat_offset=req.beat_offset,
                duration_quarters=req.duration_quarters,
                voice=req.voice,
            )
        )
    except Exception as exc:
        raise _route_error(exc) from exc


@router.post("/note/respell", response_model=RespellResponse)
def route_respell(req: RemoveNoteIn) -> RespellResponse:
    try:
        return RespellResponse(
            **respell_note(
                req.musicxml,
                part_index=req.part_index,
                measure_number=req.measure_number,
                beat_offset=req.beat_offset,
                voice=req.voice,
            )
        )
    except Exception as exc:
        raise _route_error(exc) from exc


@router.post("/note/pitch", response_model=PitchResponse)
def route_change_pitch(req: ChangePitchIn) -> PitchResponse:
    try:
        return PitchResponse(
            **change_note_pitch(
                req.musicxml,
                part_index=req.part_index,
                measure_number=req.measure_number,
                beat_offset=req.beat_offset,
                pitch=req.pitch,
                voice=req.voice,
            )
        )
    except Exception as exc:
        raise _route_error(exc) from exc


@router.post("/note/transpose-semitones", response_model=PitchResponse)
def route_transpose_semitones(req: TransposeSemitonesIn) -> PitchResponse:
    try:
        return PitchResponse(
            **transpose_note_semitones(
                req.musicxml,
                part_index=req.part_index,
                measure_number=req.measure_number,
                beat_offset=req.beat_offset,
                semitones=req.semitones,
                voice=req.voice,
            )
        )
    except Exception as exc:
        raise _route_error(exc) from exc


@router.post("/key-signature/set", response_model=KeySignatureResponse)
def route_set_key_signature(req: KeySignatureIn) -> KeySignatureResponse:
    try:
        return KeySignatureResponse(
            **set_key_signature(req.musicxml, tonic=req.tonic, mode=req.mode)
        )
    except Exception as exc:
        raise _route_error(exc) from exc
