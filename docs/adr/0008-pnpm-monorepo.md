# ADR-0008 — Package manager + monorepo: pnpm workspaces

- **Status:** Accepted, May 13, 2026
- **Phase:** 0 — Week 1
- **Supersedes:** —

## Context

We need to organize JavaScript code across:

- `apps/desktop` — the Tauri 2 + React 19 desktop app,
- `packages/types` (later) — shared TypeScript types,
- `packages/theory` (later) — TypeScript types for the theory engine,
- `packages/notation` (later) — OSMD wrappers,
- `packages/audio-engine` (later) — Tone.js / Worklet code.

Python and Rust live alongside via their own toolchains (`uv` and `cargo`).

## Decision

**pnpm 10 workspaces** as the JavaScript monorepo tool.

- Workspace root: `pnpm-workspace.yaml`.
- Per-package `package.json` with `@stockhausen/<name>` naming.
- We pin pnpm via the root `packageManager` field.
- Each app can run `pnpm --filter @stockhausen/desktop dev` to scope.

## Alternatives considered

- **npm workspaces** — fewer features, slower installs.
- **Yarn 4 (Berry)** — capable but more friction; pnpm is the cleaner default in 2026.
- **Turborepo / Nx** — overkill for a solo personal-use project; add later only if pipelines become painful.
- **Bun** — fast and growing, but Tauri 2's official tooling and the wider ecosystem still center on pnpm/npm.

## Consequences

- `pnpm install` at root installs everything.
- Internal packages can depend on each other with `workspace:*` once we have more than one.
- Lockfile (`pnpm-lock.yaml`) is committed.
