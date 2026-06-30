"""ScoreDiff envelope — the contract every agent tool returns.

PHASE_1.md §1.7. No agent tool ever mutates the score; instead it builds
a ScoreDiff that the UI can preview, accept, or reject. Each operation
inside the diff carries an `inverse` payload so Undo replays cleanly
through the existing operation-log pipeline.

ADR-0012 documents the rationale; this module owns the typed surface.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from typing import Any, Literal

from pydantic import BaseModel, Field

OperationKind = Literal[
    "score_replace",
    "score_transpose",
    "score_modulate",
    "score_reharmonize",
    "score_add_section",
    "score_replace_bars",
    "score_respell_enharmonic",
    "score_change_instrument",
    "score_add_part",
    "score_remove_part",
    "score_set_profile",
    "score_set_tempo",
    "score_vary_motif",
    "guitar_add_techniques",
    "guitar_generate_variation",
    "guitar_bend",
    "guitar_connect",
    "guitar_marker",
    "guitar_span",
]


class Region(BaseModel):
    """Inclusive measure range, optionally restricted to particular parts."""

    measure_start: int = Field(..., ge=1)
    measure_end: int = Field(..., ge=1)
    part_indices: list[int] | None = None


class TheoryWarning(BaseModel):
    """A non-blocking diagnostic returned alongside a diff."""

    kind: str
    detail: str
    measure: int | None = None
    beat: float | None = None


class DiffOperation(BaseModel):
    """A single, inverse-paired operation that the UI can replay.

    ``forward.musicxml`` is the post-operation score for that step; for
    most M1.4 tools we only emit one operation per diff (the whole new
    score), but the type allows multi-step diffs for future use.
    """

    kind: OperationKind
    description: str
    forward: dict[str, Any]
    inverse: dict[str, Any]


class ScoreDiff(BaseModel):
    diff_id: str
    base_score_hash: str
    description: str
    operations: list[DiffOperation]
    warnings: list[TheoryWarning]
    preview_musicxml: str
    tool: str

    @classmethod
    def build(
        cls,
        *,
        tool: str,
        base_musicxml: str,
        preview_musicxml: str,
        description: str,
        operations: list[DiffOperation],
        warnings: list[TheoryWarning] | None = None,
    ) -> ScoreDiff:
        """Convenience constructor — hashes the base + mints a diff_id."""
        return cls(
            diff_id=str(uuid.uuid4()),
            base_score_hash=score_hash(base_musicxml),
            description=description,
            operations=operations,
            warnings=warnings or [],
            preview_musicxml=preview_musicxml,
            tool=tool,
        )


def score_hash(musicxml: str) -> str:
    """Deterministic content hash of a score. Cheap; SHA-256 of UTF-8 bytes."""
    return hashlib.sha256(musicxml.encode("utf-8")).hexdigest()[:16]


def build_replace_op(
    *,
    kind: OperationKind,
    description: str,
    previous_musicxml: str,
    next_musicxml: str,
    metadata: dict[str, Any] | None = None,
) -> DiffOperation:
    """Build a single forward/inverse pair carrying full MusicXML on both sides.

    This is the simplest and most general representation: even for
    "transpose this region" we keep the new score on the forward side
    and the old score on the inverse side. That makes Undo a single
    string swap; the cost is a few extra KB per diff.
    """
    return DiffOperation(
        kind=kind,
        description=description,
        forward={
            "musicxml": next_musicxml,
            **(metadata or {}),
        },
        inverse={
            "musicxml": previous_musicxml,
        },
    )


__all__ = [
    "DiffOperation",
    "OperationKind",
    "Region",
    "ScoreDiff",
    "TheoryWarning",
    "build_replace_op",
    "score_hash",
]


def operations_to_jsonl(operations: list[DiffOperation]) -> str:
    """Serialise operations to JSONL (used by the operation-log writer)."""
    return "\n".join(json.dumps(op.model_dump(mode="json")) for op in operations)
