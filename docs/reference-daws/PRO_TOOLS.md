# Teardown — Pro Tools (Avid)

> **Why this teardown.** Pro Tools is the reference for the *audio-DAW half* of the North Star:
> recording, non-destructive editing, comping, mixing, routing, automation. It is also the reference
> most in tension with our non-goals — Pro Tools is built for **mixing and audio post**, and North
> Star §5.1/§5.4 says we are **not** a live/post house and **not** an engraving house. So this is the
> most aggressively filtered teardown: we adopt the **composer-facing** subset and **skip** the
> studio-engineer subset.

---

## 1. What Pro Tools is

The professional standard for audio recording, editing, and mixing. Non-destructive clip-based
editing, **playlists + comping** (swipe comping), **clip gain**, **Elastic Audio** (warp
markers for time/pitch), crossfades, a deep mixer (buses, aux tracks, sends, 10 inserts/track,
**VCA** masters, folders/submixes), full **automation lanes**, **markers/memory locations**, track
**freeze/commit**, **I/O setup**, and **ARA 2** integration (Melodyne et al.) for note-level pitch
editing.

---

## 2. Feature inventory → verdict

### 2.1 Audio editing (composer-facing → mostly ADOPT/ADAPT)

| Feature | What it does | Stockhausen today | Verdict | Tech path |
|---|---|---|---|---|
| Non-destructive clip editing | trim/split/move audio without altering source | ✗ | **ADOPT** | wavesurfer.js regions; clips reference takes (Track B). |
| **Playlists + comping** (swipe comp) | many takes per track; assemble the best | MIDI takes only (raw) | **ADAPT** | Composition-relevant: capture several guitar passes, comp the keeper. Track B. |
| **Clip gain** | per-clip level, breakpoints | ✗ | **ADOPT** | Per-clip gain envelope. Track B/C. |
| **Elastic Audio / warp markers** | time/pitch-stretch audio to grid | Rubber Band scaffold (no UI) | **ADOPT** | Finish Rubber Band FFI + warp-marker UI. Track B/D. |
| Fades / crossfades | smooth clip edges | ✗ | **ADOPT** | wavesurfer envelope + Web Audio gain ramps. |
| **Markers / memory locations** | named song positions; recall | ✗ | **ADOPT** | Cheap, huge ergonomics win (rehearsal letters, form markers). Ties to `theory.analyze_form`. |
| Beat Detective / tempo map | detect transients → tempo | ✗ | **ADAPT** | Onset detection we already need for Pillar 3; reuse for tempo mapping. |
| Loop/punch recording | re-record a region in a loop | ✗ | **ADAPT** | Phase 2 with audio recording. |

### 2.2 Mixing & routing (studio-engineer-facing → selective)

| Feature | Stockhausen today | Verdict | Notes |
|---|---|---|---|
| Per-track volume/pan/mute/solo | **shipped** (Mixer v1) | keep | — |
| **Buses + aux tracks + sends** | ✗ | **ADAPT** | Adopt a *simplified* bus/send model (e.g., a reverb send, a string-section submix). Not the full Pro Tools routing matrix. Track C. |
| **Inserts (10/track) + plugin chain** | ✗ | **ADAPT** | Host **WAM 2.0 / Faust-compiled** effects (EQ, comp, reverb). Not AAX/VST hosting in-browser. VST3 stays the optional Phase-2 JUCE sidecar (North Star §7). Track C. |
| **Automation lanes** (volume/pan/any param, draw/record) | ✗ | **ADOPT** | Core to expressive playback. Store in the Stockhausen JSON sidecar. Track C. |
| **VCA masters / groups / folders** | ✗ | **ADAPT (groups only)** | "Group the strings" is composer-useful; full VCA topology is overkill. Track C. |
| **Track freeze / commit** | ✗ | **ADAPT** | Render a heavy instrument to audio to save CPU on the M2 Air. Genuinely useful given our hardware. Track C. |
| **I/O setup** (physical in/out routing) | CPAL device pick (basic) | **ADAPT (minimal)** | Pick interface + input channel for recording. Not a full I/O matrix. |
| Surround / Atmos / immersive | ✗ | **SKIP** | §5.1/§5.4 — audio-post territory. |

### 2.3 ARA 2 / Melodyne (pitch & time editing)

| Feature | Stockhausen today | Verdict | Notes |
|---|---|---|---|
| **ARA 2** deep DAW↔plugin integration | ✗ | **SKIP** | ARA is a native-plugin protocol; not a browser concept. We don't host ARA plugins. |
| **Melodyne DNA** — polyphonic note-level pitch editing of audio | ✗ | **SKIP** | No open/browser equivalent for polyphonic *audio* pitch editing exists (June 2026). |
| **Monophonic** pitch correction (a single vocal/guitar line) | ✗ | **ADAPT** | Feasible via CREPE/pYIN → note overlay → re-render. Optional, low priority. |

> **Our principled answer to "Melodyne-class editing":** we don't edit audio pitch in place. We
> **transcribe → edit symbolically (theory-correct) → re-render** (North Star §Pillar 1/11). That is
> the editable, explainable path and it sidesteps the proprietary DNA black box. The composer edits
> *notes*, not waveforms.

---

## 3. The hard scope line

Pro Tools is where "study a DAW" most threatens scope creep. The line:

- **ADOPT** the editing that helps *capture and shape a composition*: clip editing, comping a guitar
  pass, markers, clip gain, warp-to-grid, freeze (for our weak hardware).
- **ADAPT** a *simplified* mixer: a few buses/sends, grouped submixes, automation lanes, WAM/Faust
  effects.
- **SKIP** the audio-post stack: surround/Atmos, the full routing matrix, hardware-insert workflows,
  AAX/ARA plugin hosting, session-interchange (AAF/OMF), pro-delivery features. These serve a mixing
  engineer, not a composer (North Star §5).

If the maintainer ever wants Stockhausen to also *mix and deliver* finished audio, we re-open this
line. Until then, the audio layer exists to serve the *score*.

---

## 4. Net new work this teardown creates

- **Track B — Audio Workstation Layer** (recording, clip editing, comping/playlists, clip gain,
  warp, fades, markers).
- **Track C — Mixing & Signal Routing** (buses/sends, automation lanes, groups, freeze, WAM/Faust
  plugin hosting).
- A **Phase-1 data-model prep step**: extend `project.json#mixer` and the Stockhausen JSON sidecar
  now (automation lanes, sends, clip references) so we don't pay a migration tax later. See
  `REFINE_AND_ERADICATE.md`.

---

## Sources

- [Pro Tools routing explained (I/O, buses, aux, sends)](https://musiccitysf.com/accelerator-blog/pro-tools-routing-explained/) · [Understanding buses in Pro Tools](https://www.production-expert.com/home-page/understanding-buses-in-pro-tools)
- [Mixing in Pro Tools — Mix window guide (2026)](https://www.audeobox.com/learn/pro-tools/mixing-in-pro-tools/) · [Folders, submixes or VCAs](https://www.production-expert.com/production-expert-1/pro-tools-folders-submixes-or-vcas-which-should-you-use)
- [Pro Tools DAW mastery guide (2026)](https://mixingmonster.com/pro-tools/)
- [What is ARA? — Synchro Arts](https://www.synchroarts.com/posts/what-is-ara) · [Pro Tools ARA 2 / Melodyne](https://www.avid.com/resource-center/ara-melodyne) · [Melodyne in Pro Tools with ARA — Celemony](https://www.celemony.com/en/protools-ara)
