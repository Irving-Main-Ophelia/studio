# Phase 3 — The Co-Composer & The Style

> **Status:** Planned. Starts when Phase 2 DoD is fully checked.
> **Duration:** ~6 months part-time.
> **Outcome:** Composer-specific style transfer is live. The agent becomes a true multi-agent co-composer. Voice arrives (if the maintainer still wants it). Stockhausen reaches a personal v1.0.

---

## 3.1 Goal

By the end of Phase 3, the maintainer should be able to:

1. Select a passage and command: *"Give this a Rachmaninoff touch at intensity 60%."* — and hear the harmony, voicing, and ornamentation nudged toward Rachmaninoff. With a slider to adjust live.
2. Compose with a **panel of agents** that specialize: a Planner, a Harmonist, a Counterpoint Master, an Orchestrator. They debate, then the user picks.
3. Practice a piece on guitar; Stockhausen scores their performance, highlights pitch/rhythm misses, and proposes a practice plan.
4. Export production-grade outputs: stems, individual parts, conductor's score, click track, practice tracks.
5. Optionally, **speak** to Stockhausen (voice agent first iteration; only if the maintainer wants it after Phase 2).
6. Trust the agent's musical claims because an internal **eval harness** has been measuring its correctness for months.

## 3.2 Success criteria (Definition of Done)

- [ ] **Pillar 1 alpha** — composer adapters for the initial roster (Rachmaninoff, Debussy, Bach, Leo Brouwer, Rimsky-Korsakov, Manuel M. Ponce). Each as a LoRA adapter over Moonbeam, with a single-slider inference-time intensity control.
- [ ] **Pillar 3 T2** — in-house guitar → MIDI pipeline. Latency target ≤ 15 ms; accuracy parity or better than MIDI Guitar 3 for chamber/classical guitar tones.
- [ ] **Pillar 6 advanced** — MIDI-DDSP integrated for expressive renders; DDSP-VST optional for timbre experiments.
- [ ] **Pillar 7 multi-agent** — Planner / Harmonist / Counterpoint / Orchestrator agents coordinated by a top-level orchestrator. ComposerX pattern.
- [ ] **Pillar 10** — practice coach: real-time pitch/rhythm scoring against a target score; difficulty heat-map; practice plan.
- [ ] **Pillar 12 full** — production exports: stems (per-track WAV), individual parts (per-instrument PDF), conductor's score (PDF), click track, minus-one practice tracks. Publish-to-Soundslice / publish-to-Flat (one-click).
- [ ] **Voice agent (optional)** — if the maintainer enables it: OpenAI Realtime API integration with WebRTC. 30+ of the existing tools exposed.
- [ ] **Eval harness** — nightly automated evals on Modal measuring:
  - voice-leading-violations / 100 operations,
  - style-transfer perceptual judgments (LLM-as-judge),
  - tool-call success rate,
  - latency budgets per operation.

## 3.3 Scope (workstreams)

### A. Pillar 1 — Composer-style adapters

This is the most research-y workstream. We pursue two complementary techniques in parallel:

1. **Composer Vector (inference-time steering)** — extract a learned latent direction per composer; add it to the base-model latent at inference time with a scalar weight (the intensity slider).
2. **LoRA adapters (lightweight fine-tunes)** — train one small adapter per composer on a curated corpus of public-domain works by that composer (the personal-use posture means we can use modern composers too without licensing concerns).

Training pipeline (`backend/inference/style_training/`):
1. Curate a corpus per composer:
   - PD scores → MusicXML via existing libraries.
   - Modern composers' PD works where they exist; otherwise we use the personal-use clause (no public model release).
2. Tokenize for Moonbeam.
3. Fit a LoRA adapter (~hours on a Modal H100 → $5–25 per composer).
4. Extract composer-vector direction.
5. Eval against held-out works.

Runtime:
- A single slider: `intensity ∈ [0, 1]`. Default 0.4.
- Optional per-feature controls (harmony only, ornamentation only, …) — *gated behind a "power-user" toggle*; the default is the single slider per §13 of the North Star.

The reference roster is captured in [`docs/REFERENCE_COMPOSERS.md`](../REFERENCE_COMPOSERS.md). Phase 3 ships adapters for the initial six.

### B. Pillar 3 T2 — In-house guitar → MIDI

Replace MIDI Guitar 3 with a custom pipeline:

- AudioWorklet:
  - 256-sample sliding hops (5.3 ms @ 48 kHz).
  - Onset detection (energy + spectral flux + adaptive thresholds).
  - Goertzel-based harmonic-template matching on harmonics 2–6.
  - Onset-ahead-of-pitch triggering with 25 ms attack timeout.
- Optional small **ONNX model** fine-tuned on classical/chamber guitar tones for pitch confidence boost. Trained on:
  - PD recordings + the maintainer's own multi-take corpus (with their permission to use for *their own model* — never sent off-device).
- Bound to the same notation realtime renderer as Phase 2.

This is **mainly a research workstream** in Phase 3; MIDI Guitar 3 stays as the day-job fallback until T2 reaches parity.

### C. Pillar 6 advanced — Expressive renders

- **MIDI-DDSP** wired in for per-note articulation realism.
- **DDSP-VST** optional for timbre-morph experiments.
- Both run on Modal (GPU); results cached locally.

### D. Pillar 7 multi-agent

The chat agent grows from "single Claude with 30 tools" into a **panel**:

- **Orchestrator** — the LLM the user talks to. Receives the brief; decomposes into sub-tasks.
- **Planner** — handles form, key plan, motif design.
- **Harmonist** — handles chord progressions, voicings, modulations.
- **Counterpoint Master** — handles voice-leading, fugal devices, contrapuntal textures.
- **Orchestrator (instrument)** — handles re-orchestration and idiom-pack rules.

Each is a Claude-Sonnet-4.6 (or Opus 4.7 for the hardest ones) instance with a *focused* tool surface. The top-level Orchestrator coordinates via message-passing in JSON, with the user seeing a "decision tree" of each agent's contribution in the UI.

Pattern: `ComposerX` paper (April 2024). Validated to materially improve musical quality.

### E. Pillar 10 — Practice Coach

- User plays the score live (via guitar audio).
- The Pillar-3 pipeline produces a performance MIDI buffer.
- Diff against the target score:
  - Pitch errors (wrong note, wrong octave).
  - Timing errors (early/late/missing/extra).
  - Dynamics deviation.
- Visualize as a heat-map overlay on the score.
- Generate a `PracticePlan`: a graded sequence of exercises focused on the weakest measures.

### F. Pillar 12 — Production exports

Beyond Phase 1's MusicXML/MIDI/WAV/PDF:

- **Stems** — per-track WAV at 48 kHz / 24-bit.
- **Individual parts** — per-instrument PDFs with cues.
- **Conductor's score** — full layout PDF.
- **Click track** — separate WAV for sync.
- **Minus-one practice tracks** — full mix minus the part the user is practicing.
- **Publish to Soundslice / Flat** — one-click via their public APIs.

### G. Voice agent (optional)

Only if the maintainer enables it at Phase 3 start:

- **OpenAI Realtime API** (`gpt-realtime-2`) over **WebRTC**.
- 30+ existing tools exposed.
- Voice activity detection + barge-in.
- Wake-word optional (probably "Karlheinz" 😉 — but configurable).
- Pause / mute / mode-switch hot keys.

If the maintainer doesn't want voice, this workstream is skipped without penalty.

### H. Eval harness

The most quietly important workstream:

- **Nightly evals on Modal** measuring:
  - **Theory correctness** — does the agent's output pass our voice-leading + range + enharmonic rules?
  - **Style fidelity** — LLM-as-judge: "rate this 8-bar excerpt for Rachmaninoff-ness on a 1–10 scale; explain."
  - **Tool-call accuracy** — golden test set of (prompt, expected tool calls).
  - **Latency** — p50/p95 for each tool, each phase of the pipeline.
- Results stored in Postgres; dashboarded in Grafana Cloud or PostHog.
- Regressions block "ship to maintainer" of new model/agent versions.

## 3.4 ADRs for Phase 3

| # | Title |
|---|---|
| 0021 | Composer Vector vs LoRA: hybrid strategy |
| 0022 | In-house guitar → MIDI pipeline architecture |
| 0023 | Multi-agent message protocol |
| 0024 | Practice coach scoring rubric |
| 0025 | Voice agent feature flag & rollout |
| 0026 | Eval harness rubrics and gating thresholds |

## 3.5 Risk watch

| Risk | Mitigation |
|---|---|
| Composer-vector technique doesn't produce audible style shift | Fall back to LoRA-only; if both underwhelm, defer Pillar 1 to a v1.1. |
| Training data per composer is too small | Personal-use posture lets us use *anything*; we still keep models off-device-only. |
| Multi-agent latency explodes | Cache plans; let the user proceed with the orchestrator's first take; sub-agents debate in background. |
| Voice agent is fun but never useful for serious composing | Keep behind a flag; measure activation/retention; cut if unused after a month. |
| Eval costs grow | Cap nightly Modal spend; sample held-out set; rotate eval subsets. |
| Practice coach is wrong / discouraging | Calibrate gently; offer a "I disagree" feedback button that logs corrections (locally, never sent out). |

## 3.6 What "v1.0" means

When Phase 3 DoD is complete, we declare Stockhausen v1.0. It is:

- The daily composition tool the maintainer reaches for.
- Capable of every pillar (1–12) at "good enough" levels.
- Stable, autosave-safe, fast, beautiful.
- **Closed-source, personal-use.**

There is no Phase 4 *currently planned*. If the maintainer ever wants to share Stockhausen — open-source it, hand it to friends, productize it — we re-open §13 of the North Star and revisit. Until then, Phase 3 is the destination.

## 3.7 Done is done

When all DoD items in §3.2 are checked, Phase 3 is complete. Cut `v1.0.0`, record `phase-3-demo.mov`. Take a week off. Then start composing — that's why we built this.
