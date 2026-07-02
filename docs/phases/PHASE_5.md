# Phase 5 — Audio Workstation

> **Status:** Active — next to execute after Phase 4 (June 30, 2026).
> **Duration target:** ~6–8 weeks part-time (B1 native recording and B6 Rubber Band FFI are the long poles).
> **Outcome:** The maintainer can **record audio and MIDI takes**, edit clips **non-destructively**,
> **comp** the best parts of several passes, set **clip gain** and fades, **warp** audio to the grid, and
> drop **markers** — all in service of *capturing and shaping a composition*, not mixing-for-delivery.
> Every clip edit is an `Operation` in the log and survives save → reload. Recording goes through the
> **native CPAL path** (Rust), never browser audio, and the browser stays a display.
>
> **Why Phase 5, why now.** Phase 4 made the guitar part **legible** (tab + articulations + import); that
> is the prerequisite for turning a *performance* into a *score*. "Recording" was named in Phase 2 and
> never specced — this is that spec, filtered to the composer-facing subset. Phase 3.5 already shipped a
> real Web-Audio mixer/transport and a CPAL input meter; schema v2 already **reserves** the `audio_clips`
> and `markers` shapes and creates the `takes/` folder. Phase 5 fills those reserved slots with real data
> and a real capture loop.
>
> **Source of scope:** [`../reference-daws/tracks/TRACK_B_audio_workstation.md`](../reference-daws/tracks/TRACK_B_audio_workstation.md)
> (the skeleton this doc promotes) + [`../reference-daws/PRO_TOOLS.md`](../reference-daws/PRO_TOOLS.md)
> (primary teardown) + [`../reference-daws/GARAGEBAND.md`](../reference-daws/GARAGEBAND.md).

---

## 5.1 Goal

By the end of Phase 5 the maintainer can:

1. **Record an audio take** from the audio interface through the native CPAL path; it lands in `takes/`
   and plays back in sync with the transport. **Record a MIDI take** (promoting `useMidiRecorder` into
   real take management). Count-in, loop-record, and punch work.
2. **Edit clips non-destructively** — trim, split, move, duplicate — each as an `Operation` with an
   inverse, referencing a take by offset/length (the take file is never mutated).
3. **See and shape audio on a waveform** — regions, timeline, fades/crossfades — via a waveform-editing
   UI that stays a *display* over the canonical take files.
4. **Comp** several passes: take lanes per track + a swipe-comp to assemble a composite; all takes kept.
5. **Set clip gain** (per-clip level + breakpoints, independent of the Phase-6 track automation) and
   audible **fades**.
6. **Warp** a clip to the grid — finish the Rubber Band FFI so tempo (and optionally pitch) stretch is
   real, not a no-op.
7. **Drop and recall named markers** (memory locations); loop between two markers.

This phase adds real audio-DAW surface for the first time: a recorder, a take/clip model, a waveform
editor, comping lanes, and a real time-stretch engine.

---

## 5.2 Success criteria (Definition of Done)

Grouped by workstream. A box is checked only when the feature **round-trips** (save → reload) where
applicable and has a test.

**B1 — Recording** *(the capture loop — long pole)*

- [ ] Native **audio capture** via CPAL (Rust, real-time thread) writes an interleaved take to `takes/`
      (WAV/float), decoupled from the render thread by a ringbuffer; the browser only displays level +
      status. Count-in, **loop-record** (take per pass), and **punch** (in/out) work.
- [ ] **MIDI capture** promoted from `useMidiRecorder` into take management — a MIDI take lands alongside
      audio takes and can be quantised/kept as a performance layer.
- [ ] A take is addressable by id and plays back **sample-accurately in sync** with the Tone.js clock.

**B2 — Clip model** *(non-destructive edits as Operations)*

- [ ] Clips reference a take by `{take_id, offset, length, gain}` and never mutate the take file; the
      canonical list lives in `project.json` (`audio_clips`, promoted from the reserved v2 slot).
- [ ] **Trim / split / move / duplicate** are each an `Operation` with an inverse (undo/redo via the
      existing log); every edit round-trips through save → reload.

**B3 — Waveform editing UI**

- [ ] `wavesurfer.js` v7 (regions + timeline + minimap + envelope) renders each clip; **pre-decoded
      peaks** for large files (stream from disk, don't decode whole files into RAM). The waveform is a
      *display* over the take files (ADR — canonical audio is the files, not the UI's decode).
- [ ] **Fades / crossfades** via the envelope plugin; audible on playback.

**B4 — Comping / playlists**

- [ ] **Take lanes** per track (all passes kept); a **swipe-comp** assembles a composite from segments of
      different takes. The composite is itself a clip list — no take is destroyed (Pillar 3's
      "performance vs notation" generalised).

**B5 — Clip gain**

- [ ] Per-clip **gain + breakpoints**, independent of the Phase-6 track automation; audible and
      round-tripping.

**B6 — Elastic audio / warp** *(Rubber Band real — long pole)*

- [ ] The Rubber Band GPL C++ library is bound through the existing `rubberband.rs` FFI seam (today a
      no-op fallback), so **tempo stretch** (and optionally pitch) is real. A **warp-marker** UI stretches
      a clip to the grid. Shared with Phase 7's tempo-without-pitch.

**B7 — Markers / memory locations**

- [ ] Named song-position **markers** (promoted from the reserved v2 slot); recall/jump, and
      **loop-between** two markers. Auto-populate from `theory.analyze_form` when that is real (best-effort).

**B8 — Tempo map / beat detection**

- [ ] Derive a **tempo map** from a free performance (reuse onset detection); the grid follows the
      performance instead of forcing the performance onto a fixed grid.

**General**

- [x] **Schema v4**: real typed `audio_clips` + `markers` shapes + a lossless v3→v4 migrator (reuse the
      `persistence.rs::migrate_meta` pattern). ADR-0021. *(Done — `persistence.rs` tests
      `round_trips_audio_clips_and_markers`, `migrates_v3_project_to_v4_and_preserves_reserved_slots`.)*
- [ ] ADRs written: **0021** (schema v4) + **0022** (native CPAL recording path) + **0023** (Rubber Band
      GPL FFI) + **0024** (wavesurfer as display-only waveform UI).
- [ ] `git tag v0.5.0-audio` once every box is checked and round-trips with tests.

---

## 5.3 Where we are — the launch pad (verified June 30, 2026)

Read the code, not just the docs. Confirmed state of every surface Phase 5 touches:

| Layer | Reality today | Phase-5 action |
|---|---|---|
| Audio input (`src-tauri/src/audio.rs`) | **CPAL input meter only** (Phase 0): opens the default input, computes an RMS peak each ~33 ms, emits `audio:meter`. The file's own comment reserves "real capture buffers feeding a Rust ringbuffer" — not built. | B1: extend the CPAL device-open path from meter → **take recording** (ringbuffer → disk), on its own RT thread. |
| Time-stretch (`src-tauri/src/rubberband.rs`) | **No-op fallback scaffold** (M1.2): the Tauri command + interface ship, but the implementation just re-emits the input samples. The GPL C++ bridge is not landed. | B6: land the real Rubber Band FFI behind the existing seam — no Tauri-surface change. |
| Persistence (`src-tauri/src/persistence.rs`) | **schema v3.** `audio_clips` and `markers` are **reserved** (empty `Vec<JsonValue>`, "empty until Phase 5"); the `takes/` subfolder is created on project init. `sends/buses/automation` stay reserved for Phase 6. | B2/B7: bump v3 → v4, give `audio_clips`/`markers` real typed shapes + a v3→v4 migrator. |
| MIDI capture (`src/lib/useMidiRecorder.ts`) | Web MIDI capture hook (frontend); records events, no take management. | B1: promote into real MIDI **takes** managed alongside audio takes. |
| Transport / clock (`tone` ^15, `src/audio/*`) | Web-Audio mixer + Tone.js transport shipped (loop, count-in, click, play-from-cursor). | B1/B3: schedule take/clip playback on the existing clock; keep Tone.js as the single clock. |
| Waveform UI | **None** — no `wavesurfer` dependency yet. | B3: add `wavesurfer.js` v7 as a display-only waveform editor. |

**Net:** the two expensive pieces — a native recording path and a real time-stretch engine — each have a
**seam already in place** (the CPAL meter's device code; the `rubberband.rs` FFI interface). The reserved
schema slots mean the persistence shape is half-designed. The remaining work is the capture loop, the
clip/comp model, and the waveform UI.

---

## 5.4 Scope — the workstreams

### B1 — Recording (native CPAL capture) — *the capture loop, a long pole*

Extend `audio.rs` from meter to recorder: on a dedicated real-time thread, pull input frames from the
CPAL stream into a lock-free ringbuffer that a writer thread drains to a take file in `takes/`. The
browser subscribes to level/status events only — **monitoring and capture stay native** (browser audio
adds 10–20 ms latency; treat the browser as display). Count-in and click reuse the transport; loop-record
writes one take per pass; punch bounds the write window. MIDI capture promotes `useMidiRecorder` into the
same take model.

### B2 — Clip model (non-destructive) — *edits as Operations*

A clip is `{id, take_id, offset, length, gain, fades}` referencing a take; the take file is immutable.
Trim/split/move/duplicate are `Operation`s with inverses in the existing log, so undo/redo and
save→reload come for free. The clip list is `project.json.audio_clips` (promoted from the reserved slot).

### B3 — Waveform editing UI

`wavesurfer.js` v7 (Regions + Timeline + Minimap + Envelope) renders clips and fades. Big files use
**pre-decoded peaks** streamed from disk, not a full in-memory decode (M2 Air, 8 GB). The waveform is a
*view* over the canonical take files — never the source of truth (ADR-0024).

### B4 — Comping / playlists

Take lanes per track keep every pass. A swipe-comp selects segments across lanes into a composite; the
composite is a clip list, so nothing is destroyed and the comp is fully non-destructive and undoable.

### B5 — Clip gain

Per-clip level + breakpoints, independent of the Phase-6 track automation (Track C). Audible on playback,
round-tripping through the clip model.

### B6 — Elastic audio / warp (Rubber Band FFI) — *a long pole*

Bind the GPL Rubber Band C++ library through the `rubberband.rs` seam (today a no-op). A warp-marker UI
stretches a clip to the grid (tempo, optionally pitch). Personal-use covers GPL (North Star §8). Shared
with Phase 7's tempo-without-pitch. SoundTouchJS is an option for instant preview before the real render.

### B7 — Markers / memory locations

Named song positions (promoted from the reserved slot): recall/jump and loop-between. Auto-populate from
`theory.analyze_form` when that is real (best-effort, not a blocker).

### B8 — Tempo map / beat detection

Derive tempo from a free performance (reuse the Pillar-3 onset detection): the grid follows the player,
rather than forcing the player onto a fixed grid.

---

## 5.5 Milestones (order of execution)

| Milestone | Workstreams | Status | Tag |
|---|---|---|---|
| **M5.0 — Capture loop** | B1 (audio + MIDI take recording, CPAL) + B2 minimal (clip references a take) + schema v4 (`audio_clips`/`markers` typed) | ⏳ next | — |
| **M5.1 — Clip editing** | B2 full (trim/split/move/duplicate) + B3 (wavesurfer UI) + B5 (clip gain + fades) | ⏳ | — |
| **M5.2 — Comping** | B4 (take lanes + swipe-comp) | ⏳ | — |
| **M5.3 — Warp + tempo** | B6 (Rubber Band FFI real) + B8 (tempo map / beat detection) | ⏳ | — |
| **M5.4 — Markers** | B7 (named markers + loop-between) + polish | ⏳ | `v0.5.0-audio` |

> M5.0 is the spine: nothing else is testable until a take can be recorded and played back in sync.
> B1 and B6 are the long poles — budget accordingly.

---

## 5.6 ADRs to write

| # | Title | Milestone |
|---|---|---|
| 0021 | Audio **schema v4** — typed `audio_clips` + `markers` + v3→v4 migrator | M5.0 |
| 0022 | **Native CPAL recording path** — record through Rust (ringbuffer → `takes/`), browser as display | M5.0 |
| 0023 | **Rubber Band GPL FFI** — real time/pitch stretch behind the `rubberband.rs` seam; GPL/personal-use posture | M5.3 |
| 0024 | **wavesurfer as display-only** waveform UI — canonical audio is the take files, not the decode | M5.1 |

*Numbering:* ADRs are taken through 0020 (Phase 4). Phase 5 takes **0021–0024**.

---

## 5.7 Open questions → to ratify (maintainer)

Carried from `TRACK_B` §B.7. Each has a **recommended default** so work is not blocked; ratify or override.

**Q1 — How much audio recording vs. MIDI / guitar→MIDI?**
*Recommendation:* build B1 audio-first (the interface path) but keep the take model **source-agnostic** so
MIDI and a future guitar→MIDI capture (Phase 2 residue) drop into the same lanes. Don't over-invest in
deep audio comping (B4) until Q2 is answered.

**Q2 — Is comping a real need, or is "keep the best single take" enough for v1?**
*Recommendation:* ship take **lanes** (keep every pass) in M5.0 for free; defer the full **swipe-comp**
(B4/M5.2) behind a flag until you confirm you actually comp. Lanes without swipe already deliver "keep the
best take."

**Q3 — Where do takes live on disk relative to the project folder (M2 Air size)?**
*Recommendation:* inside the project's `takes/` (already created by `persistence.rs`), so a project stays
self-contained and portable; add a freeze/commit step later (Track C) to bound RAM/disk. Revisit an
external take store only if project size becomes a problem.

---

## 5.8 Prerequisites

| Item | Required? | Action |
|---|---|---|
| `wavesurfer.js` v7 (BSD-3) | Required for B3 | `pnpm add wavesurfer.js` in `apps/desktop` |
| Rubber Band C++ (GPL) + a Rust FFI/bindgen path | Required for B6 | vendor the lib; bind through `rubberband.rs`; GPL personal-use per North Star §8 |
| CPAL (Rust, shipped for the meter) | Required for B1 | none — extend the device-open path from meter → capture |
| Tone.js (`tone` ^15, shipped) | Required for B1/B3 | none — keep as the single clock |
| An audio interface / input device | Required for B1 | maintainer hardware |

---

## 5.9 Risk watch

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Browser-audio monitoring latency makes recording feel laggy | High | High | Record + monitor through the **native CPAL path** (ADR-0022); browser is display-only. |
| wavesurfer decodes whole files into RAM (M2 Air, 8 GB) | High | Medium | Pre-decoded peaks streamed from disk; freeze/commit to bound RAM (ADR-0024). |
| Rubber Band GPL FFI is fiddly to build/bind cross-platform | Medium | Medium | The `rubberband.rs` seam already isolates it; ship the no-op fallback until the bridge is proven; SoundTouchJS for preview. |
| Non-destructive clip edits corrupt a take file | Low | High | Takes are **immutable**; clips only reference them; atomic writes (already in `persistence.rs`); round-trip test each op. |
| Sample-accurate sync between takes and the Tone.js clock drifts | Medium | High | Single clock (Tone.js); schedule against sample positions; test playback alignment. |
| Schema v4 migrator corrupts a project | Low | High | Reuse the tested v-migrator pattern; snapshot before migrate; round-trip test. |

---

## 5.10 Out of scope (explicitly not Phase 5)

- ❌ Mixing-for-delivery — sends/inserts/buses/master chain + **track automation** (**Phase 6**, Track C;
      schema slots stay reserved).
- ❌ Expressive per-technique **sound** / amp-sim / real sampler quality (**Phase 7**, Track D). Phase 5
      captures and edits audio; Phase 7 voices the score.
- ❌ Live **guitar→MIDI** capture binding (**Phase 2 residue**) — Phase 5 delivers the take model it will
      plug into, not the binding itself.
- ❌ Score-follow / notation-from-audio transcription beyond what Phase 3.5's AMT already does.
- ❌ Speed Trainer / built-in tuner (**Phase 8**).

---

## 5.11 Done is done

Phase 5 is complete when every DoD box in §5.2 is checked. Then:

1. Cut `v0.5.0-audio`.
2. Update `docs/phases/README.md` to mark Phase 5 done and the next phase active.
3. Move to **Phase 7 — Instruments & Tone** (Track D) per the recommended order
   (`3.5 → 4 → 5 → 7 → 6 → …`): the captured audio and the score both want real sound next, and Phase 7's
   Rubber Band tempo-without-pitch shares B6's engine.
