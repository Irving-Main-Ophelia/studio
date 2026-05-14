# ADR-0010 — Audio engine v2: Web-Audio mixer + Rubber Band FFI scaffold

- **Status:** Accepted, May 13, 2026
- **Phase:** 1 — M1.2 (Audio engine v2 + Mixer)
- **Supersedes:** —

## Context

Phase 0 shipped `Player` with a single `SplendidGrandPiano` instance and a
flat `play / stop / preload` surface. The Phase-1 goal (PHASE_1.md §1.4-C)
demands six things:

1. Per-track gain, pan, mute, solo + master.
2. Loop a region, scrub anywhere, play from the editor cursor, play from
   a bar number.
3. A click track and a count-in.
4. Multi-instrument playback (sfizz.wasm + VSCO 2 CE for chamber music).
5. Tempo-without-pitch (Rubber Band) for slow-down practice + WAV
   exports.
6. Smooth 60 fps UI under all of the above on an M2 Air with 8 GB RAM.

The hard part isn't the abstraction; it's the *cost discipline*: the
sample libraries weigh 3-4 GB each and the maintainer hasn't downloaded
them yet (see `docs/phases/PREREQUISITES.md`). We need to ship the
plumbing now so M1.4's agent can call into the same interfaces, but
defer the actual sample-library loading until the maintainer
downloads them.

## Decision

### Engine architecture

Three pieces, each with a public surface that the rest of the app
depends on:

```
┌─────────────────────────────────────────────────────────────┐
│  ScoreEngine (React Context)                                 │
│  ├── mixer: MixerSnapshot                                    │
│  ├── loop, clickEnabled, countInBars                         │
│  ├── play, stop, playFrom, playFromCursor                    │
│  └── setTrackGain / setTrackPan / setMute / setSolo / …      │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Player                                                      │
│  - owns the AudioContext + the Mixer                         │
│  - lazy-loads samplers (one per track id)                    │
│  - implements play / stop / playFrom / setLoop / setClick    │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Mixer                                                       │
│  - per-track GainNode -> StereoPannerNode -> GainNode chain  │
│  - master GainNode -> ctx.destination                        │
│  - solo-overrides-mute logic                                 │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
                    ctx.destination
```

The sampler is a swappable detail behind `Player`. Phase 1 ships with
`smplr`'s `SplendidGrandPiano` wired to the "piano" track. When the
maintainer downloads VSCO 2 CE we ship the `sfizz.wasm` AudioWorklet
sampler in a follow-up patch *without touching the engine surface above*.

### Mixer state lives in the project

The `mixer` JSON in `project.json` is the canonical source. ScoreEngine
keeps a React-state copy in sync; the autosave timer flushes it to disk
alongside the operation log. The Web Audio graph reads from the same
snapshot. Solo-overrides-mute is computed inside `Mixer.applyTrackGains`
so the rule is identical regardless of who toggled solo.

### Loop, scrub, count-in, click track

- `setLoop({ start_sec, end_sec })` re-schedules the note batch as N
  repetitions of the region (capped so a 1-second loop doesn't schedule
  millions of events).
- `playFrom(seconds)` re-schedules the note batch from a non-zero
  offset. `playFromCursor()` converts the editor's
  `(measure_number, beat_offset)` to seconds via the score's tempo
  (M1.3 will improve the conversion with tempo changes and time-signature
  changes per measure).
- `setCountIn(bars)` schedules N bars of click bleeps before the first
  scheduled note. The downbeat is brighter than the off-beats.
- `setClick(true)` overlays the same metronome bleeps during playback.
- Click bleeps are synthesised sine bursts (40 ms, exponential envelope)
  so the count-in is reliable even when the piano hasn't preloaded yet.

### Rubber Band FFI scaffold

We **define** the Tauri command + the request/response types now so the
WAV exporter (M1.5) and the future "Practice at 75 % tempo" UI can call
into a stable surface. The current implementation is a no-op pass-through
that logs a warning when a non-trivial ratio was requested. When the GPL
C++ build lands (post-Phase-1) it drops in behind the same Rust function.

`rubberband_stretch(input) → output` takes interleaved-f32 PCM, channel
count, sample rate, time ratio, and pitch shift in semitones. The
`stretched: bool` flag in the output tells the caller whether a real
stretch happened.

### Out of scope (deferred + tracked in parking-lot)

- **sfizz.wasm AudioWorklet sampler.** Requires building / vendoring
  `sfizz` to WebAssembly. Will plug into the same `Player.preload`
  branch when the maintainer downloads VSCO 2 CE.
- **VSCO 2 CE / Sonatina / VCSL bundles.** Maintainer-side install per
  `PREREQUISITES.md`.
- **Real Rubber Band GPL bridge.** Needs a build script that compiles
  the C++ library and links it into the Tauri binary, plus GPL
  attribution screens. Out of M1.2 because the practical user
  immediately downstream is the M1.5 WAV exporter, which can ship the
  pass-through path on day one.
- **Per-part output meters.** The current AudioMeter tile reads the
  hardware input. Adding a per-track output meter requires inserting
  AnalyserNodes into every channel; nice-to-have, slipping to M1.5
  polish.

## Alternatives considered

- **Tone.js Transport as the conductor.** Compelling: gives us sample-
  accurate scheduling, transport position events, and a Tonejs-native
  metronome. Skipped in M1.2 because Tone.js's instrument layer assumes
  it owns the AudioContext, which fights with smplr. Re-evaluate when
  sfizz.wasm lands.
- **Custom AudioWorklet for the click.** Cleaner than scheduling sine
  bursts from the main thread, but sine bursts are <100 events per
  count-in — main-thread scheduling is fine and avoids worklet build
  complexity.
- **Pure-Rust pitch-shifter.** `dasp` + a phase-vocoder crate would give
  us something today, but quality is below Rubber Band's. Personal-use
  appetite for "good enough now" is low; deferring is better than
  shipping a bad one.

## Consequences

- The mixer is real on day one: the maintainer can already solo / mute
  the piano track, push the master fader, toggle a click, and queue a
  count-in.
- The note-by-note round-trip with backend `score_edit` already routes
  through this engine — every edit is immediately audible at the click
  of play, with the same mixer state.
- `playFromCursor` works once an edit is made: hit a few notes, ⏎ to a
  new bar, "play from cursor" — the count-in fires, the loop replays.
- The Rubber Band stub lets us write the WAV exporter without
  conditional branches. When the real bridge lands later, every caller
  upgrades transparently.
- The `mixer` field in `project.json` is now part of the on-disk schema.
  Project files saved with empty mixer state are still readable
  (default deserialisation).
