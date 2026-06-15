"""Phase-3 multi-agent composition panel (ComposerX pattern).

Agents:
  Planner      — handles form, key plan, motif design
  Harmonist    — handles chord progressions, voicings, modulations
  Counterpoint — handles voice-leading, fugal devices, contrapuntal textures
  Orchestrator — handles re-orchestration and idiom-pack rules

Each is a Claude Sonnet 4.6 instance with a focused system prompt and
tool subset. The top-level Orchestrator (uses Opus 4.8 or falls back to
Sonnet 4.6) decomposes the user brief and coordinates sub-agents.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class AgentContribution:
    agent: str   # "planner" | "harmonist" | "counterpoint" | "orchestrator"
    role: str    # human-readable role name
    reply: str   # agent's contribution text
    tool_calls: list = field(default_factory=list)  # list of ToolCallRecord dicts


@dataclass
class PanelResult:
    summary: str                               # orchestrator's final synthesis
    contributions: list[AgentContribution]     # each agent's contribution
    diffs: list[dict] = field(default_factory=list)      # any ScoreDiff objects produced
    tool_calls: list[dict] = field(default_factory=list)  # all tool calls across all agents


# ---------------------------------------------------------------------------
# Specialist definitions
# ---------------------------------------------------------------------------

_SPECIALISTS: list[dict] = [
    {
        "agent": "planner",
        "role": "Form & Motif Planner",
        "system": (
            "You are a musical form expert. Given a composition brief and score context, "
            "describe your plan for the overall form, key scheme, and motivic development "
            "in 2-3 sentences. Be concrete and technical."
        ),
    },
    {
        "agent": "harmonist",
        "role": "Harmonist",
        "system": (
            "You are an expert in harmony and chord progressions. Given a composition brief "
            "and score context, describe your plan for chord progressions, voicings, and "
            "any modulations in 2-3 sentences. Reference specific Roman numerals, cadence "
            "types, and voice-leading choices."
        ),
    },
    {
        "agent": "counterpoint",
        "role": "Counterpoint Specialist",
        "system": (
            "You are a counterpoint and voice-leading specialist. Given a composition brief "
            "and score context, describe your approach to voice-leading, contrapuntal "
            "textures, and any fugal or imitative devices in 2-3 sentences. Be technically "
            "precise about intervals, motion types, and part independence."
        ),
    },
    {
        "agent": "orchestrator",
        "role": "Orchestration Specialist",
        "system": (
            "You are an orchestration and instrumentation expert. Given a composition brief "
            "and score context, describe your plan for instrumental color, texture, "
            "re-orchestration strategies, and idiomatic writing in 2-3 sentences. Reference "
            "specific instruments, registers, and articulation choices."
        ),
    },
]

_ORCHESTRATOR_SYSTEM = (
    "You are the master orchestrator for a composition panel. Synthesize the contributions "
    "from four specialist agents into a coherent, actionable plan for the composer. Be concise."
)


# ---------------------------------------------------------------------------
# Core function
# ---------------------------------------------------------------------------


def run_panel(
    user_message: str,
    score_musicxml: str | None,
    model: str = "claude-opus-4-8",
) -> PanelResult:
    """Run the 4-specialist panel and return a synthesized PanelResult.

    Each specialist gets one call with a focused system prompt. The
    orchestrator makes a final call that synthesizes all contributions.
    If ANTHROPIC_API_KEY is absent, returns a stub result immediately.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        stub_contributions = [
            AgentContribution(
                agent=spec["agent"],
                role=spec["role"],
                reply="[API key required]",
                tool_calls=[],
            )
            for spec in _SPECIALISTS
        ]
        return PanelResult(
            summary="Panel requires ANTHROPIC_API_KEY",
            contributions=stub_contributions,
            diffs=[],
            tool_calls=[],
        )

    from anthropic import Anthropic  # noqa: PLC0415

    client = Anthropic(api_key=api_key)

    # Build the user content with optional score context
    score_suffix = ""
    if score_musicxml:
        score_suffix = f"\n\nScore context: [MusicXML provided, {len(score_musicxml)} chars]"
    user_content = user_message + score_suffix

    contributions: list[AgentContribution] = []

    try:
        # Step 1: Call each specialist
        for spec in _SPECIALISTS:
            try:
                resp = client.messages.create(
                    model=model,
                    max_tokens=512,
                    system=spec["system"],
                    messages=[{"role": "user", "content": user_content}],
                )
                reply_text = "".join(
                    getattr(block, "text", "") for block in resp.content
                ).strip()
            except Exception as exc:  # noqa: BLE001
                logger.warning("multi_agent: specialist %s failed: %s", spec["agent"], exc)
                reply_text = f"[Error: {exc}]"

            contributions.append(
                AgentContribution(
                    agent=spec["agent"],
                    role=spec["role"],
                    reply=reply_text,
                    tool_calls=[],
                )
            )

        # Step 2: Format contributions for the orchestrator
        formatted_contributions = "\n\n".join(
            f"**{c.role}** ({c.agent}):\n{c.reply}" for c in contributions
        )

        orchestrator_user = (
            f"Brief: {user_message}\n\n"
            f"Specialist contributions:\n{formatted_contributions}\n\n"
            "Synthesize these into a clear plan."
        )

        # Step 3: Orchestrator synthesis call
        orch_resp = client.messages.create(
            model=model,
            max_tokens=512,
            system=_ORCHESTRATOR_SYSTEM,
            messages=[{"role": "user", "content": orchestrator_user}],
        )
        summary = "".join(
            getattr(block, "text", "") for block in orch_resp.content
        ).strip()

    except Exception as exc:  # noqa: BLE001
        logger.error("multi_agent: panel run failed: %s", exc)
        # Return partial results with the error
        if not contributions:
            contributions = [
                AgentContribution(
                    agent=spec["agent"],
                    role=spec["role"],
                    reply="[Panel call failed]",
                    tool_calls=[],
                )
                for spec in _SPECIALISTS
            ]
        return PanelResult(
            summary=f"Panel error: {exc}",
            contributions=contributions,
            diffs=[],
            tool_calls=[],
        )

    return PanelResult(
        summary=summary,
        contributions=contributions,
        diffs=[],
        tool_calls=[],
    )


__all__ = [
    "AgentContribution",
    "PanelResult",
    "run_panel",
]
