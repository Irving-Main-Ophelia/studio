# Track D — Instruments, Tone & Sound Library

> **Status:** Draft skeleton (June 27, 2026). Elaborate in successive chats, phase-doc style.
> **Becomes:** **D1/D2/D6 → Phase 3.5** (the "first focus" foundation); **rest → Phase 7** (maintainer decision, June 27, 2026 — see [`../README.md`](../README.md)).
> **Source teardown:** [`../GARAGEBAND.md`](../GARAGEBAND.md) (primary), [`../GUITAR_PRO.md`](../GUITAR_PRO.md), [`../PRO_TOOLS.md`](../PRO_TOOLS.md).
> **Why:** This is the **highest-leverage plumbing in the project**. Playback is still a Phase-0
> piano stopgap; until the sampler is real, every audible feature is blocked. Then: believable guitar
> tone (the guitar-first promise) and a frictionless sound/loop browser.

---

## D.1 Goal

Stockhausen *sounds good*: a real multi-instrument sampler (orchestra, guitars, world instruments),
believable **guitar amp/cabinet tone**, a tagged **loop & sound browser** that auto-conforms to the
project key/tempo, and a small **Smart-Controls-style macro panel** per track.

## D.2 Scope (workstreams)

- **D1 — sfizz.wasm sampler (FINISH).** Land `sfizz.wasm` in an AudioWorklet behind the existing
  `Player` surface (ADR-0005/0010). Replace the sine-bank WAV export with an OfflineAudioContext
  render through it. **This is the unblock; do it first.**
- **D2 — Sample libraries.** Lazy-install VSCO 2 CE + Sonatina + VCSL (`samples.rs`, already
  planned). Sample-set picker; "Piano only" low-RAM fallback for the M2 Air.
- **D3 — Guitar amp / cabinet / pedal modeling.** Integrate **Neural Amp Modeler (MIT)** +
  **GuitarML / RTNeural** for real-time guitar tone. Run on the native CPAL path (best latency) or
  WASM/AudioWorklet. Ship a few curated NAM profiles (6,500+ exist on Tone3000).
- **D4 — Loop & sound browser.** GarageBand-Apple-Loops-style: tagged by instrument/key/tempo;
  auto-transpose loops to the project key (we already transpose losslessly). Source: CC0 packs +
  agent/Magenta-generated loops (Track E).
- **D5 — Smart Controls macro panel.** Per-track panel surfacing the few parameters that matter
  (e.g., amp drive, reverb send, brightness); agent-settable.
- **D6 — Tempo-without-pitch (FINISH).** Complete the Rubber Band FFI (shared with Track B warp);
  SoundTouchJS for instant in-session preview.
- **D7 — World-music idiom sound packs.** SFZ instruments + tuning tables for Persian/Arabic/
  Hindustani/Chinese (the existing Phase-2 plan; this track is where the *sound* half lives).

## D.3 Candidate tools

| Need | Tool | License | Notes |
|---|---|---|---|
| Sampler (SFZ) | **sfizz.wasm** | BSD-2 | AudioWorklet; same upstream as desktop sfizz. North Star/ADR-0010. |
| Alt sampler (SF2) | **fluidsynth-wasm** | LGPL | Fallback for SoundFont2 banks. |
| Sample sets | **VSCO 2 CE / Sonatina / VCSL** | CC-BY / CC0 / MIT | Free; lazy-installed (PREREQUISITES). |
| Guitar amp modeling | **Neural Amp Modeler** | MIT | 6,500+ profiles; standalone + plugin; Apple Silicon. |
| Amp modeling (low-CPU) | **GuitarML Proteus / RTNeural** | permissive | LSTM, ~2% CPU; good for real-time on the M2. |
| Time/pitch stretch | **Rubber Band** (GPL) / **SoundTouchJS** | GPL / LGPL | Offline quality / instant preview. |
| Loop auto-conform | **stockhausen_theory.transpose** (shipped) | BSD | Reuse our lossless transposition. |

## D.4 Definition of Done (stub)

- [ ] A 4-part chamber score plays through sfizz.wasm with distinct instrument timbres.
- [ ] WAV export renders through the real sampler+mixer chain (no sine bank).
- [ ] A DI guitar plays through a NAM amp/cab model in real time at usable latency.
- [ ] Loop browser drops a loop that auto-transposes to the project key.
- [ ] Tempo-without-pitch works on a real render (Rubber Band FFI real).

## D.5 Phase placement

**D1/D2/D6 = Phase 1 (M1.2 finish)** — they're already on the Phase-1 board, just deferred. **D3
(amp modeling), D4 (loop browser), D5 (macro panel), D7 (world packs) = Phase 2.**

## D.6 Dependencies & risks

- **Unblocks:** Tracks A (hear guitar techniques), B (hear recordings), C (something to mix), E (hear
  the drummer).
- **Risk:** sample-library size vs. 8 GB RAM. Lazy install + low-RAM piano fallback + Track-C freeze.
- **Risk:** NAM real-time on the M2 Air — prefer the low-CPU RTNeural/Proteus path; profile early.
- **Risk:** GPL (Rubber Band). Personal-use posture covers it (North Star §8); revisit if posture
  ever changes to distribution.

## D.7 Open questions for the maintainer

1. Priority of guitar amp tone vs. orchestral sample depth — which matters more to your daily
   composing?
2. Acoustic-nylon (classical) vs. electric tone first? (Affects which NAM profiles we curate.)
3. How important is the loop browser vs. writing everything from scratch / with the agent?
