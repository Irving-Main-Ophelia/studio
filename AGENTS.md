# AGENTS.md — Working with this codebase

> Instructions for any AI agent (Claude, GPT, Gemini, Cursor, Copilot, …) or human collaborator who works on Stockhausen. Read this **before** touching anything.

---

## 1. Who is the maintainer?

- **One person, the project lead.**
- A **professional musician** with strong **music theory and composition** background.
- A **software beginner**: theoretically curious, but new to terminology around stacks, frameworks, audio engineering, ML, and DevOps.
- Will learn fast — but **today, treat all software/engineering acronyms as unfamiliar**.

## 2. How to communicate

1. **Chat language is whatever the maintainer uses.** If they write in Spanish, reply in Spanish (English is also fine). **All code, file names, commits, docs, and product strings stay in English.**
2. **Define every acronym on first use.** Always. The first time you say "MCP", you must immediately add ("— Model Context Protocol, Anthropic's open standard for exposing tools to LLMs"). Same for "DSP", "VST", "CRDT", everything.
3. **Use music analogies for engineering ideas.** Examples:
   - *"An AudioWorklet is like a dedicated music stand in the orchestra: it has its own job (DSP) and isn't interrupted by the conductor's other duties (UI rendering)."*
   - *"A LoRA adapter is like a small set of pencil annotations you write on top of a published score — the score stays the same, your annotations nudge how it's interpreted."*
4. **Don't dump jargon.** When a decision needs only one or two terms, name those; defer the rest until they actually matter.
5. **Confirm before locking decisions.** If a piece of work is irreversible (a dependency choice, a data-model change, a delete), explicitly ask: *"Are we OK to commit to X, knowing it implies Y and Z?"* before doing it.
6. **Never be defeatist.** The North Star (§2 principle 8) forbids it. If a thing looks hard, decompose it.
7. **Tone:** thoughtful, precise, calm. No emojis. No hype. No corporate speak.

## 3. The source of truth

Read these in order. Always.

1. `NORTH_STAR.md` — the project's intent.
2. `docs/PRINCIPLES.md` — how decisions get made.
3. `docs/ARCHITECTURE.md` — the system topology.
4. `docs/RESEARCH.md` — state-of-the-art landscape (May 2026).
5. `docs/UI_DESIGN.md` — the visual & interaction language.
6. `docs/NAMES.md` — pending product-name decision.
7. `docs/GLOSSARY.md` — terms reference.
8. `docs/adr/*` — Architecture Decision Records.

If any of those documents *contradict* this file, the documents win. If they contradict *each other*, raise it, don't paper over it.

## 4. Stack at a glance (with one-line gloss for each)

These are decided. Don't re-litigate without a new ADR (Architecture Decision Record).

- **Tauri 2** — Rust-based desktop-app framework that wraps a web UI; gives us a small binary and native-speed audio I/O.
- **Rust** — systems language we use for the native core (audio, MIDI, file I/O, on-device ML).
- **React 19 + TypeScript + Vite + Tailwind + shadcn/ui** — the UI inside Tauri's WebView.
- **OpenSheetMusicDisplay (OSMD) + VexFlow + Verovio** — notation rendering (display + edit + engraved PDF).
- **MusicXML 4.0** — canonical interchange format (a W3C standard for exchanging sheet music between apps).
- **Tone.js + Web Audio API + AudioWorklets** — browser-side audio engine for playback.
- **sfizz.wasm / fluidsynth.wasm** — sample-library players for SFZ / SF2 sound formats.
- **CPAL** — Rust crate for cross-platform low-latency audio input/output.
- **midir** — Rust crate for MIDI input/output.
- **music21 + partitura + symusic** — Python libraries for symbolic music theory & analysis.
- **FastAPI** — Python web framework for the agent backend.
- **Claude Opus 4.7 / Sonnet 4.6** (Anthropic) — primary LLM for theory-heavy tool calling.
- **GPT-5.5** (OpenAI) — fallback / speed-critical LLM paths.
- **MCP (Model Context Protocol)** — Anthropic's open standard for letting an LLM call typed tools; we use it to expose ~40 music tools to the agent.
- **Modal** — serverless GPU host where we run AI-music inference, billed per-second.
- **Anticipatory Music Transformer / Moonbeam** — open-weight symbolic music generators.
- **YourMT3+ / Basic Pitch** — open audio→MIDI transcription models.
- **MIDI-DDSP** — open model for expressive MIDI-to-audio rendering.
- **Demucs v4** — open stem-separation model.
- **MIDI Guitar 3** (Jam Origin) — paid commercial software that turns any guitar's audio into MIDI in real time; we integrate it in Phase 2.
- **contrapunk** — open-source guitar→MIDI pipeline we study as a reference for our in-house Phase-3 version.
- **Fishman TriplePlay** — optional hardware add-on (hexaphonic pickup) for sub-5 ms guitar→MIDI.
- **VSCO 2 CE / Sonatina / VCSL** — free, CC0-licensed orchestral sample libraries.

A fuller, beginner-oriented explanation of every term lives in `docs/GLOSSARY.md`.

## 5. What this software is — and is not

It **is** personal-use software for a single musician (the maintainer) to:
- Compose classical music and songs.
- Have an AI co-composer with deep music theory.
- Play guitar and watch the score build live.
- Transpose, re-orchestrate, stylize pieces by composer.
- Play back, loop, export.

It **is not** (these are hard constraints — see `NORTH_STAR.md` §5):
- A commercial product.
- A multi-user / collaborative product.
- A live-performance tool.
- A streaming-music generator (we do not compete with Suno/Udio).
- A mobile-first tool.
- Open-source (the dependencies are; Stockhausen itself is private).

## 6. Working rules for agents

1. **Read first.** Before writing any code or making a recommendation, read the relevant docs (§3).
2. **Plan, then act.** For non-trivial tasks, propose a short plan and wait for confirmation.
3. **Small, reversible PRs.** One concept per change.
4. **Tests where they make sense.** Music-quality evaluation is hard, but theory operations have clear correctness criteria — write tests for those.
5. **ADR for every architecture-shaping decision.** Even small ones. `docs/adr/NNNN-slug.md`.
6. **Never edit `NORTH_STAR.md` without explicit maintainer approval.** Suggest the diff; let them decide.
7. **Linter clean.** No warnings.
8. **English only in code, commits, docs.** Conversational replies follow the maintainer's language.
9. **Never invent music-theoretic claims.** Route every musical operation through the theory engine (music21 + partitura + custom rules).
10. **NEVER, under any circumstances, train on the maintainer's compositions, recordings, or any user-generated content.** This is permanent. There is no opt-in toggle to enable this. There is no exception. Do not "leak" this data into model fine-tuning, LLM context retention, vector indices used for training, or any analytics pipeline that retains content beyond the immediate operation. See §11 here, §5 non-goal #6 in `NORTH_STAR.md`.

## 7. Decision logging

When you make a meaningful decision (a dependency choice, an algorithm choice, a UX flow, a data-model field), record it. Three places, in order of weight:

1. **ADR** (`docs/adr/NNNN-slug.md`) for architecture/stack decisions.
2. **NORTH_STAR.md §13 Decisions Log** for product-shaping decisions.
3. **Commit message** for code-level changes.

## 8. Cost discipline

Stockhausen is personal-use; every API call is the maintainer's money.

- Cache LLM responses aggressively.
- Prefer Claude Sonnet over Claude Opus unless the task explicitly needs Opus.
- Modal: scale-to-zero, always.
- Don't introduce a new paid dependency without an ADR.

## 9. Quality bars

- **Latency:** guitar pluck → note on screen ≤ 20 ms; target 10 ms.
- **Correctness:** every agent-proposed musical change passes the theory engine, or is rejected.
- **Reversibility:** every change can be undone.
- **Resilience:** every change is auto-saved; crashes don't lose work.

## 10. When you don't know

Ask. Don't guess at the maintainer's intent — especially for product/UX decisions. For pure-engineering decisions (e.g., crate choice within a tiny scope), use judgment, document, move on.

## 11. Privacy & data — non-negotiable

- **All maintainer data is private and stays local.** Compositions, recordings, projects, sketches, notes — all of it.
- **No cloud sync.** Full local in all current phases. Files live on the maintainer's disk.
- **No LLM logs of personal compositions** beyond the immediate tool-call. After a tool call completes, the score content is not retained anywhere outside the project file.
- **NEVER train on maintainer data.** Permanent rule. There is no opt-in toggle. There never will be. Stockhausen reads the maintainer's music to help them — never to feed itself.
- **No analytics that capture content.** PostHog/etc. may track UI events (button presses, feature usage) but **must never** capture musical content, score text, or audio.
- **LangSmith/observability traces** — if used at all — must redact musical content before logging. Counts and metadata only.

## 12. Updates to this file

When this file changes, note the date and the change at the bottom:

```
## Changelog
- 2026-05-13 — initial version.
```

## Changelog

- **2026-05-13** — Initial version. Establishes maintainer profile, communication rules, stack glossary, decision-logging rules, privacy posture.
