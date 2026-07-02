# ADR-0024 — wavesurfer as a display-only waveform UI

- **Status:** Accepted, June 30, 2026
- **Phase:** 5 — M5.1 (B3, waveform editing UI)
- **Supersedes:** nothing. Sits over the take files written by the recorder (ADR-0022).

## Context

Phase 5 B3 needs to *see* a take — a waveform per clip, timeline, fades. The canonical audio, however,
is already fixed: the immutable float-WAV takes in `takes/` (ADR-0022), referenced by clips (ADR-0021).
The waveform UI must not become a second source of truth for the audio, and it must not blow up RAM on
the target hardware (M2 Air, 8 GB) by decoding whole files (PHASE_5 §5.9).

## Decision

Use **`wavesurfer.js` v7** (BSD-3) as a **display-only** view over the take files. The rule:
**wavesurfer never owns the audio** — it renders a picture of a file that lives on disk. Playback stays
on the native/Web-Audio path (ADR-0022, `clipPlayback`), not wavesurfer.

`src/audio/WaveformView.tsx` is a small React component: given a take path it reads the bytes through the
`@tauri-apps/plugin-fs` (already permitted — no asset-protocol config), hands them to wavesurfer as a Blob
URL, and renders a non-interactive waveform (`interact: false`, no cursor). It destroys the instance and
revokes the object URL on unmount. It is mounted from the takes list (`BottomRail`): clicking a clip
toggles its waveform.

### RAM posture

A Blob load makes wavesurfer decode the whole file into an AudioBuffer — acceptable for the short takes
M5.0 produces, but not for long ones. The DoD's **pre-decoded peaks streamed from disk** (compute peaks
once — in Rust, alongside the recorder — and pass them via wavesurfer's `peaks` option with the take's
duration, skipping the in-browser decode) is the follow-up optimisation. It is called out here so the
current Blob path is not mistaken for the final large-file story.

### What does *not* change

- The take files are canonical; wavesurfer is a view. Deleting/regenerating a take changes what the view
  shows, never the reverse.
- Clip edits (trim/split/move/gain/fades) remain `Operation`s over `project.json` (ADR-0021), not
  wavesurfer state. The envelope/fades UI (B3) will drive those operations, with wavesurfer only drawing.

## Consequences

- One source of truth for audio (the files); the UI is disposable and re-derivable.
- No asset-protocol/security-scope change was needed — the fs plugin already reads the project folder.
- Large-file RAM is bounded only after the peaks-streaming follow-up; short takes are fine today.
- The component can't be unit-tested (no DOM/AudioContext in CI); it is verified manually, like the live
  CPAL and Web-Audio paths (ADR-0022). Its host wiring stays behind typecheck/lint/build.

## Key files

| Area | Path |
|------|------|
| Waveform view (display-only) | `apps/desktop/src/audio/WaveformView.tsx` |
| Host (takes list → waveform) | `apps/desktop/src/shell/BottomRail.tsx` |
| Canonical take files | `<project>/takes/*.wav` (ADR-0022) |
| Clip model the UI draws | `persistence::AudioClip` (ADR-0021) |
