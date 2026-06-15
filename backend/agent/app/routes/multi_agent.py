"""POST /agent/panel — multi-agent composition panel endpoint.

Phase-3 Pillar 7: a panel of 4 specialist agents coordinated by an
orchestrator, following the ComposerX pattern (PHASE_3.md §D).
"""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.multi_agent import PanelResult, run_panel

router = APIRouter(tags=["agent"])


class PanelRequest(BaseModel):
    message: str = Field(..., description="Composition brief or revision request.")
    score_musicxml: str | None = Field(
        default=None,
        description="Current score as MusicXML; passed to the panel for grounding.",
    )


class AgentContributionResponse(BaseModel):
    agent: str
    role: str
    reply: str
    tool_calls: list[dict[str, Any]] = Field(default_factory=list)


class PanelResponse(BaseModel):
    summary: str
    contributions: list[AgentContributionResponse]
    diffs: list[dict[str, Any]] = Field(default_factory=list)
    tool_calls: list[dict[str, Any]] = Field(default_factory=list)


@router.post("/agent/panel", response_model=PanelResponse)
async def panel(req: PanelRequest) -> PanelResponse:
    """Run the 4-specialist composition panel and return synthesized results."""
    result: PanelResult = await asyncio.to_thread(
        run_panel,
        req.message,
        req.score_musicxml,
    )
    return PanelResponse(
        summary=result.summary,
        contributions=[
            AgentContributionResponse(
                agent=c.agent,
                role=c.role,
                reply=c.reply,
                tool_calls=list(c.tool_calls),
            )
            for c in result.contributions
        ],
        diffs=list(result.diffs),
        tool_calls=list(result.tool_calls),
    )
