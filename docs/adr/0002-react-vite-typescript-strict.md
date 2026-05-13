# ADR-0002 — UI framework: React 19 + Vite + TypeScript (strict)

- **Status:** Accepted, May 13, 2026
- **Phase:** 0 — Week 1
- **Supersedes:** —

## Context

We need a UI framework that:
- runs inside a WebView (Tauri does not give us native widgets),
- supports rich animation (Framer Motion choreography),
- has the largest ecosystem of music-notation, audio, and component libraries,
- the maintainer can learn comfortably as a beginner.

## Decision

- **React 19** — concurrent rendering, suspense, the most mature ecosystem.
- **Vite 7** — fast dev server with HMR, esbuild-based, low ceremony.
- **TypeScript 5.8 with `strict: true`** — every loose end becomes a compile error.

## Alternatives considered

- **SolidJS** — better runtime performance, but ecosystem (OSMD wrappers, VexFlow, shadcn) is React-first.
- **Svelte 5** — smaller bundle, but the maintainer would learn two paradigms; React is the lingua franca.
- **Native Tauri windows with native widgets** — Tauri 2 doesn't really offer this on macOS the way we'd want; we'd be writing AppKit. Out of budget.

## Consequences

- WebView rendering means we cannot draw with absolute native fidelity. For a composition tool this is fine: notation is canvas/SVG anyway.
- Bundle size needs care; Vite's tree-shaking and code-splitting save us.
- We benefit from every React-ecosystem package: OSMD, shadcn, Radix, Framer Motion, R3F, ag-grid, dnd-kit, etc.
