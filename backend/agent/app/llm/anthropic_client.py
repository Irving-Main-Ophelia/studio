"""Thin wrapper around the Anthropic SDK for our tool-using agent.

Phase 0 exposes a single tool: ``theory.analyze_key``. Each phase adds more.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, cast

from anthropic import AsyncAnthropic
from anthropic.types import MessageParam, ToolParam, ToolUseBlock

from app.config import get_settings
from app.tools.theory import analyze_key, transpose_musicxml

SYSTEM_PROMPT = (
    "You are the Stockhausen co-composer. You assist a classically trained "
    "musician. You are precise, theory-aware, and concise.\n\n"
    "Rules:\n"
    "- Use the provided tools rather than guessing.\n"
    "- The user's current score is attached at the end of their message as MusicXML.\n"
    "  When a tool needs `musicxml`, copy that attached MusicXML verbatim.\n"
    "- For transposition, target keys can be written 'Gm', 'F#m', 'Bb', 'A major', etc.\n"
    "- Reply in the user's language (Spanish or English). Keep replies tight: at most\n"
    "  three sentences unless explicitly asked to elaborate.\n"
    "- Never invent notes. Only call tools that produce verifiable edits."
)

# Anthropic constrains tool names to ^[a-zA-Z0-9_-]{1,64}$ — no dots.
# We keep namespaces as underscores. The UI prettifies these back to dots.
TOOLS: list[dict[str, Any]] = [
    {
        "name": "theory_analyze_key",
        "description": (
            "Estimate the tonal center of a MusicXML score using "
            "Krumhansl-Schmuckler. Returns the key, mode, and confidence."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "musicxml": {
                    "type": "string",
                    "description": "Full MusicXML 4.0 score to analyze.",
                }
            },
            "required": ["musicxml"],
        },
    },
    {
        "name": "score_transpose",
        "description": (
            "Transpose a MusicXML score to a target key. Returns the new "
            "MusicXML plus the source key, target key, and interval."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "musicxml": {
                    "type": "string",
                    "description": "Full MusicXML 4.0 score to transpose.",
                },
                "target_key": {
                    "type": "string",
                    "description": "Target key: 'F#m', 'Bb', 'A major', etc.",
                },
            },
            "required": ["musicxml", "target_key"],
        },
    },
]


@dataclass
class AgentReply:
    reply: str
    tool_calls: list[dict[str, Any]] = field(default_factory=list)


class AnthropicAgent:
    """One-shot tool-use loop. Phase 0: simple call, Phase 1 will extend."""

    def __init__(self) -> None:
        self.settings = get_settings()
        self._client: AsyncAnthropic | None = None

    @property
    def is_configured(self) -> bool:
        return bool(self.settings.anthropic_api_key)

    def _client_or_raise(self) -> AsyncAnthropic:
        if self._client is None:
            self._client = AsyncAnthropic(api_key=self.settings.anthropic_api_key)
        return self._client

    def _run_tool(self, name: str, args: dict[str, Any]) -> Any:
        if name == "theory_analyze_key":
            return analyze_key(args.get("musicxml", ""))
        if name == "score_transpose":
            return transpose_musicxml(
                args.get("musicxml", ""),
                args.get("target_key", "C"),
            )
        raise ValueError(f"Unknown tool: {name}")

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

        # Up to 4 tool round-trips per turn in Phase 0; Phase 1 raises this.
        for _ in range(4):
            response = await client.messages.create(
                model=self.settings.anthropic_model,
                max_tokens=1024,
                system=SYSTEM_PROMPT,
                tools=cast("list[ToolParam]", TOOLS),
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
                return AgentReply(reply="".join(text_parts).strip(), tool_calls=tool_calls)

            tool_name = tool_use.name
            tool_args = cast("dict[str, Any]", tool_use.input)
            try:
                tool_result: Any = self._run_tool(tool_name, tool_args)
                error = False
            except Exception as exc:  # noqa: BLE001 — broad on purpose, returned to model
                tool_result = {"error": str(exc)}
                error = True

            tool_calls.append(
                {
                    "tool": tool_name,
                    "input": tool_args,
                    "output": tool_result,
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
                            "content": str(tool_result),
                            "is_error": error,
                        }
                    ],
                }
            )

        return AgentReply(reply="(Tool loop exhausted)", tool_calls=tool_calls)
