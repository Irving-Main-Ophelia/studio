# Phases

> Each phase is **self-contained** and **complete enough to follow without re-planning**. Read the relevant `PHASE_N.md` before starting any work on that phase.

| Phase | Outcome | Doc |
|---|---|---|
| 0 | "Hello, composer" — Tauri shell, OSMD, Tone.js, CPAL, MIDI, FastAPI, Claude with one tool | [`PHASE_0.md`](./PHASE_0.md) |
| 1 | Composer's Sketchpad — daily-use composing for piano/chamber + chat agent (10 tools) + theory tutor | [`PHASE_1.md`](./PHASE_1.md) |
| 2 | Guitar in, Agent out — live guitar→score, orchestration changer, world-music packs, 30 tools, MP3 reverse-engineering | [`PHASE_2.md`](./PHASE_2.md) |
| 3 | Co-Composer & Style — composer adapters, multi-agent, practice coach, production exports, optional voice | [`PHASE_3.md`](./PHASE_3.md) |

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
