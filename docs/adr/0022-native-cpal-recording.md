# ADR-0022 — Native CPAL recording path: capture through Rust, browser as display

- **Status:** Accepted, June 30, 2026
- **Phase:** 5 — M5.0 (Capture loop, B1)
- **Supersedes:** nothing. Extends the Phase-0 CPAL meter (ADR-0005) into a recorder.

## Context

Phase 5's first testable unit is *recording a take*. Phase 0 already opens the default input device
through CPAL and computes an RMS/peak meter (`src-tauri/src/audio.rs`), but it never keeps the samples —
its own header reserved "real capture buffers feeding a Rust ringbuffer" as not-yet-built.

The load-bearing decision is **where the audio path lives**. Routing capture and monitoring through the
WebView (Web Audio / `getUserMedia`) would add 10–20 ms of latency and make recording feel laggy against
the transport (PHASE_5 §5.9, top risk). It would also put raw composer audio inside the browser layer,
against the local-first/privacy posture (CLAUDE.md). The capture loop must be **native**.

The tension in a native recorder is the real-time constraint: the CPAL callback runs on the OS audio
thread and must never block — no locks, no allocation, no disk I/O — or it drops samples (clicks). Disk
writes, by contrast, are slow and bursty. These two need to be **decoupled**.

## Decision

Add a native recorder (`src-tauri/src/recorder.rs`) alongside the meter, sharing the same CPAL
device-open idiom. The browser is **display only**: it starts/stops recording and renders level +
progress from an event; it never receives the audio samples.

### Real-time-safe capture, decoupled from disk

```text
CPAL callback (OS audio thread)         writer thread (stockhausen-audio-recorder)
  convert frame → f32                      pop_slice ← ringbuffer
  push_slice → ringbuffer  ───────────▶    write_f32 → streaming WAV in takes/
  (no locks / no alloc / no I/O)           emit "audio:record" { frames, peak }
```

- A lock-free [`ringbuf`](https://crates.io/crates/ringbuf) `HeapRb<f32>` (already a dependency) sits
  between the two. The callback only converts the incoming frame to `f32` (interleaved, capture channel
  order preserved) and `push_slice`s it — bounded, wait-free. Integer devices convert into a reusable
  scratch buffer so the steady state allocates nothing. A ring that cannot accept a sample counts it as a
  **drop** (`RecordSummary.dropped_samples`, expected 0); we never block the audio thread to avoid it.
- The writer thread drains the ring to disk and, on `stop`, drops the CPAL stream first (halting the
  callback) then flushes the tail before finalising — so no captured audio is lost at the edges.
- Ring depth is ~4 s of audio, ample headroom for a momentary disk hiccup.

### Takes are immutable float WAV in `takes/`

Each recording is written once to `<project>/takes/take-<uuid>.wav` as canonical 32-bit-float WAV
(`WAVE_FORMAT_IEEE_FLOAT`) via a small dependency-free streaming writer (`WavStreamWriter`): it lays down
a 44-byte header with placeholder sizes, appends frames as they arrive, and back-patches the RIFF/`data`
sizes on finalise (atomic-enough for a capture file; the take is fsync'd on close). No `hound` dependency
— the writer is ~40 lines and unit-tested for header correctness, sample round-trip, the empty-take case,
and multi-buffer writes. A take is never mutated afterwards; Phase-5 B2 clips only *reference* it by
`take_id` (ADR-0021), which is what makes non-destructive editing and comping safe.

### Tauri surface

`recorder.rs` exposes an `AudioRecorder` managed state and three commands (registered in `lib.rs`):

| Command | Purpose |
|---|---|
| `start_recording { project_path }` | open device, start capture into `takes/`, return `{ take_id, path, device, sample_rate, channels }` |
| `stop_recording` | stop + finalise, return `RecordSummary { frames, duration_secs, dropped_samples, … }` |
| `recording_status` | `{ running, take_id }` |

The frontend hook `src/lib/useAudioRecorder.ts` mirrors `useAudioMeter`: `start(projectPath)` / `stop()`
plus live `frames`/`peak` from the `audio:record` event. Only one recording runs at a time (`start`
errors if already recording).

## Consequences

- Recording and monitoring latency stay native; the browser can never add audio-path latency because it
  is not on the audio path.
- Composer audio never enters the browser layer — it goes device → ring → disk, all in Rust (privacy).
- Takes are self-contained in the project's `takes/` (PHASE_5 Q3), immutable, and addressable by
  `take_id` for the B2 clip model.
- The WAV writer is intentionally minimal; if broader format support is later needed (e.g. reading
  arbitrary imports), revisit adding `hound`/`symphonia` then — not now.
- **In scope here:** the capture core + WAV take + Tauri/hook surface + **count-in and punch in/out**
  (a windowed write over the captured stream: `RecordOptions { count_in_secs, punch_in_secs,
  punch_out_secs }` → `sample_window` → `window_slice`; count-in is wired from the transport's
  count-in bars via `countInSeconds`). **Sample-accurate playback** of takes now schedules against the
  transport: the pure `audio/clipPlayback.ts::scheduleClips` computes each clip's
  start/offset/duration/gain/fades, `Player` wires buffer sources → gain (fade envelope) → mixer master,
  and `ScoreEngine` decodes each take WAV from `takes/` once (keyed by id, pruned when unreferenced).
  **Deferred within B1/M5.0:** loop-record (take per pass) and MIDI-take promotion (`useMidiRecorder`).
- Tests: `recorder.rs` unit-tests the WAV writer (`wav_writer_round_trips_header_and_samples`,
  `wav_writer_empty_take_is_a_valid_zero_length_file`, `wav_writer_handles_writes_larger_than_its_buffer`)
  and the capture window (`window_slice_covers_the_edge_cases`, `sample_window_applies_count_in_and_punch`);
  the frontend unit-tests `countInSeconds` and the clip scheduler (`clipPlayback.test.ts`). The live CPAL
  and Web-Audio paths need a device / AudioContext, so they are verified manually, not in CI.

## Key files

| Area | Path |
|------|------|
| Recorder (ring → WAV, RT-safe) | `apps/desktop/src-tauri/src/recorder.rs` |
| CPAL device-open idiom (shared) | `apps/desktop/src-tauri/src/audio.rs` |
| Commands + managed state | `apps/desktop/src-tauri/src/commands.rs`, `src/lib.rs` |
| Frontend hook | `apps/desktop/src/lib/useAudioRecorder.ts` |
| Take reference (clip) | `persistence::AudioClip.take_id` (ADR-0021) |
