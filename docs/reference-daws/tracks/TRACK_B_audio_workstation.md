# Track B — Audio Workstation Layer

> **Status:** Draft skeleton (June 27, 2026). Elaborate in successive chats, phase-doc style.
> **Becomes:** **Phase 5** (maintainer decision, June 27, 2026 — see [`../README.md`](../README.md)).
> **Source teardown:** [`../PRO_TOOLS.md`](../PRO_TOOLS.md) (primary), [`../GARAGEBAND.md`](../GARAGEBAND.md).
> **Why:** We have a notation editor but almost no audio-DAW. Recording was *named* in Phase 2 and
> never specced. This is that spec — filtered to the composer-facing subset (Pro Tools teardown §3).

---

## B.1 Goal

The maintainer can **record audio and MIDI takes**, edit clips non-destructively, **comp** the best
parts of several passes, set **clip gain**, warp audio to the grid, add fades, and drop **markers** —
all in service of capturing and shaping a composition (not mixing-for-delivery).

## B.2 Scope (workstreams)

- **B1 — Recording.** Multitrack audio capture via CPAL (Rust, RT thread) → `takes/`; MIDI capture
  promoted from `useMidiRecorder` into real take management. Count-in, punch, loop record.
- **B2 — Clip model.** Non-destructive clips referencing takes (offset/length/gain), as
  `Operation`s in the existing log. Trim/split/move/duplicate.
- **B3 — Waveform editing UI.** wavesurfer.js regions + timeline + minimap; fades/crossfades via the
  envelope plugin. Pre-decoded peaks for large files (memory caveat).
- **B4 — Comping / playlists.** Take lanes per track; swipe-comp to assemble a composite. Keep all
  takes (Pillar 3's "performance vs notation" two-track idea generalizes here).
- **B5 — Clip gain.** Per-clip level + breakpoints, independent of track automation (Track C).
- **B6 — Elastic audio / warp.** Finish the Rubber Band (GPL) FFI; warp-marker UI to stretch audio
  to the grid (time and/or pitch). Shared with Track D's tempo-without-pitch.
- **B7 — Markers / memory locations.** Named song positions; auto-populate from
  `theory.analyze_form` once it's real (`../REFINE_AND_ERADICATE.md` §1). Recall/jump/loop-between.
- **B8 — Tempo map / beat detection.** Reuse Pillar-3 onset detection to derive tempo from a free
  performance.

## B.3 Candidate tools

| Need | Tool | License | Notes |
|---|---|---|---|
| Audio capture (low latency) | **CPAL** (Rust, shipped for meter) | MIT/Apache | Already in `src-tauri`. Extend from meter → take recording. |
| Waveform UI + regions + fades | **wavesurfer.js** v7 | BSD-3 | Regions/Timeline/Minimap/Envelope/Record plugins. Pre-decoded peaks for big files. |
| Multitrack editor reference | **waveform-playlist** (naomiaro) | MIT | Audacity-inspired; reference for the lane model, not necessarily a dep. |
| Time/pitch warp | **Rubber Band** (GPL) via Rust FFI | GPL | Personal-use covers GPL (North Star §8). SoundTouchJS for instant preview. |
| Transport/scheduling | **Tone.js** (shipped) | MIT | Keep as clock. |

## B.4 Definition of Done (stub)

- [ ] Record an audio take from the interface; it lands in `takes/` and plays in sync.
- [ ] Trim/split/move a clip non-destructively; undo via the operation log.
- [ ] Comp 3 guitar passes into one composite track.
- [ ] Clip gain + fades audibly work.
- [ ] Warp a clip to the grid (Rubber Band FFI real, not scaffold).
- [ ] Markers recall named positions; loop between two markers.

## B.5 Phase placement

**Phase 2.** This is the bulk of "recording" that Phase 2 named. B7 (markers) is small enough to pull
into late Phase 1 / M1.5 polish.

## B.6 Dependencies & risks

- **Depends on:** Track D's real sampler (to hear recordings in a real mix); the §3 data-model
  extension (`audio_clips`, `markers`) from `../REFINE_AND_ERADICATE.md`.
- **Risk:** browser audio latency for monitoring while recording is 10–20 ms above native — record
  through the **native CPAL path**, not Web Audio, and treat the browser as display.
- **Risk:** wavesurfer decodes whole files in memory (M2 Air, 8 GB). Use pre-decoded peaks + stream
  from disk; freeze/commit (Track C) to bound RAM.

## B.7 Open questions for the maintainer

1. How much audio recording do you actually want vs. MIDI/guitar→MIDI? (Affects how deep B1/B4 go.)
2. Is comping a real need for your workflow, or is "keep the best single take" enough for v1?
3. Where do takes live on disk relative to the project folder (size on the M2 Air)?
