# Stockhausen

> AI-native composition environment for classical music and song-writing.
> *Jarvis × Pro Tools × Dorico — in one place.*

**Status:** Pre-alpha. Phase 0 in progress.
**Project name:** *Stockhausen* (in homage to Karlheinz Stockhausen, pioneer of electronic composition).
**License:** Closed / personal. We use open-source dependencies freely; Stockhausen itself is not open-source.
**Language:** All code, docs, and commits in English.

---

## Start Here

1. **[`AGENTS.md`](./AGENTS.md)** — rules for any AI/human collaborator. Read this first.
2. **[`NORTH_STAR.md`](./NORTH_STAR.md)** — the source of truth for the project's intent.
3. **[`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)** — detailed system architecture.
4. **[`docs/PRINCIPLES.md`](./docs/PRINCIPLES.md)** — engineering & product principles.
5. **[`docs/UI_DESIGN.md`](./docs/UI_DESIGN.md)** — visual & interaction language.
6. **[`docs/RESEARCH.md`](./docs/RESEARCH.md)** — May 2026 state-of-the-art notes.
7. **[`docs/REFERENCE_COMPOSERS.md`](./docs/REFERENCE_COMPOSERS.md)** — composer roster for style work.
8. **[`docs/GLOSSARY.md`](./docs/GLOSSARY.md)** — terms.
9. **[`docs/phases/`](./docs/phases/)** — detailed phase plans (Phase 0 → Phase 3).

---

## The Seven Pillars (at a glance)

1. **Composer style touch** — "give it a Rachmaninoff touch" → the piece nudges toward that composer's patterns.
2. **Key/tonality transposition** — transpose entire pieces (audio + symbolic) idiomatically.
3. **Live guitar → score** — play, watch the score build in real time.
4. **Concept → first-draft → guitar/voice/click refinement** — describe a piece, the agent drafts, the human refines.
5. **Score playback** — Songsterr/Guitar-Pro–class playback (loop, scrub, count-in, tempo without pitch).
6. **Orchestration change** — guitar → strings → full orchestra → Persian radif → anything.
7. **The co-composer agent** — voice + chat, theoretically rigorous, deeply integrated.

See [`NORTH_STAR.md`](./NORTH_STAR.md) for the full elaboration plus six suggested additional pillars.

---

## Quick Stack

- **Client:** Tauri 2 + Rust + React 19 + TypeScript + Tailwind + shadcn/ui
- **Notation:** OpenSheetMusicDisplay (VexFlow 5) + Verovio for engraving
- **Audio:** Tone.js + Web Audio + AudioWorklets in the WebView; CPAL (Rust) for native low-latency I/O
- **Theory:** music21 + partitura + symusic on a FastAPI backend
- **AI:** Claude Opus 4.7 + GPT-5.5 + Moonbeam + Anticipatory Music Transformer + YourMT3+ + MIDI-DDSP
- **Voice:** OpenAI Realtime API (`gpt-realtime-2`)
- **GPU:** Modal serverless
- **DB:** Neon Postgres + pgvector; Cloudflare R2 for blobs

---

## Roadmap (high-level)

Solo maintainer, personal use. No external deadlines. Each phase ends with a demo + a decision.

| Phase | Scope | Goal |
|---|---|---|
| **0 — Foundations** | ~4 weeks part-time | Tauri shell, OSMD renders, Tone.js plays, one agent tool live |
| **1 — Composer's Sketchpad** | ~3 months part-time | Daily-use composing for piano/chamber. Transposition, playback, draft generation, chat agent |
| **2 — Guitar in, Agent out** | ~4 months part-time | Live guitar→score, orchestration change, world-music packs (Persian, Maqam, Hindustani, Chinese) |
| **3 — Co-Composer & Style** | ~6 months part-time | Composer-style adapters, multi-agent orchestration, voice agent (if appetite remains) |

---

## Repo Layout

```
stockhausen/
├── AGENTS.md                  # Rules for AI agents / collaborators (read first)
├── NORTH_STAR.md              # Source of truth — project intent
├── README.md                  # This file
├── docs/
│   ├── ARCHITECTURE.md        # System architecture
│   ├── PRINCIPLES.md          # Engineering + product principles
│   ├── UI_DESIGN.md           # Visual & interaction language
│   ├── RESEARCH.md            # Research log (May 2026 SOTA)
│   ├── GLOSSARY.md            # Music & engineering terms
│   ├── REFERENCE_COMPOSERS.md # Composer roster for style work
│   ├── NAMES.md               # (Historical) name shortlist — kept for record
│   ├── adr/                   # Architecture Decision Records
│   └── phases/                # Phase plans (PHASE_0..PHASE_3)
├── apps/
│   └── desktop/               # Tauri 2 + React app
├── backend/
│   ├── agent/                 # FastAPI agent orchestrator
│   └── inference/             # Modal deployment configs
├── packages/
│   ├── theory/                # Theory engine (TS + Python bridge)
│   ├── notation/              # OSMD wrapper + edit layer
│   ├── audio-engine/          # Tone.js + Worklets + native
│   └── types/                 # Shared TS types
└── tools/
    └── dataset-prep/          # Curation, alignment scripts
```

---

## How decisions get made

1. **Read** [`NORTH_STAR.md`](./NORTH_STAR.md) §1–§5 (Vision, Principles, Pillars, Non-Goals).
2. If the decision involves picking between options, write an ADR in `docs/adr/`.
3. If the decision changes any pillar, non-goal, or principle, **update the North Star**.
4. Ship.

---

## Open Questions

See [`NORTH_STAR.md`](./NORTH_STAR.md) §13. These are the open inputs from the maintainer that shape what gets built next.
