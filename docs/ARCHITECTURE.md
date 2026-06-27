# Architecture

> **Companion to [`../NORTH_STAR.md`](../NORTH_STAR.md) §6.** This doc goes deeper on the *how*.

## Topology

Stockhausen is a **desktop application** (Tauri 2 + Rust + React) that talks to a **cloud backend** for non-realtime AI workloads. The realtime path (live audio capture, live MIDI, live notation rendering, playback) is **fully local** and never crosses the network.

```
┌──── Stockhausen Desktop App ───────────────────────────────────────────┐
│                                                                     │
│   React UI (TypeScript)                                             │
│    ├─ Notation Editor (OSMD + VexFlow + custom edit layer)         │
│    ├─ DAW timeline / mixer                                          │
│    ├─ Agent UI (chat + voice)                                       │
│    └─ Project Explorer + History + Diff                             │
│                  │                                                  │
│                  │ Tauri IPC                                        │
│                  ▼                                                  │
│   Rust Core                                                         │
│    ├─ Audio I/O (CPAL: CoreAudio/WASAPI/ASIO/ALSA)                  │
│    ├─ MIDI I/O (midir)                                              │
│    ├─ Project Store (SQLite)                                        │
│    ├─ Auto-save, crash recovery                                     │
│    ├─ ONNX Runtime (on-device inference: pitch detection, basic AI) │
│    ├─ VST3 Host Bridge (optional, JUCE)                             │
│    └─ Cloud client (HTTPS + WSS)                                    │
│                  │                                                  │
│                  │ AudioWorklet messaging                            │
│                  ▼                                                  │
│   Web Audio Worklets                                                │
│    ├─ Pitch / onset detection                                       │
│    ├─ Sampler (sfizz.wasm / fluidsynth.wasm)                        │
│    ├─ FX (compressor, EQ, reverb)                                   │
│    └─ Custom DSP                                                    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                       │
                       │  HTTPS (REST) / WSS (events) / WebRTC (voice)
                       ▼
┌──── Cloud Backend ────────────────────────────────────────────────┐
│                                                                     │
│   Edge (Cloudflare Workers)                                         │
│    ├─ Auth (Clerk / WorkOS)                                         │
│    ├─ Rate limiting, quotas                                         │
│    └─ Static asset CDN (sample libs, model weights)                 │
│                                                                     │
│   Agent Orchestrator (FastAPI on Fly.io)                            │
│    ├─ /chat — LLM gateway (Claude, GPT)                             │
│    ├─ /tools/* — MCP-style music tools                              │
│    ├─ /memory — pgvector-backed long memory                         │
│    └─ /operations — OperationLog event sourcing                     │
│                                                                     │
│   Inference (Modal serverless GPU)                                  │
│    ├─ symbolic-gen        (Moonbeam, AMT, MIDI-DDSP)                │
│    ├─ transcribe          (YourMT3+, Basic Pitch fallback)          │
│    ├─ stem-separate       (Demucs v4)                               │
│    ├─ style-adapt         (Composer-Vector LoRAs)                   │
│    └─ expressive-render   (MIDI-DDSP)                               │
│                                                                     │
│   Voice (OpenAI Realtime API)                                       │
│    ├─ WebRTC → ASR → LLM → TTS chain                                │
│    └─ Tool calling into Agent Orchestrator                          │
│                                                                     │
│   Data                                                              │
│    ├─ Postgres (Neon) — projects, users, OperationLog               │
│    ├─ pgvector — agent memory, similarity search                    │
│    ├─ Cloudflare R2 — audio renders, samples, model artifacts       │
│    ├─ Upstash Redis — sessions, hot caches                          │
│    └─ Yjs sync (Phase 3) — collaborative editing                    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Model — canonical representation

The single source of truth for a piece is the **Project** record:

```
Project {
  id: UUID
  meta: { title, composer, created_at, updated_at, ... }
  score: MusicXMLDocument          // canonical notation
  arrangement: StockhausenArrangement   // tracks, mixer, automation
  takes: AudioTake[]                // user-recorded audio
  midi_takes: MidiTake[]            // user-recorded MIDI
  agent_state: AgentState           // memory pointers, recent ops
  operations: OperationLog[]        // every change ever
}
```

- **MusicXML 4.0** as the interchange-grade representation of notation. Re-emitted bit-for-bit on export.
- **Stockhausen JSON sidecar** for everything MusicXML can't represent: mixer state, automation curves, multi-take captures, agent annotations, version pointers, motivic graph annotations.
- **OperationLog** is event-sourced. Every change is an event with an inverse. This is how undo, redo, agent-action review, and (eventually) collaboration work.

### Notation edit pipeline (Phase 1 — ADR-0015)

OSMD renders MusicXML to SVG for display. **Edits do not mutate the SVG or OSMD's internal tree.** Flow:

```
Pointer on staff (EditLayer)
  → hit-test (osmdHitTest / osmdAnnotate)
  → resolve coordinates (noteResolve + POST /score/edit/note/resolve)
  → POST /score/edit/* (music21 mutates MusicXML)
  → ScoreEngine.applyEditOp commits new musicxml string
  → ScoreView: osmd.clear() → load(xml) → render()
```

Playback note extraction (`POST /score/notes`) runs in the background and must not roll back a successful edit.


This is the hardest constraint in the system. We budget **≤ 17 ms** from string-pluck to a new note appearing on the staff.

```
[Guitar]
   │ ~1 ms
   ▼
[Audio interface]
   │ ~2 ms (128-sample buffer @ 48 kHz)
   ▼
[CPAL input thread (Rust, RT priority)]
   │ ~1 ms IPC to AudioWorklet
   ▼
[Pitch/Onset Worklet (Web Audio)]
   │ ~5 ms
   │   - Sliding 256-sample hops
   │   - Onset detection (energy + spectral flux)
   │   - pYIN / harmonic-template polyphonic pitch
   ▼
[MIDI event emitter]
   │ ~1 ms
   ▼
[Notation incremental renderer (OSMD diff)]
   │ ~7 ms (SVG patch)   ← Phase 2 live capture; Phase 1 imported edits use full reload per ADR-0015
   ▼
[Visible on screen]
```

When the user wants the *cleanest* notation (not raw performance), we keep both:
- **Performance track** — humanized, exactly as played (microtiming, velocity).
- **Notation track** — quantized, snapped to the grid, voice-led-checked. Generated lazily, ~50 ms after performance pauses.

## Theory Engine — the safety net for AI

Every AI-proposed musical change goes through this gate:

```
LLM Proposal
   ↓
ToolCall (e.g. score.modulate { target_key: "Gb", method: "common-tone" })
   ↓
Theory Engine (music21 + partitura + custom rules)
   ↓
Validation:
   - Voice-leading legal?
   - Instruments in range?
   - Enharmonic spelling correct?
   - Stockhausen-style "smell tests" (e.g., no fifth doublings in late-Romantic style)
   ↓
   ├─ Pass → apply, emit OperationLog entry
   └─ Fail → return errors to LLM; LLM re-plans (or asks user)
```

This is the most important architectural decision in the entire project. The LLM never writes notes directly; it writes *intentions* that the theory engine *realizes* or *rejects*.

## Agent Loop

```
User says/types: "modulate to relative major around bar 32, voiced like Brahms"
   ↓
Realtime/text input → Agent Orchestrator
   ↓
Planner LLM (Claude Opus): decomposes into ToolCalls:
   1. theory.identify_key(bars: [30, 35])
   2. theory.choose_modulation_target(current_key: "f#m", style: "brahms")
   3. score.modulate(target: "A", method: "common-tone", at_bar: 32)
   4. style.apply_composer_vector(composer: "brahms", region: "32:36", intensity: 0.4)
   ↓
Each ToolCall → Theory Engine → validate → apply or reject
   ↓
Apply → OperationLog entry → diff to UI → user sees + hears the change
   ↓
User: "perfect" (or undo, or refine)
```

## Build / Deploy

- **Desktop:** GitHub Actions builds signed releases for macOS (universal), Windows (x64 + ARM64), Linux (x64, AppImage + .deb).
- **Auto-update:** Tauri's updater + Sentry release tracking.
- **Backend:** Fly.io for the orchestrator (low-cold-start, close to user). Modal for inference (serverless GPU).
- **Migrations:** standard Postgres with `sqlx-cli` or `prisma migrate`.

## Observability

- **Sentry** for crashes (desktop + backend).
- **PostHog** for product analytics + session replay.
- **LangSmith** for LLM trace + eval.
- **Grafana Cloud** or **Datadog** for backend metrics.
- **Custom evals** for musical correctness (run nightly on Modal).

## Security & Privacy

- Project files are local-first; cloud sync is opt-in.
- Recordings stay on-device unless user opts to back up or run cloud inference.
- Voice agent audio is streamed to OpenAI per their Realtime API contract; we don't retain it server-side.
- Agent memory is per-user, encrypted at rest.
- LLM prompts are logged for eval, with PII scrubbed.

## Open Architecture Questions

See [`adr/`](./adr/) for active Architecture Decision Records. Big ones still open:

- **ADR-001:** Web Audio Worklets vs. native Rust audio graph in production (likely hybrid).
- **ADR-002:** Whether to ship a VST3 host bridge in v1.0 (impacts JUCE licensing).
- **ADR-003:** Real-time collaboration timing (Phase 3 vs. Phase 4).
- **ADR-004:** On-device LLM fallback (yes for theory tools; no for generation).
