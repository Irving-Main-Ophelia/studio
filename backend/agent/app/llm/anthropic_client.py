"""Thin wrapper around the Anthropic SDK for our tool-using agent.

Phase 0 exposes a single tool: ``theory.analyze_key``. Each phase adds more.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from anthropic import AsyncAnthropic

from app.config import get_settings
from app.tools.theory import analyze_key

SYSTEM_PROMPT = (
    "You are the Stockhausen co-composer. You assist a classically trained "
    "musician. You are precise, theory-aware, and concise.\n\n"
    "Rules:\n"
    "- Use the provided tools rather than guessing.\n"
    "- When you call `theory.analyze_key`, pass the current score MusicXML.\n"
    "- Reply in the user's language. Keep replies under 80 words unless asked.\n"
    "- Never invent notes; only call tools that produce verifiable edits."
)

TOOLS: list[dict[str, Any]] = [
    {
        "name": "theory.analyze_key",
        "description": (
            "Analyze the tonal center of the current MusicXML score using "
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
        if name == "theory.analyze_key":
            return analyze_key(args.get("musicxml", ""))
        raise ValueError(f"Unknown tool: {name}")

    async def respond(
        self,
        messages: list[dict[str, Any]],
        score_musicxml: str | None,
    ) -> AgentReply:
        client = self._client_or_raise()

        history: list[dict[str, Any]] = list(messages)
        if score_musicxml is not None and history:
            tail = history[-1]
            if tail.get("role") == "user":
                tail["content"] = (
                    f"{tail['content']}\n\n[Attached score MusicXML follows]\n"
                    f"{score_musicxml}"
                )

        tool_calls: list[dict[str, Any]] = []

        for _ in range(4):  # at most 4 tool round-trips per turn
            response = await client.messages.create(
                model=self.settings.anthropic_model,
                max_tokens=1024,
                system=SYSTEM_PROMPT,
                tools=TOOLS,
                messages=history,
            )

            tool_use_block = next(
                (b for b in response.content if getattr(b, "type", None) == "tool_use"),
                None,
            )
            if tool_use_block is None:
                # No tool use: extract text and we're done.
                text = "".join(
                    getattr(b, "text", "") for b in response.content if getattr(b, "type", None) == "text"
                )
                return AgentReply(reply=text.strip(), tool_calls=tool_calls)

            tool_name = tool_use_block.name
            tool_args = tool_use_block.input
            try:
                tool_result = self._run_tool(tool_name, tool_args)
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
                            "tool_use_id": tool_use_block.id,
                            "content": str(tool_result),
                            "is_error": error,
                        }
                    ],
                }
            )

        return AgentReply(reply="(Tool loop exhausted)", tool_calls=tool_calls)
