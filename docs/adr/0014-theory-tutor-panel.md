# ADR-0014 — Pillar-8 Theory Tutor as a right-rail tab

- **Status:** Accepted, May 13, 2026
- **Phase:** 1 — M1.4 (Agent v2 + Pillars 4 & 8)
- **Supersedes:** —

## Context

Pillar 8 (NORTH_STAR §3.8, PHASE_1.md §1.2) requires that the maintainer
can pick any moment in the score and press **Explain** to get a
Roman-numeral analysis, voice-leading commentary, and cadence/motivic
context. The information already exists in the analyzers shipped in
M1.3 (`stockhausen-theory`); we just need a UI surface that puts it in
front of the maintainer without crowding the score.

The existing three-pane shell (UI_DESIGN.md §5) reserves the right rail
for the agent chat. Adding a fourth pane would cost too much horizontal
real estate on the M2 Air (8 GB / 13") that's the development hardware.

## Decision

Convert the right rail into a **two-tab side panel**: *Agent* and *Tutor*.
The tutor is a new component (`apps/desktop/src/agent/TheoryTutor.tsx`)
that:

1. Lets the maintainer pick a measure range (`bars 1–4`, etc.).
2. Calls the new backend route `POST /theory/explain` with the current
   score and the range. The route is a thin wrapper around the
   `theory.explain` agent tool (`app/agent_tools.py`), which composes:
   - `analyze_progression` → Roman-numeral chords inside the region,
   - `analyze_cadences` → cadences whose target chord lands in-range,
   - `analyze_voice_leading` → adjacent-voice intervals inside the range.
3. Renders a glance-friendly digest using the same neon palette the rest
   of the app uses (`--neon-cyan` for the tab indicator, `--neon-violet`
   for Roman numerals, `--neon-amber` for cadences).

Importantly the tutor **only reads**; there is no Accept/Reject button
because no proposal is being made. When the maintainer wants a
Tutor-driven *edit* — e.g. *"smooth the voice-leading between this and
the next chord"* — they switch to the *Agent* tab and ask in chat.

## Why a tab, not a modal or a hover popover?

- A modal would interrupt the score viewport.
- A hover popover would be invisible when reasoning about a region the
  cursor isn't currently on.
- A tab is sticky, lets the maintainer scroll a long digest, and keeps
  the chat warm in the adjacent tab.
- It also matches the cmdk-style command palette we ship in M1.5 — the
  ⌘K *Explain bars 1–4* command opens the Tutor tab.

## Alternatives considered

1. **Inline tooltips on each chord.** Too noisy; floods the score with
   labels.
2. **Bottom rail panel.** Already crowded by the mixer + transport.
3. **Floating draggable window.** Out of character with the obsidian +
   neon design language; rejected on UX grounds.
4. **A dedicated keyboard shortcut that opens an Explain modal.**
   Possible later — we wire ⌘E to focus the Tutor tab in M1.5 once the
   command palette ships.

## Consequences

**Positive**

- Pillar 8 is shipped in the right rail with zero layout regressions —
  the chat stays in place; the tutor adds a tab.
- Tutor and chat agree on the analyzer payload shapes thanks to
  `@stockhausen/theory-types` (ADR-0011).
- Adding more Pillar-8 surfaces (motivic browser, key-area map) is just
  another tab.

**Negative**

- Two tabs share 320 px of horizontal space; the chat input is the same
  width whether or not the tutor is open. Acceptable: switching tabs
  costs one click.

## References

- `apps/desktop/src/agent/TheoryTutor.tsx` — the panel
- `apps/desktop/src/shell/RightRail.tsx` — tabbed wrapper
- `backend/agent/app/routes/theory.py` — `POST /theory/explain`
- `backend/agent/app/agent_tools.py` — `theory_explain`
- `packages/theory/python/stockhausen_theory/analyzers/*`
- `docs/UI_DESIGN.md` §5 — shell layout
- `NORTH_STAR.md` §3.8 — Pillar 8 (Theory Tutor)
