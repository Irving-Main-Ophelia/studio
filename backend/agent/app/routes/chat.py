"""Chat endpoint — Claude tool-use loop with our theory tools.

Phase 0 ships one tool: ``theory.analyze_key``. We add more in Phase 1.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.llm.anthropic_client import AgentReply, AnthropicAgent

router = APIRouter(tags=["agent"])


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(..., description="Full message history.")
    score_musicxml: str | None = Field(
        default=None,
        description="Current score as MusicXML; passed to the agent for grounding.",
    )


class ChatResponse(BaseModel):
    reply: str
    tool_calls: list[dict[str, Any]]


@router.post("/agent/chat", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    agent = AnthropicAgent()
    if not agent.is_configured:
        raise HTTPException(
            status_code=503,
            detail=(
                "Anthropic API key not configured. Set ANTHROPIC_API_KEY in "
                "backend/agent/.env (see .env.example)."
            ),
        )

    result: AgentReply = await agent.respond(
        messages=[m.model_dump() for m in req.messages],
        score_musicxml=req.score_musicxml,
    )
    return ChatResponse(reply=result.reply, tool_calls=result.tool_calls)
