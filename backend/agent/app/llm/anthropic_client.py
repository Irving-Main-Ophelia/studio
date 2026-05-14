"""Thin wrapper around the Anthropic SDK for our tool-using agent.

Phase 0 exposed two tools. Phase 1 (M1.4) ships the full 10-tool surface
from PHASE_1.md §1.6 — every score-mutating tool returns a ``ScoreDiff``;
read-only tools return analyzer payloads. The agent loop runs up to 8
round-trips, escalates to Claude Opus 4.7 for planner-heavy tools, and
collects every diff so the route layer can hand them to the UI overlay.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, cast

from anthropic import AsyncAnthropic
from anthropic.types import MessageParam, ToolParam, ToolUseBlock

from app.agent_tools import build_tool_descriptors, dispatch_tool
from app.config import get_settings
from app.score_diff import ScoreDiff

# Tools that benefit from heavier reasoning. We escalate the *model* to
# Opus when one of these is the most recent tool the agent invoked.
PLANNER_TOOLS: set[str] = {
    "theory_analyze_form",
    "score_add_section",
    "score_reharmonize",
}

SYSTEM_PROMPT = (
    "You are the Stockhausen co-composer. You assist a classically trained "
    "musician. You are precise, theory-aware, and concise.\n\n"
    "Rules:\n"
    "- Use the provided tools rather than guessing. Every score-mutating tool\n"
    "  (score.transpose, score.modulate, score.reharmonize, score.add_section,\n"
    "  score.replace_bars) returns a ScoreDiff — you do not need to repeat the\n"
    "  resulting MusicXML in your reply.\n"
    "- The user's current score is attached at the end of their message as\n"
    "  MusicXML; the backend feeds it to every tool automatically.\n"
    "- For transposition / modulation, target keys can be written 'Gm', 'F#m',\n"
    "  'Bb', 'A major', etc.\n"
    "- Reply in the user's language (Spanish or English). Keep replies tight:\n"
    "  at most three sentences unless explicitly asked to elaborate.\n"
    "- Never invent notes. Only call tools that produce verifiable edits."
)


@dataclass
class AgentReply:
    reply: str
    tool_calls: list[dict[str, Any]] = field(default_factory=list)
    diffs: list[ScoreDiff] = field(default_factory=list)


class AnthropicAgent:
    """Tool-use loop with diff-aware tooling and planner escalation (M1.4)."""

    def __init__(self) -> None:
        self.settings = get_settings()
        self._client: AsyncAnthropic | None = None
        self._tool_descriptors: list[ToolParam] = build_tool_descriptors()

    @property
    def is_configured(self) -> bool:
        return bool(self.settings.anthropic_api_key)

    def _client_or_raise(self) -> AsyncAnthropic:
        if self._client is None:
            self._client = AsyncAnthropic(api_key=self.settings.anthropic_api_key)
        return self._client

    def _pick_model(self, last_tool: str | None) -> str:
        """Escalate to Opus 4.7 when the LLM is in planner territory."""
        if last_tool in PLANNER_TOOLS:
            return self.settings.anthropic_planner_model
        return self.settings.anthropic_model

    async def respond(
        self,
        messages: list[dict[str, Any]],
        score_musicxml: str | None,
    ) -> AgentReply:
        client = self._client_or_raise()

        history: list[dict[str, Any]] = [dict(m) for m in messages]
        if score_musicxml is not None and history:
            tail = history[-1]
            if tail.get("role") == "user":
                tail["content"] = (
                    f"{tail['content']}\n\n[Attached score MusicXML follows]\n{score_musicxml}"
                )

        tool_calls: list[dict[str, Any]] = []
        diffs: list[ScoreDiff] = []
        last_tool: str | None = None

        for _ in range(self.settings.agent_max_round_trips):
            response = await client.messages.create(
                model=self._pick_model(last_tool),
                max_tokens=2048,
                system=SYSTEM_PROMPT,
                tools=self._tool_descriptors,
                messages=cast("list[MessageParam]", history),
            )

            tool_use: ToolUseBlock | None = next(
                (b for b in response.content if isinstance(b, ToolUseBlock)),
                None,
            )
            if tool_use is None:
                text_parts: list[str] = []
                for block in response.content:
                    text_value = getattr(block, "text", None)
                    if isinstance(text_value, str):
                        text_parts.append(text_value)
                return AgentReply(
                    reply="".join(text_parts).strip(),
                    tool_calls=tool_calls,
                    diffs=diffs,
                )

            tool_name = tool_use.name
            last_tool = tool_name
            tool_args = cast("dict[str, Any]", tool_use.input)
            try:
                payload, maybe_diff = dispatch_tool(tool_name, tool_args, score_musicxml)
                if maybe_diff is not None:
                    diffs.append(maybe_diff)
                    # Once a diff is produced, the tool result we feed back to
                    # the LLM is intentionally compact — the agent should
                    # narrate the diff, not re-emit the MusicXML.
                    feedback: Any = {
                        "diff_id": maybe_diff.diff_id,
                        "description": maybe_diff.description,
                        "warnings": [w.model_dump() for w in maybe_diff.warnings],
                    }
                else:
                    feedback = payload
                error = False
            except Exception as exc:  # noqa: BLE001 — returned to the model
                feedback = {"error": str(exc)}
                payload = feedback
                error = True

            tool_calls.append(
                {
                    "tool": tool_name,
                    "input": tool_args,
                    "output": payload,
                    "error": error,
                }
            )

            history.append({"role": "assistant", "content": response.content})
            history.append(
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "tool_result",
                            "tool_use_id": tool_use.id,
                            "content": str(feedback),
                            "is_error": error,
                        }
                    ],
                }
            )

        return AgentReply(
            reply="(Tool loop exhausted)",
            tool_calls=tool_calls,
            diffs=diffs,
        )
