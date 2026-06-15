# Stockhausen — Claude Code Guidelines

## Language rule (non-negotiable)

**All UI text, code, comments, commit messages, documentation, and error messages must be in English.**

The single exception: **agent system prompts** — the instructions the LLM receives when composing or doing theory analysis may be written in Spanish, because that is the composer's working language for musical ideas. No other surface gets this exception.

Do not localize buttons, labels, tooltips, dialogs, status messages, or log output. If you introduce Spanish UI text, it is a bug.

## Privacy (permanent, no exceptions)

- All composer data stays local. No cloud sync.
- Never log or transmit composition content beyond the immediate tool call.
- Never train on user compositions. No opt-in toggle.
- No analytics that capture musical content.

## Architecture at a glance

- `apps/desktop/` — Tauri + React frontend
- `backend/agent/` — Python 3.13 FastAPI (runs locally at port 8000)
- `backend/agent/venvs/amt/` — Python 3.12 venv for Basic Pitch AMT (polyphonic audio transcription)
- `backend/agent/workers/` — subprocess workers called from FastAPI
- `packages/theory/` — `stockhausen-theory` Python package

## Key conventions

See `docs/PRINCIPLES.md` for the full list. Short version:
- TypeScript strict, no `any` without comment
- English everywhere (see Language rule above)
- Event-sourced score state — every change is an operation in the log
- Browser mode (localhost:1420) and Tauri mode coexist; guard Tauri IPC with `isTauri()` from `lib/tauri.ts`
- Tauri v2 uses `window.__TAURI_INTERNALS__` (not `__TAURI__` which was v1)
