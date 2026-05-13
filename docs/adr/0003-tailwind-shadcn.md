# ADR-0003 — Styling: Tailwind CSS 3 + shadcn/ui primitives

- **Status:** Accepted, May 13, 2026
- **Phase:** 0 — Week 1
- **Supersedes:** —

## Context

We need a styling system that:
- expresses the obsidian + neon palette from `docs/UI_DESIGN.md`,
- is fast at runtime (no CSS-in-JS overhead at render),
- gives the maintainer copyable, primitive-first components (no opinionated component library that fights our design).

## Decision

- **Tailwind CSS 3.4** with our tokens encoded in `tailwind.config.ts` *and* mirrored as CSS variables in `src/styles/tokens.css`.
- **shadcn/ui (Radix primitives + cva + clsx + tailwind-merge)** added incrementally — we copy components into our tree and skin them.
- We deliberately do **not** use Material-UI / Chakra / Mantine — those carry visual opinions that fight Stockhausen's mood.
- We stay on **Tailwind 3** (not 4) for Phase 0 — better shadcn ecosystem support today.

## Alternatives considered

- **Tailwind 4** — newer, faster, but shadcn templates still target 3.4; revisit in Phase 1 if the ecosystem matures.
- **CSS Modules / vanilla CSS** — less ergonomic; we'd reinvent the design-system primitives.
- **Stitches / Vanilla Extract** — typed CSS-in-JS; smaller community than Tailwind; not worth the trade-off.

## Consequences

- New design tokens require updates in *two* places (`tailwind.config.ts` + `tokens.css`). The `globals.css` file imports `tokens.css` first so utilities are not duplicated.
- shadcn components live in `src/components/ui/` — we own them, not the upstream package.
- Reduced-motion + high-contrast accessibility is implemented in CSS via media queries.
