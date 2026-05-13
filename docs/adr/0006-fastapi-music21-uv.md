# ADR-0006 — Backend stack: FastAPI + music21 + uv

- **Status:** Accepted, May 13, 2026
- **Phase:** 0 — Week 3
- **Supersedes:** —

## Context

The Stockhausen backend handles:

1. Music-theory operations that benefit from Python's library ecosystem
   (`music21`, `partitura`, `symusic`).
2. Tool-use loops with the Anthropic / OpenAI APIs.
3. Future ML inference orchestration (Modal job dispatch).

The backend is **local-only**, bound to `127.0.0.1`, run as a sidecar to
the desktop app. There is no public deployment in this project.

## Decision

- **Python 3.12+** as the language. Strong music-theory ecosystem.
- **FastAPI 0.115+** for the HTTP surface. Async-first, typed, easy.
- **`uv`** as the package manager. Orders of magnitude faster than pip; reproducible lockfile; first-class Python interpreter management.
- **`music21` 9+** as the theory engine source-of-truth.
- **`anthropic`** as the LLM SDK (Phase 0 uses Claude Sonnet 4.6 — see ADR-0007).
- **`pydantic` v2** for request/response models.

## Alternatives considered

- **Node/TypeScript backend** — would simplify type sharing, but the music-theory ecosystem is overwhelmingly Python.
- **Rust backend (Axum / Actix)** — fastest, but `music21` has no full Rust equivalent; rebuilding it is a years-long detour.
- **`poetry`** — slower than `uv` and offers nothing it does more.
- **No backend at all (call music21 via Python embedded in Tauri)** — feasible with PyO3 but bundles the entire Python interpreter into the app; complicates packaging and updates. The sidecar approach keeps concerns separate.

## Consequences

- The desktop app talks to the backend over `http://127.0.0.1:8000`.
- We commit a `uv.lock` for reproducibility.
- ML inference work that grows beyond CPU sits on Modal; this backend orchestrates Modal jobs, not runs models itself.
- We must keep the backend **bound to `127.0.0.1`** — never `0.0.0.0` — to prevent local-network access.
