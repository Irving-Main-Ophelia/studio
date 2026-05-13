# ADR-0007 — Phase 0 LLM: Claude Sonnet 4.6

- **Status:** Accepted, May 13, 2026
- **Phase:** 0 — Week 4
- **Supersedes:** —

## Context

Phase 0 needs one LLM that:

- supports robust tool use,
- has strong music-theory comprehension out of the box,
- has a Python SDK,
- is cheap enough that early experimentation does not strain a personal-use budget.

Phase 1 and beyond will mix Claude Opus 4.7, GPT-5.5, and Gemini 3.1 Pro
based on task. Phase 0 keeps it simple.

## Decision

**Claude Sonnet 4.6 (`claude-sonnet-4-6-20251022`)** for every Phase 0 agent call.

## Alternatives considered

- **Claude Opus 4.7** — better reasoning but ~5× more expensive. Phase 0
  is architecture-proof; we don't need Opus quality yet.
- **GPT-5.5** — comparable quality; we will integrate it in Phase 1 for
  the tasks where it outperforms Claude, but adding two SDKs in Phase 0
  multiplies cognitive cost for no demo benefit.
- **Local model (Llama / Mistral via Ollama)** — out of scope for Phase
  0 quality; the maintainer's M2 Air 8 GB can't run anything competitive
  with hosted models for tool use.

## Consequences

- The Anthropic key lives in `backend/agent/.env`. The UI never sees it.
- We commit only `.env.example`. `.env` is gitignored.
- Phase-0 demo cost estimate: <$1 across all development.
