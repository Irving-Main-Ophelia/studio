# Principles

> Quick-read companion to [`../NORTH_STAR.md`](../NORTH_STAR.md) §2.

## Product principles

1. **Composer-first, agent-assisted.** The human is the author. The agent proposes; the human disposes.
2. **Theory rigor over generation novelty.** Correctness first; cleverness second.
3. **Everything is undoable.** Every AI action produces a diff and an inverse.
4. **Every operation is explainable.** The agent says *why* in music-theoretic terms.
5. **Two formats, one truth.** MusicXML 4.0 + Stockhausen JSON. We never lose information on save.
6. **Offline-capable.** Core composing, recording, playback work without internet.
7. **Voice and chat are alternatives, not replacements.** Power users use both.
8. **No defeatism.** Decompose, ship a 60% solution, iterate.

## Engineering principles

1. **Native latency, web-grade UX.** Tauri + Rust for audio; React for UI. ≤ 20 ms guitar-to-staff.
2. **Local-first.** Cloud is optional. Files live on disk in open formats.
3. **Event-sourced state.** Every change is an event; replay reconstructs any moment.
4. **Test what we ship.** Music quality evals run nightly; deterministic where possible.
5. **One canonical type for each concept.** No "music" type in five places.
6. **Composability over framework lock-in.** Tone.js, music21, OSMD are good citizens, not foundations we can't replace.
7. **Quarterly Build-vs-Buy review.** Every quarter, re-evaluate every dependency.
8. **Documentation lives next to code.** ADRs in `docs/adr/`, READMEs in every package.

## Code & repo conventions

1. **English everywhere.** Code, comments, commits, docs, error messages, UI strings (i18n later).
2. **TypeScript strict.** No `any` without justification.
3. **Rust 2024 edition.** `cargo clippy` clean, `cargo fmt` enforced.
4. **Python 3.12+** for the backend. Type-annotated. `ruff` + `mypy --strict`.
5. **Conventional Commits.**
6. **Feature flags by default** for anything risky.
7. **No deletes without an ADR** if the deletion affects the canonical data model.
8. **One pull request per architecture-shaping decision.**

## Open-source posture

- **Stockhausen itself is closed/private.** No public repo, no community release.
- **We use open-source dependencies freely**, respecting their licenses (MIT, Apache 2.0, BSD, LGPL, CC0). GPL libraries (e.g., Rubber Band) are fine because we use them for personal use, not redistribute.
- **We never contribute proprietary Stockhausen code upstream**; we can contribute bug-fixes to dependencies if it helps us.

## Beginner-friendly communication

The maintainer is a **musician with strong music theory**, a **software beginner**. Any AI agent or human collaborator working on Stockhausen **must**:

1. Define every technical acronym on first use (e.g., "MCP — Model Context Protocol, Anthropic's open standard for letting LLMs call tools").
2. Use analogies from music when explaining engineering concepts ("an AudioWorklet is like a dedicated music stand in a concert hall — it has its own job and doesn't get distracted").
3. Avoid jargon dumps. Pick the 2–3 terms that matter for the decision; defer the rest.
4. Confirm understanding before locking in any irreversible decision.

See `AGENTS.md` at the repo root for the full agent-collaboration rules.

## How we say "no"

- **Non-goal? Point to §5 of the North Star and decline.**
- **Out-of-phase? Park in `docs/parking-lot.md`, decline for now, return at phase review.**
- **Tempting but theoretically dubious AI feature? Default no until the theory engine can validate the output.**
