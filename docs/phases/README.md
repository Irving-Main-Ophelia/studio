# Phases

> Each phase is **self-contained** and **complete enough to follow without re-planning**. Read the relevant `PHASE_N.md` before starting any work on that phase.

| Phase | Outcome | Doc |
|---|---|---|
| 0 | "Hello, composer" — Tauri shell, OSMD, smplr playback, CPAL meter, Web MIDI, FastAPI, Claude with two tools | [`PHASE_0.md`](./PHASE_0.md) |
| 1 | Composer's Sketchpad — daily-use composing for piano/chamber + chat agent (10 tools) + theory tutor | [`PHASE_1.md`](./PHASE_1.md) |
| **3.5** | **Foundation Hardening — real `sfizz.wasm` sound + real WAV, honest docs/tools, schema v2, edit-pipeline test corpus. ← next to execute** | [`PHASE_3_5.md`](./PHASE_3_5.md) |
| 2 | Guitar in, Agent out — live guitar→score, orchestration changer, world-music packs, 30 tools, MP3 reverse-engineering | [`PHASE_2.md`](./PHASE_2.md) |
| 3 | Co-Composer & Style — composer adapters, multi-agent, practice coach, production exports, optional voice | [`PHASE_3.md`](./PHASE_3.md) |
| — | Prerequisites — accounts, keys, payments, hardware (all phases) | [`PREREQUISITES.md`](./PREREQUISITES.md) |

> **New phases 3.5 and 4–8** come from the DAW reference study ([`../reference-daws/`](../reference-daws/)).
> Phase numbers are **stable IDs**, not execution order. The dependency-driven execution order and the
> per-item reconciliation with Phases 2–3 live in
> [`../reference-daws/RECONCILIATION.md`](../reference-daws/RECONCILIATION.md). Recommended order:
> **3.5 → 4 → 5 → 7 → 6 → [Phase 2 residue] → 8 → [Phase 3 residue]**. Phases 4–8 are specced as
> capability tracks under [`../reference-daws/tracks/`](../reference-daws/tracks/) and promote to full
> `PHASE_N.md` docs as each is reached.

## How to work a phase

1. Open the phase doc.
2. Read §N.1 (Goal) and §N.2 (Definition of Done).
3. Read §N.3 (Scope) for the breakdown.
4. Pick the next unchecked task in the task list.
5. Build it.
6. Cross it off.
7. When all DoD items are checked, cut the version tag, record the demo, move to the next phase.

## What to do if a phase doc is missing detail

1. Re-read the North Star (`../../NORTH_STAR.md`).
2. Check the ADRs in `../adr/`.
3. Check `../RESEARCH.md` for state-of-the-art context.
4. Ask the maintainer. Don't invent.
5. Once you have an answer, **update the phase doc** so the next agent doesn't have to ask.
