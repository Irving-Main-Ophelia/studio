# ADR-0005 — Phase-0 audio engine: smplr (SplendidGrandPiano)

- **Status:** Accepted, May 13, 2026
- **Phase:** 0 — Week 2
- **Supersedes:** —

## Context

The Phase-0 demo needs to make the score *audible* with minimum ceremony. The full audio engine described in `docs/ARCHITECTURE.md` (sfizz.wasm + Rubber Band + AudioWorklets) is a Phase-1 workstream. Phase 0 needs only:

- A SoundFont-quality piano voice good enough to recognize the music.
- Sample-accurate scheduling using AudioContext time.
- No native bundling of multi-GB sample libraries.

## Decision

Use **`smplr`** (`0.20`) — the modern successor to `soundfont-player` from the same author (`danigb`). Specifically:

- **`SplendidGrandPiano`** as the Phase-0 instrument. Loads from `gleitz/midi-js-Soundfonts` CDN at runtime; samples are tiny and CC-licensed.
- Note scheduling via `piano.start({ note, time, duration })` using `AudioContext.currentTime + offset`.
- A simple ringless mixer (single output channel) — direct to `audioContext.destination`.
- Native CPAL is used **only for the input meter** in Phase 0. Playback stays in the browser audio path.

The list of notes-to-play is computed in the **backend** (`/score/notes`, via `music21`) so we get a single source of truth for tempo, ties, and durations, and the browser stays light.

## Alternatives considered

- **Tone.js Sampler with our own SFZ** — works, but requires shipping samples; bigger Phase-0 surface.
- **Web MIDI synth + system synth output** — depends on the user having a virtual or hardware synth; not a demo path.
- **Native CPAL playback only** — overkill for Phase 0; the audio worklet bridge belongs in Phase 1.
- **Web Audio AudioWorklet + sfizz.wasm** — the Phase-1 target. Too much for the Phase-0 budget.

## Consequences

- Sound quality is *piano-only* in Phase 0; that's fine for our chorale + Andante fixtures.
- The instrument is loaded on demand, lazily — first play has a ~2 s warm-up while samples download. We use a "loading" status in the UI.
- The API surface (`Player.play / .stop / .preload`) hides the engine; Phase 1 swaps the implementation behind the same interface.
- All scheduling happens in audio-context seconds. Pause/seek is **not** in Phase 0 — those join the Phase-1 transport.
