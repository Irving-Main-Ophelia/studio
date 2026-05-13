# STOCKHAUSEN — North Star Document

> **Project name:** *Stockhausen* — in homage to **Karlheinz Stockhausen** (1928–2007), the towering figure of post-war electronic and electroacoustic composition. The name honors a lineage of composers who insisted that electronics belong in the concert hall.
> **Version:** 0.2 — May 13, 2026
> **Status:** Foundational. This document is the *source of truth* for the project's intent. Everything we build is judged against it.
> **Language:** All code, documentation, commit messages, and product surfaces are in English. Conversations with the maintainer may happen in other languages.

---

## 0. TL;DR

Stockhausen is **a desktop-first, AI-native composition environment** for classical music and song-writing that fuses three worlds:

1. **A DAW** (the engineering rigor of Pro Tools / Logic / Dorico for scoring + audio).
2. **A notation editor** (Sibelius / Dorico / MuseScore-class).
3. **A conversational, agentic co-composer** ("Jarvis for music"): a voice + chat agent with deep music-theory tool-use that can write, edit, transpose, re-orchestrate, and stylize music against a curated set of reference composers.

The product wins when a composer can sit with a guitar (or any instrument), speak to the agent, and within minutes have a *playable, editable, exportable score* that sounds the way they want — including style transfers like "give this a Rachmaninoff touch."

We will **integrate, license, or copy** when the market already has a great solution, and **build in-house** when (a) no good solution exists, (b) integration is too expensive at scale, or (c) the differentiated user experience demands it.

We will **never accept "it can't be done"** as an answer. Where research is incomplete, we ship a *good-enough* baseline today and put the better solution on the roadmap.

---

## 1. Vision Statement

> *Stockhausen is the place where a composer thinks out loud, plays an instrument, points at a phrase, and the music takes shape — with the theoretical rigor of a conservatory professor and the production polish of a studio engineer.*

We measure success by **time-from-idea-to-playable-score** and by **how often a serious composer reaches for Stockhausen instead of paper + Dorico + Logic.**

---

## 2. Principles (How we make decisions)

1. **Composer-first, agent-assisted.** The human is always the author. The agent proposes; the human disposes. Every AI action is undoable, diffable, and explained in music-theoretic language.
2. **Theory rigor over generation novelty.** A modulation must be voice-leading-correct *before* it is "creative". When the agent moves a key, transposes a part, or re-harmonizes, it must justify the choice in theory terms (Roman numerals, voice-leading, register, idiomatic instrument range).
3. **Native latency, web-grade UX.** Real-time audio I/O must be ≤10 ms round-trip end-to-end. UI is React-class. We get there via a Tauri + Rust + Web Audio Worklet hybrid.
4. **Two formats, one truth.** Internal canonical representation is **MusicXML 4.0 + a Stockhausen JSON extension** for arrangement/mixing/agent annotations. We import/export MIDI, MusicXML, MEI, MP3/WAV, PDF.
5. **Build vs. Buy is a *constant* discipline.** Every quarter we re-evaluate. If a vendor ships something better than ours, we adopt it.
6. **Determinism + Auditability of agent actions.** Every agent edit produces a structured `OperationLog` entry: "Transposed bars 17-32 from E-major to G♭-major via direct enharmonic mapping; checked instrument ranges; flagged viola low E♭ below open C string."
7. **Offline-capable.** Core composing, recording, playback work without internet. Agent + heavy AI features degrade gracefully to local models when offline.
8. **No defeatism.** If a problem looks too hard, we decompose it, ship a 60%-solution, and keep iterating.

---

## 3. The Seven Pillars (the user's original requirements, expanded)

These map 1-to-1 to your seven points. Each has: **What**, **How (today's tech)**, **Phase**, **Build vs. Buy**.

### Pillar 1 — Composer Style Touch ("give it a Rachmaninoff touch")

**What:** Apply a stylistic vector — a curated composer or artist — to an existing piece (or a selected region). Output is *the same piece*, but with harmonic, melodic, rhythmic, voicing, and ornamentation patterns nudged toward the reference style. Intensity is a slider (0%–100%) and is per-feature (harmony only, ornamentation only, register only, etc.).

**How:**
- **Symbolic side (MIDI/MusicXML):** Fine-tuned style adapters on top of a foundation symbolic model. The 2026 SOTA approaches that match what we need:
  - **Anticipatory Music Transformer** (Stanford / Thickstun et al.) — perfect for *infilling* and *accompaniment-style* edits without overwriting the user's melody.
  - **Moonbeam** (May 2025) — MIDI foundation model with multidimensional relative attention, trained on 81.6k hours. Great as base.
  - **Composer Vector** (2026) — inference-time steering in latent space; lets us blend composers ("70% Rachmaninoff + 30% Debussy") without retraining.
  - **"Generality to Mastery" two-stage pipeline** (2025) — lightweight adapters per composer; data-efficient if our reference set is small.
- **Audio side (when the user has audio, not symbolic):** Transcribe → edit symbolically → re-render. We do **not** do audio-only style transfer (it's lossy and breaks editability).

**Build vs. Buy:** Build. No vendor ships per-composer style adapters. We license open weights (Moonbeam, AMT, MIDI-DDSP), fine-tune on our curated corpus, and host on Modal.

**Phase:** v0.7 (Pillar 1 is the most differentiated; we start a "Composer Lab" experiment in Phase 1).

**Open question for you:** Your reference roster — please share. We need that list to plan dataset acquisition. (See §13 Open Questions.)

---

### Pillar 2 — Key/Tonality Transposition of a Full Track

**What:** Move an entire piece (or arbitrary regions, or arbitrary tracks within a piece) up/down by any interval, with both **symbolic** (notation/MIDI) and **audio** (waveform) targets staying in sync. Idiomatic intelligence: warn when transposition pushes a part out of an instrument's range, suggest octave displacement, re-spell enharmonics correctly (E major → G♭ major chooses flats not sharps).

**How:**
- **Symbolic transposition:** Trivial with `music21` + `partitura`. Add a Stockhausen layer for enharmonic spelling rules, instrument-range checks, and Roman-numeral preservation.
- **Audio transposition:** **Rubber Band Library** (commercial license available, best quality), **zplane élastique** (broadcast-grade, paid SDK), or **SoundTouchJS** for browser-side preview. We integrate Rubber Band natively (via Rust FFI) for offline-quality renders, élastique if we license it, and SoundTouchJS for instant in-browser preview.
- **Hybrid:** When the project is fully symbolic, transposition is *instant and lossless* — we re-render audio from samplers. When the project has user-recorded audio, we time/pitch-stretch.

**Build vs. Buy:** Buy/integrate (Rubber Band or élastique). Build the music-theoretic layer (enharmonics, range checks).

**Phase:** v0.3 (early — this is high-value and technically tractable).

---

### Pillar 3 — Live Guitar → Score (real-time tablature & staff)

**What:** As the composer plays guitar, the notation builds in real-time: notes, chords, rhythm, time signature, tempo (with reasonable defaults that the user can correct).

**How — three tiers, shipped in order:**

| Tier | Approach | Latency | Cost | When |
|---|---|---|---|---|
| **T1 — Integrate** | Embed **Jam Origin MIDI Guitar 3** or **MiGiC NX** as a hosted plugin. Both work with a normal guitar + audio interface, no hex pickup needed. Output is MIDI → into our notation engine. | ~10–20 ms | $40–50 user license | Phase 1 |
| **T2 — Build our own** | Custom pipeline: high-rate audio worklet → onset detection (energy + spectral flux) → polyphonic pitch detection (pYIN + harmonic templates + a small ONNX model fine-tuned on guitar tones) → MIDI events → music-theoretic quantization (rhythm grid inference). The 2026 SOTA reference here is the open-source `contrapunk` pipeline: 256-sample hops (5.3 ms), onset-ahead-of-pitch triggering, Goertzel harmonics 2-6, adaptive thresholds. | <10 ms goal | engineering time only | Phase 2 |
| **T3 — Hardware-assisted (optional)** | Support **Fishman TriplePlay** hex-pickup hardware for users who want sub-5 ms latency and per-string MIDI. | <5 ms | $400 hardware (user's) | Phase 3 |

**Critical decision:** Quantization is hard. We will *not* over-quantize live input; we keep both the "humanized" performance MIDI and a "cleaned" notation track, and the user toggles which one they want to see/edit.

**Build vs. Buy:** Buy (T1) → Build (T2). T1 ships in 8 weeks; T2 is a research roadmap.

**Phase:** T1 → v0.4. T2 → v0.9. T3 → v1.0+.

---

### Pillar 4 — Conceptual Composition → First Draft → Guitar-Edit Loop

**What:** Composer describes a piece in natural language ("a 4-minute string quartet in F♯ minor, sonata-allegro form, primary theme 8 bars, lyrical, late-Romantic, motivic kernel = descending augmented second"). The agent produces a first draft score. The composer then refines it by:
- (a) Typing/clicking edits on the score directly.
- (b) **Speaking** to the agent ("modulate to the relative major at bar 32, voiced like Brahms").
- (c) **Playing guitar** to splice in/replace passages ("replace bars 41–48 with what I'm about to play").

**How:**
- **Generation:** Multi-agent LLM (Claude Opus 4.7 + GPT-5.5 fallback) that decomposes the prompt into form → key plan → motivic plan → harmonic plan → texture plan, then calls a **symbolic music generator** (Anticipatory Music Transformer + Moonbeam) with these constraints. The agent writes `music21` scripts as an intermediate step — the same pattern as the open-source `mcp-score` project (Claude + MuseScore/Dorico/Sibelius via MCP tools).
- **Editing:**
  - Click/keystroke edits → standard notation editor.
  - Voice edits — **deferred** to a later phase; not part of Phase 1 or Phase 2.
  - Guitar edits → Pillar-3 pipeline producing a temporary MIDI buffer; user gestures (long-press, lasso) select the destination bars; agent merges & adjusts.

**Build vs. Buy:** Build the orchestrator. Buy LLM APIs. Open-source the symbolic generators.

**Phase:** v0.5 (first draft) → v0.9 (guitar splice). Voice edits postponed.

---

### Pillar 5 — Score Playback (Songsterr / Guitar Pro–class)

**What:** Press play, hear the score. Scrub, loop a region, start from any beat, change tempo (without pitch), solo/mute parts, click track, count-in.

**How:**
- **Transport:** `Tone.js` for sequencing + global transport. Web Audio API for the audio graph.
- **Sampling:**
  - **Free tier:** **VSCO 2 Community Edition**, **Sonatina Symphonic Orchestra**, **Versilian Community Sample Library** — all CC0 / royalty-free, ~10 GB total, covers full orchestra + many world instruments. Played via **sfizz** (SFZ player, Rust/C++ bindings) or **fluidsynth** (SF2).
  - **Premium tier (optional):** Host VST3 instruments via JUCE-based plugin bridge for users who own Spitfire, Kontakt, etc.
- **Real-time engine:** Audio Worklets for the synthesis path; Tone.js Transport for clock.
- **UI:** Bar-level scrub, beat-level loop points, MIDI-velocity-aware playback, "play from cursor", "play measure", "loop measure N to M with metronome".

**Build vs. Buy:** Buy/integrate (Tone.js, sfizz, fluidsynth, sample libraries). Build the orchestrator and UI.

**Phase:** v0.2 (skeleton) → v0.4 (full feature parity with Songsterr).

---

### Pillar 6 — Orchestration Change (guitar → strings → orchestra → radif → …)

**What:** A piece written for guitar becomes the same piece for a string quartet, or for a full orchestra, or for a Persian *radif* ensemble (tar, setar, santur, kamancheh, ney), with the agent making *idiomatic* decisions: range, divisi, doubling, transpositions for transposing instruments, percussion realization for non-Western contexts.

**How:**
- **Step 1 — Re-voicing (symbolic):** Agent reads the source piece and an *Orchestration Profile* ("Classical Romantic Orchestra: 2/2/2/2 winds, 4/2/3/1 brass, strings 14/12/10/8/6, percussion: timpani + occasional"). It generates a new arrangement using:
  - LLM-driven planning (instrument selection, doubling, register decisions).
  - `music21` operations (transposition, voice-splitting, range checks).
  - Genre-aware idiom libraries (Western Romantic, Hard Rock, Persian Radif, Jazz Big Band, etc.).
- **Step 2 — Timbre (audio):** Render via the appropriate sample library. For non-Western timbres we ship curated Persian/Indian/East-Asian sample packs licensed for redistribution (or routed through external libraries the user owns).
- **Step 3 — Refinement:** **MIDI-DDSP** (or its 2026 successors) for expressive per-note articulation; for advanced users, DDSP-VST for neural timbre morph.

**Build vs. Buy:**
- **Buy/integrate** the rendering side (samples, players, MIDI-DDSP).
- **Build** the orchestration agent and the genre idiom libraries. Each idiom library is a curated YAML/JSON of rules + examples that the agent consults.

**Phase:** v0.6 (Western orchestral) → v0.8 (jazz, rock, radif, world).

**Phase-2 world-music idiom packs.** We ship four non-Western idiom libraries in Phase 2, each with: sampled instruments + a modal/tuning system + idiomatic rules consulted by the orchestration agent. The four are:

- **Persian Radif** — tar, setar, santur, ney, kamancheh. Dastgāh modal system (it doesn't map cleanly to Western diatonic — this is exactly the kind of detail that distinguishes a serious tool from a toy).
- **Arabic Maqam** — oud, qanun, ney, riq, darbuka. Maqam modal system with quarter-tones; idiomatic seyir (melodic-development) patterns.
- **Hindustani (North Indian)** — sitar, sarod, tabla, bansuri, tanpura. Rāga system (parent thāts, characteristic phrases, vādī/samvādī), tāla (rhythmic cycles).
- **Chinese classical** — guzheng, erhu, pipa, dizi, yangqin. Pentatonic-anchored modal patterns; ornamentation (vibrato/glissando) idioms native to each instrument.

---

### Pillar 7 — The Co-Composer Agent

**What:** A persistent, conversational agent that knows the project, knows music theory at the level of a graduate composition professor, and is precise. It is the *interface* through which everything else is invoked.

**How:**
- **LLM core:** Claude Opus 4.7 (primary) + GPT-5.5 (fallback / speed-critical paths). Both via API. **Why Claude:** the `mcp-score` open-source project demonstrates Claude is currently the strongest LLM for music theory tool-use and `music21` code generation.
- **Voice:** *Deferred.* Phase 1 and Phase 2 are **text-only**. We add OpenAI Realtime API (`gpt-realtime-2`) over WebRTC only when the writing UX is polished. Voice is *additive*, not foundational.
- **Tools (function-calling surface):** A curated set of ~40 tools exposed via MCP (Model Context Protocol):
  - `score.transpose`, `score.modulate`, `score.reharmonize`, `score.voice_lead_check`
  - `score.add_section`, `score.replace_bars`, `score.merge_midi`
  - `score.transcribe_audio`, `score.export`, `score.import`
  - `orchestration.change_instrument`, `orchestration.add_part`, `orchestration.set_profile`
  - `style.apply_composer_vector`, `style.list_composers`, `style.blend`
  - `theory.analyze_roman_numerals`, `theory.analyze_form`, `theory.identify_motifs`
  - `playback.play_region`, `playback.loop`, `playback.set_tempo`
  - `record.start_guitar_capture`, `record.merge_capture`
  - `project.snapshot`, `project.revert`, `project.diff`
- **Memory:** Per-project long-term memory (composer's preferences, recurring motifs, voice samples, idiomatic habits). Stored in Postgres + vector index.
- **Theoretical rigor:** Every musical operation is mediated through `music21` + `partitura` + our custom theory engine. The LLM does *not* invent notes directly; it calls tools that produce verifiable, theory-compliant edits.
- **Multi-agent (optional, advanced):** A planner agent, a harmony agent, a counterpoint agent, an orchestration agent — coordinated by the orchestrator. The 2024 *ComposerX* paper shows this approach materially improves musical quality.

**Build vs. Buy:** Buy LLM APIs. Build everything else (tool surface, MCP server, theory engine, multi-agent orchestration).

**Phase:** v0.5 (chat agent + 10 tools) → v0.7 (chat agent + 30 tools) → v1.0 (multi-agent + 40+ tools + memory). Voice is a later, additive milestone.

---

## 4. Suggested Additional Pillars (my proactive additions)

These are not in your original list but I strongly recommend including them as *Stockhausen* differentiators. Each is shippable and high-impact.

### Pillar 8 — Theory Tutor / Explainer

When you point at any moment in the score, the agent explains *why* it works: Roman numerals, voice-leading, motivic relationships, formal function. This turns the tool into a *teacher*. It also dogfoods the theory engine — if it can teach, it can compose.

### Pillar 9 — Visual & Geometric Music Tools

Beyond standard notation: piano-roll, **harmonic-progression graphs** (key-distance maps), **motivic family trees** (which themes derive from which), **form diagrams** (sonata-allegro, fugue exposition, rondo). All read-write — drag a chord on the harmony graph and the score updates.

### Pillar 10 — Practice & Performance Coach

Plug in the guitar; play along with the score; Stockhausen evaluates pitch/rhythm accuracy, highlights misses, generates a difficulty heat-map, and proposes a practice plan. Same Pillar-3 pipeline + scoring.

### Pillar 11 — Stem Separation & Reverse-Engineering

Drop in an MP3 ("here's a piece I love"). Stockhausen separates stems (using `Demucs v4` or successor), transcribes each (YourMT3+), reverse-engineers a score, and lets you *learn from it* — annotate it, re-orchestrate it, study its harmony. Critical caveat: this is a *study* tool, not a "make money off others' copyrights" tool. We enforce that boundary in product (no public sharing/export of derived works without provenance).

### Pillar 12 — Performance Capture & Export

Beyond MIDI/MusicXML/PDF, we export:
- **Stems** for further mixing in Pro Tools / Logic.
- **Engraved PDFs** that look like Henle / Bärenreiter editions (via Verovio for engraving, since Verovio's engraving rules are scholarly-grade).
- **Practice tracks** (minus-one for each part).
- **Conductor's score + individual parts**.
- **Direct publish to Soundslice / Flat.io** via their public APIs.

### Pillar 13 — Multiplayer Collaboration (Phase 3)

Two composers, one score, simultaneously, with awareness cursors. Yjs CRDT under the hood (already proven in the *Strudel* live-coding world). For when the user is teaching, or co-writing.

### Pillar 14 — Mobile Companion App (Phase 3)

iOS / Android lightweight companion: voice memos, on-the-go transcription, score-viewing, basic edit, sync to desktop. **Not** a full DAW on mobile (that's a trap), just enough to capture ideas in the wild.

---

## 5. Non-Goals (what Stockhausen is *not*)

Clarity here is a feature.

1. **Stockhausen is not a live performance tool.** It is composition + studio. Looper/live-rig features are out of scope.
2. **Stockhausen is not a streaming-music generator.** We do not compete with Suno/Udio for "make me a 3-min song from a prompt". We *can* call those services for sketches, but our value is *editable, theory-correct* output.
3. **Stockhausen is not a sample-pack store.** We curate and integrate; we don't sell samples.
4. **Stockhausen is not a notation app for engraving publishers.** Dorico/Finale own that market. We export beautiful PDFs but we are *composing*-first.
5. **Stockhausen is not a mobile-first product (in Phase 1–2).** Mobile is companion-only.
6. **Stockhausen NEVER trains on the maintainer's compositions, recordings, or any user-generated content.** This is a hard, permanent rule. There is **no opt-in toggle**. There is **no exception**. The maintainer's music is theirs — Stockhausen reads it to help them, never to feed itself.

---

## 6. Technical Architecture

### 6.1 High-level architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                       CLIENT (Tauri 2 + Rust + React 19)                  │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │  UI Layer — React 19 + TypeScript + Vite + Tailwind + shadcn/ui  │    │
│  │   • DAW timeline & mixer                                          │    │
│  │   • Notation editor (OSMD + custom edit layer)                    │    │
│  │   • Agent chat & voice surface                                    │    │
│  │   • Harmony/form/motif visualizations                             │    │
│  │   • Project explorer, history, diff viewer                        │    │
│  └──────────────────────────────────────────────────────────────────┘    │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │  Audio Layer — Web Audio + AudioWorklets + Tone.js               │    │
│  │   • Transport / clock (Tone.js)                                   │    │
│  │   • Sampler nodes (sfizz/fluidsynth via WASM)                     │    │
│  │   • WAM 2.0 plugin hosting                                        │    │
│  │   • Custom DSP worklets (pitch detection, onset detection)        │    │
│  └──────────────────────────────────────────────────────────────────┘    │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │  Native (Rust)                                                   │    │
│  │   • CPAL (CoreAudio / WASAPI / ASIO / ALSA) for low-latency I/O   │    │
│  │   • MIDI (midir) for hardware MIDI in/out                         │    │
│  │   • SQLite (project metadata, agent memory)                       │    │
│  │   • Filesystem + auto-save + crash recovery                       │    │
│  │   • On-device inference (ort/ONNX Runtime, candle for Rust ML)    │    │
│  │   • VST3 host bridge (optional, via JUCE)                         │    │
│  │   • IPC to UI via Tauri commands                                  │    │
│  └──────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────┘
                                   │
                                   │ HTTPS / WSS / WebRTC
                                   ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                            CLOUD BACKEND                                   │
│                                                                            │
│  ┌────────────────────────────────────┐  ┌────────────────────────────┐  │
│  │  API Gateway (Cloudflare Workers)  │  │  Voice Edge (WebRTC SFU)   │  │
│  │   • Auth (Clerk / WorkOS)          │  │   • OpenAI Realtime relay  │  │
│  │   • Rate limit, quotas             │  │   • Audio capture → STT    │  │
│  └────────────────────────────────────┘  └────────────────────────────┘  │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │  Agent Orchestrator — FastAPI (Python) on Fly.io                 │    │
│  │   • LLM gateway (Anthropic, OpenAI)                               │    │
│  │   • MCP server: ~40 music tools                                   │    │
│  │   • music21 + partitura + symusic + custom theory engine          │    │
│  │   • Project memory (vectors in pgvector)                          │    │
│  │   • OperationLog event sourcing                                   │    │
│  └──────────────────────────────────────────────────────────────────┘    │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │  AI Inference — Modal (serverless GPU, scale-to-zero)             │    │
│  │   • Anticipatory Music Transformer (symbolic gen, infill)         │    │
│  │   • Moonbeam (MIDI foundation)                                    │    │
│  │   • YourMT3+ (audio → multi-track MIDI)                           │    │
│  │   • MIDI-DDSP (expressive rendering)                              │    │
│  │   • Custom composer-vector style adapters (LoRA)                  │    │
│  │   • Demucs v4 (stem separation)                                   │    │
│  │   • Basic Pitch fallback (single-instrument transcription)        │    │
│  └──────────────────────────────────────────────────────────────────┘    │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │  Data Plane                                                       │    │
│  │   • Postgres (Neon / Aiven) — projects, users, OperationLog        │    │
│  │   • S3 / Cloudflare R2 — audio renders, samples, model artifacts  │    │
│  │   • Upstash Redis — sessions, caches                              │    │
│  │   • Yjs sync server (y-websocket) — collaboration                  │    │
│  └──────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Canonical data model (sketch)

- **Project** = a tree of **Movements** → **Sections** → **Bars** → **Beats** → **Notes**.
- Stored as **MusicXML 4.0** for portability + a **Stockhausen JSON** sidecar for non-MusicXML concepts (agent annotations, mixing data, automation lanes, multi-take captures, version history pointers).
- **OperationLog**: every change is an event (`TransposeBars`, `ReharmonizeRegion`, `ApplyComposerVector`, `RecordGuitarTake`, …) with author (human or agent), timestamp, and inverse-operation for undo.

### 6.3 Format strategy

| Format | Role | Why |
|---|---|---|
| **MusicXML 4.0** | Canonical interchange | 250+ apps support it; W3C standard |
| **MEI 5.1** | Scholarly export | When users need critical-edition-grade output |
| **MIDI** | Performance I/O, sequencer compat | Universal |
| **WAV/MP3/FLAC** | Audio render, audio input | Standard |
| **Stockhausen JSON** | Internal extensions | Agent state, automation, takes |
| **PDF** | Score output (engraved via Verovio) | Performer-facing |
| **ABC** | Quick text-based capture | Power-user shortcut |

### 6.4 Latency budget (the hardest constraint)

Guitar-to-notation real-time means **end-to-end ≤ 20 ms** is acceptable; ≤ 10 ms is excellent. Budget:

| Stage | Budget |
|---|---|
| Audio input (interface → CPAL buffer) | 3 ms |
| Pitch/onset detection (AudioWorklet) | 5 ms |
| MIDI event emission (IPC to UI) | 1 ms |
| Notation incremental render (OSMD diff) | 8 ms |
| **Total visible** | **≤ 17 ms** |

We hit this by: (a) 128-sample buffers, (b) onset-ahead-of-pitch triggering, (c) incremental SVG diff rendering, (d) no round-trips to cloud in the live path.

---

## 7. Technology Stack (recommended, May 2026)

### Frontend
- **Tauri 2** — desktop shell (Rust + native WebView; 10–100x smaller than Electron; latest 2.x).
- **React 19** — UI.
- **Vite** — build.
- **TypeScript** strict.
- **Tailwind CSS + shadcn/ui** — design system.
- **Radix UI** — accessible primitives.
- **TanStack Query** — server state.
- **Zustand** or **Jotai** — client state.
- **Framer Motion** — UI motion.

### Notation & Score
- **OpenSheetMusicDisplay (OSMD) 1.9.7+** — primary renderer (built on VexFlow 5).
- **VexFlow 5** — direct use for custom widgets.
- **Verovio** — engraving-grade PDF export (and MEI handling).
- **abcjs** — quick ABC-notation entry surface (power users).

### Audio (browser-side)
- **Tone.js** — transport, scheduling, building blocks.
- **Web Audio API + AudioWorklets** — DSP.
- **Web Audio Modules (WAM) 2.0** — plug-in standard.
- **sfizz.js / fluidsynth-wasm** — SFZ / SF2 sample playback.
- **SoundTouchJS** — quick pitch/time preview.

### Audio (native, Rust)
- **CPAL 0.17.3** — cross-platform low-latency I/O (CoreAudio / WASAPI / ASIO / ALSA / JACK).
- **midir** — cross-platform MIDI.
- **rubato** — sample-rate conversion.
- **fundsp** or **kira** — Rust DSP graphs.
- **Rubber Band C++ bindings** — pitch/time stretch (commercial license for distribution).

### Plugins / VST hosting (optional)
- **JUCE 8** — VST3 host bridge (only if we ship VST hosting).
- **CLAP** — modern plugin format (open).

### AI / ML
- **Claude Opus 4.7** (Anthropic) — primary LLM, especially for theory-heavy tool use.
- **GPT-5.5** (OpenAI) — fallback + voice (`gpt-realtime-2`).
- **Gemini 3.1 Pro** — long-context / orchestration fallback.
- **MCP (Model Context Protocol)** — tool surface.
- **Anticipatory Music Transformer** — symbolic infill (open weights).
- **Moonbeam** — MIDI foundation model (May 2025, open weights).
- **YourMT3+** — multi-instrument audio→MIDI transcription (open).
- **MIDI-DDSP** — expressive rendering (open).
- **DDSP-VST** — neural timbre transfer (open).
- **Demucs v4** — stem separation (open, MIT).
- **Basic Pitch** — single-instrument transcription fallback (open).
- **CREPE / SPICE** (tiny ONNX variants) — monophonic pitch on-device.
- **ONNX Runtime / candle** — Rust on-device inference.

### Music theory engines
- **music21** — primary theory library (Python).
- **partitura** — modern alternative, better for ML workflows.
- **symusic** — fast C++/Python for large symbolic operations.
- **gingo** — pitch-class / harmony primitives.

### Backend
- **FastAPI** — agent orchestrator (Python; needed for music21 ecosystem).
- **Fly.io** — primary compute (close to user, cheap, great DX).
- **Cloudflare Workers** — API edge.
- **Modal** — serverless GPU for ML inference (best price/sec H100 = $3.95/hr at May 2026 rates).
- **Postgres (Neon)** + **pgvector** — primary DB + agent memory.
- **Upstash Redis** — sessions, hot caches.
- **Cloudflare R2** — object storage (no egress fees, big deal for samples).

### Auth & ops
- **Clerk** or **WorkOS** — auth (Clerk for B2C, WorkOS if we go B2B/teams later).
- **Sentry** — errors.
- **Datadog** or **Grafana Cloud** — observability.
- **PostHog** — product analytics + feature flags + session replay.
- **LangSmith** — LLM tracing/eval.

### Collaboration
- **Yjs + y-websocket** (Phase 3) — CRDT real-time editing.

### Build & release
- **GitHub** + GitHub Actions.
- **Tauri auto-update** + signed releases on macOS / Windows / Linux.
- **Sentry releases** for crash tracking.

### Datasets (training & evaluation)
| Dataset | Hours | License | Use |
|---|---|---|---|
| **MAESTRO V3** | 200 (piano, MIDI+audio aligned) | CC BY-NC 4.0 | Research, non-commercial pre-train; **need separate commercial corpus for product** |
| **Lakh MIDI v0.1** | 176k MIDI files | CC-BY 4.0 | Symbolic pre-training |
| **Slakh2100** | 145 hours (multi-track synthesized) | CC BY 4.0 | Transcription training |
| **RWC 2.0** | various | CC BY-NC 4.0 | Research only |
| **POP909** | 909 popular pieces, aligned | CC BY-NC | Research only |
| **Curated Stockhausen classical corpus** | TBD | We must build/license | Production fine-tuning |

> ⚠️ **Licensing reality:** Most public music datasets are **non-commercial only**. For a commercial product we will need to (a) train only on public-domain compositions performed by us or licensed performers, (b) license a corpus from a rights-holder (e.g., partner with a conservatory or publishing house), or (c) ship our generation features under a clear research/personal-use license. **This is the single biggest legal risk and we plan for it in §11.**

---

## 8. Build vs. Buy vs. Integrate Matrix

| Area | Decision | Why | Cost |
|---|---|---|---|
| Notation rendering | **Buy/Integrate** (OSMD + VexFlow + Verovio) | Best-in-class open libraries; no value in rebuilding | $0 |
| Audio transport / DSP | **Integrate** (Tone.js, Web Audio) | Mature, free | $0 |
| Pitch/time stretch | **Buy** (Rubber Band SDK commercial license) | Highest quality, used by every major DAW | ~$5–25k commercial license |
| Guitar→MIDI (MVP) | **Buy/Integrate** (MIDI Guitar 3 or MiGiC) | Ship in 8 weeks; replace later | $40/user, or OEM license deal |
| Guitar→MIDI (long-term) | **Build** | Differentiator; integrates with notation deeper | engineering |
| Sample libraries (free tier) | **Integrate** (VSCO 2 CE, Sonatina, VCSL) | CC0 / public domain; great quality | $0 |
| Sample libraries (premium) | **Partner** (Spitfire, Sonokinetic, etc.) | Composers already own them; we host VSTs | revenue share TBD |
| Persian Radif samples | **Integrate** existing + **commission** | The market is thin; we may need to record some | $5–20k production budget |
| LLM | **Buy** (Claude + OpenAI) | Frontier models, fast iteration | $500–5k/mo at MVP scale |
| Voice agent | **Buy** (OpenAI Realtime) | Best-in-class, ~$0.06/min input audio | $200–2k/mo at MVP scale |
| Symbolic AI models | **Open-source + Fine-tune** | Open weights exist (Moonbeam, AMT) | Modal compute |
| Stem separation | **Integrate** (Demucs v4) | MIT-licensed, SOTA | $0 + compute |
| Notation engraving / PDF | **Integrate** (Verovio) | Scholarly-grade, free | $0 |
| Sheet music sharing | **Integrate** (Soundslice / Flat.io APIs) | Why rebuild what they nailed | $20–200/mo |
| DAW timeline UI | **Build** | This is the *product*; cannot be commodity | engineering |
| Agent orchestration / tool surface | **Build** | Core differentiator | engineering |
| Theory engine | **Integrate + extend** (music21 + partitura) | Best base; we add the rules | engineering |
| Cloud GPU | **Buy** (Modal serverless) | $3.95/hr H100, pay-per-second, scale to zero | usage-based |
| DB / storage | **Buy** (Neon Postgres + Cloudflare R2) | Best DX / no egress | $50–500/mo at MVP |
| Real-time collab | **Integrate** (Yjs) | Proven open-source CRDT | $0 |
| Auth | **Buy** (Clerk) | Saves weeks | $25–100/mo |

---

## 9. Roadmap

**Mode:** solo maintainer, personal-use product. No engineering hires. No external timelines. Phases are scoped, not dated. Each phase ends with a demo to yourself + a decision: continue / pivot / kill.

### Phase 0 — Foundations (~4 weeks part-time)
**Goal:** A repo, a build, a thin slice that proves the architecture works on the maintainer's machine.

- [ ] Tauri 2 + React 19 shell builds on macOS.
- [ ] OSMD renders a MusicXML file in the app.
- [ ] Tone.js plays a SoundFont-rendered version of that score.
- [ ] CPAL captures audio from a guitar interface; Web MIDI captures from a MIDI device.
- [ ] FastAPI backend with one endpoint: `POST /transpose` (calls music21).
- [ ] Claude API integration; the agent can answer "what key is this in?" by calling `theory.analyze_key`.
- [ ] Local-only data, no auth, no cloud DB yet.

**Deliverable:** "Hello, composer" demo — open a score, hear it, type "transpose to F♯ minor", see it transposed, hear it transposed.

---

### Phase 1 — The Composer's Sketchpad (~3 months part-time, solo)
**Goal:** A composer (you) can write a piece by typing/clicking, hear it, transpose it, export it. The agent is a thoughtful written assistant.

- [ ] Full notation editor: note entry (mouse, keyboard, MIDI input), measure operations, voice/staff handling, articulations.
- [ ] Mixer with per-track volume/pan/mute/solo.
- [ ] Multi-track recording (audio + MIDI).
- [ ] **Pillar 2 done:** transposition (audio + symbolic) with idiomatic checks.
- [ ] **Pillar 5 done:** Songsterr/Guitar-Pro-class playback (loop, scrub, count-in, speed without pitch, etc.).
- [ ] **Pillar 4 partial:** first-draft generation from a prompt (chamber music focus).
- [ ] **Pillar 7 partial:** chat agent with 10 tools; no voice.
- [ ] **Pillar 8:** point-and-explain theory tutor.
- [ ] Project save/load, undo/redo, autosave, crash recovery.
- [ ] Export MusicXML, MIDI, WAV, PDF.

**Deliverable:** An alpha you'd use *daily* to compose a short piano piece.

---

### Phase 2 — Guitar in, Agent Out (~4 months part-time, solo)
**Goal:** Play the guitar and watch the score build. Re-orchestrate. Bring world traditions in.

- [ ] **Pillar 3 T1:** guitar→MIDI via MIDI Guitar 3 integration; live notation.
- [ ] **Pillar 6 baseline:** orchestration changer with profiles (chamber → orchestra → rock band → world-music ensembles).
- [ ] **World-Music Idiom Packs:** Persian Radif, Arabic Maqam, Hindustani, Chinese classical (samples + idiom rules + tuning systems).
- [ ] **Pillar 7 expanded:** chat agent with 30 tools, deeper project memory. (Voice still deferred.)
- [ ] **Pillar 4 full:** guitar splice ("replace bars 41–48 with what I play next").
- [ ] **Pillar 11:** drop-in MP3 → stems → score (alpha).
- [ ] **Pillar 9:** harmony graph, motif tree, form diagram (read-only first).
- [ ] VST3 host bridge (optional) so the maintainer can use their own libraries.

**Deliverable:** A beta you'd use for a full composition project end-to-end.

---

### Phase 3 — The Co-Composer & The Style (~6 months part-time, solo)
**Goal:** Composer style transfer, real co-composition.

- [ ] **Pillar 1 alpha:** first composer adapters (3–5 composers from your reference roster).
- [ ] **Pillar 3 T2:** in-house guitar→MIDI pipeline (deeper notation integration).
- [ ] **Pillar 6 advanced:** MIDI-DDSP for expressive renders, DDSP-VST for timbre experiments.
- [ ] **Pillar 7 multi-agent:** planner + harmony + counterpoint + orchestration agents.
- [ ] **Pillar 12 full:** stems, parts extraction, conductor's score, publish to Soundslice/Flat.
- [ ] **Pillar 10:** practice coach (pitch/rhythm scoring).
- [ ] *Voice agent* — first iteration if appetite remains, OpenAI Realtime API.
- [ ] Eval harness for musical quality.

**Deliverable:** A personal 1.0 — the daily tool the maintainer composes in.

---

### Out of scope while solo & personal
The following are **archived** while the project is personal-use. We revisit only if posture changes:

- Multiplayer collaboration (was Pillar 13).
- Mobile companion (was Pillar 14).
- Marketplace / community features.
- Monetization, GTM, enterprise tier.

---

## 10. Cost Model (solo, personal use, no hires)

Since Stockhausen is personal-use software for a single maintainer, the cost model is simple: small monthly cloud + API bills, plus a few one-time hardware/license costs. **No salaries, no team, no marketing, no commercial licenses required.**

### Monthly operating cost, by phase

| Item | Phase 0 (setup) | Phase 1 | Phase 2 | Phase 3 |
|---|---|---|---|---|
| Anthropic Claude API (chat agent, theory tools) | $10–30 | $40–150 | $80–250 | $150–400 |
| OpenAI API (fallback only; **no voice yet**) | $0 | $0–20 | $10–40 | $30–80 |
| Modal serverless GPU (inference, light training) | $0–10 | $20–80 | $40–150 | $80–400 |
| Cloudflare R2 (renders, project blobs) | $0 | $0–5 | $0–10 | $5–15 |
| Neon Postgres (only if cloud sync wanted) | $0 (free) | $0 | $0–20 | $20 |
| Fly.io (only if cloud backend wanted) | $0 | $0–10 | $5–20 | $10–30 |
| Sentry / PostHog / LangSmith | $0 (free) | $0 | $0 | $0 |
| **Monthly total (typical)** | **~$10–40** | **~$60–265** | **~$135–490** | **~$295–945** |

Notes:
- Modal is **scale-to-zero**, so off-months drop to near $0.
- Expect occasional **training-burst months** (fine-tuning a composer adapter) to add $100–400 on top of the Phase-3 baseline.
- For Phase 0 and 1 we can run *everything local* and skip the backend services entirely; monthly cost can be as low as **~$20**.

### One-time costs

| Item | When | Cost |
|---|---|---|
| Audio interface (Focusrite Scarlett Solo or Universal Audio Volt 1) | Phase 2 | $150–250 |
| MIDI Guitar 3 license (Jam Origin) | Phase 2 | $40–60 (one-time) |
| Studio headphones (if needed) | Phase 2 | $150–400 |
| Rubber Band library | All phases | **$0** — GPL version is free for personal use |
| Sample libraries (free CC0 tier) | All phases | $0 |
| Optional Mac upgrade (see §10.1) | Mid Phase 1 | $1,400–4,000 |
| Optional Fishman TriplePlay hex pickup | Phase 3+ | $400 |
| ~~Domain~~ | — | **Not needed.** Personal use, no public surface. |
| ~~Apple Developer account~~ | — | **Not needed for now.** We run unsigned builds locally; revisit only if distributing. |

### Cost per AI operation (so you can predict bills)

| Operation | Approx. cost per call |
|---|---|
| LLM tool call (Claude Sonnet 4.6) | $0.002–0.02 |
| LLM tool call (Claude Opus 4.7) | $0.02–0.20 |
| Symbolic generation (4-bar infill on Modal H100) | $0.001–0.005 |
| Stem separation (3-min track) | $0.03–0.10 |
| Multi-track transcription (3-min) | $0.05–0.15 |
| Composer-vector style apply (8-bar region) | $0.005–0.02 |

A heavy day of composing (~200 LLM tool calls + a handful of generations) typically lands at **$2–8 in API bills**.

### §10.1 — Hardware: keep what you have, plan the upgrade

Current machine: **MacBook Air M2, 2022, 8 GB RAM, macOS.** Verdict:

- **Phase 0 and most of Phase 1: workable.** The M2 chip is plenty fast; the 8 GB RAM is the bottleneck.
- **Pain points you will hit:** Rust/Tauri compile times can need 4–6 GB; Cursor + dev server + Stockhausen app + browser together will swap aggressively; multi-GB sample libraries won't all fit in RAM.
- **Cheap, immediate relief:** a 1 TB USB-C NVMe external SSD (~$120) for sample libraries and project audio. Frees internal-SSD pressure.
- **Mid-Phase-1 upgrade (when development gets painful — likely 6–10 weeks in):**

| Tier | Machine | RAM | Approx. USD | Why |
|---|---|---|---|---|
| **Best value (recommended)** | Mac mini M4 Pro (desktop) | 24 GB / 1 TB | $1,800–2,000 | Dedicated dev workstation. Plug into your existing monitor + keyboard. Cool + quiet. |
| **Best portable** | MacBook Pro 14" M4 Pro | 24 GB / 1 TB | $2,500–2,800 | Same chip, traveling. |
| **If money is no object** | MacBook Pro 16" M4 Max | 48 GB / 1 TB | $4,000+ | Can run local LLMs and ML models comfortably. Biggest unified-memory pool. |
| **Cheapest meaningful upgrade** | MacBook Air M4 | 24 GB / 512 GB | $1,400–1,600 | Triples your RAM with the newest chip. |

Rule of thumb: **24 GB RAM is the sweet spot** for solo dev on Stockhausen.

---

## 11. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Training-data licensing for composer styles** | Low (personal use) | Severe | Personal use; we can study and learn from anything. **If posture ever changes to public/commercial**, we restrict to public-domain works (pre-1925 classical) + licensed performances. |
| **Audio latency > 20 ms in browser/Web Audio** | Medium | High | Tauri + native Rust audio path (CPAL); browser is *display*, native is *audio*. We've budgeted §6.4 for this. |
| **Guitar→MIDI accuracy below acceptable** | Medium | High | T1 integrates proven commercial product (MIDI Guitar 3); T2 builds in-house only after we have data and tooling. We don't gate v1 on T2. |
| **LLM hallucinates music-theoretic claims** | High | Medium | Every musical operation goes through `music21`/theory engine; the LLM never invents notes, only calls tools that produce verifiable edits. Eval suite for theory correctness. |
| **Cross-platform headaches (we focus on macOS)** | Low | Medium | Solo + personal → we only target macOS Apple Silicon in Phase 0–2. Windows/Linux deferred indefinitely. |
| **Composer dataset is unavailable / too expensive** | Low (personal use) | Medium | Composer Vector approach is *inference-time steering*; needs much less data than full fine-tuning. Plus public-domain works for the great pre-1925 composers. For modern composers, personal study/use posture covers us. |
| **Scope creep** | High | High | This document. Quarterly re-read. Non-goals are explicit (§5). |
| **Solo developer burnout / momentum loss** | Medium | High | Phases scoped to be enjoyable. No external deadline pressure. Park work in `parking-lot.md` rather than dropping it. Celebrate every demo. |
| **Cloud API costs creep up** | Medium | Low | Monthly cap alerts on Anthropic, OpenAI, Modal. Local fallbacks where possible. |

---

## 12. Monetization

**Not applicable.** Stockhausen is personal-use software for a single maintainer. No monetization, no commercial licensing, no GTM, no marketplace.

If posture ever changes, we revisit this section.

---

## 13. Decisions Log & Open Questions

### Decisions made (May 13, 2026)

| Decision | Choice | Notes |
|---|---|---|
| Use posture | **Personal use only** | No commercial product, no users besides the maintainer |
| Team | **Solo, no hires** | Until further notice |
| Primary platform | **Desktop (Tauri 2), macOS Apple Silicon** | Windows/Linux deferred indefinitely |
| Hardware | M2 Air 8 GB now; **upgrade target ~M4 Pro 24 GB mid Phase 1** | See §10.1 |
| Open-source posture | **Stockhausen itself is closed/private; we use open-source dependencies freely** | No public repo |
| Voice agent | **Deferred** — text-only Phase 1 & Phase 2 | Add in Phase 3 if appetite remains |
| World-music idiom packs (Phase 2) | **Persian Radif, Arabic Maqam, Hindustani, Chinese classical** | Each ships with samples + tuning + idiomatic rules |
| Project name | **Stockhausen** (in homage to Karlheinz Stockhausen) | Confirmed May 13, 2026 |
| Style-transfer intensity | **Single slider** in Phase 3, per-feature later if needed | Per §13 prior recommendation |
| Project sync | **Full local** — no cloud sync. Files live on disk on the maintainer's machine | Revisit if multi-device need arises |
| Domain & code-signing | **Not acquired** — personal use, unsigned local builds | Revisit only if distributing |
| Training on maintainer data | **Forbidden. Permanent rule. No opt-in toggle exists.** | See §5 non-goal #6 |

### Still open

1. **Reference composer roster** — initial set captured in [`docs/REFERENCE_COMPOSERS.md`](docs/REFERENCE_COMPOSERS.md). Maintainer will expand later.
2. ~~Final project name~~ — **resolved: *Stockhausen*.**
3. ~~UI design system~~ — **resolved: approved.** See `docs/UI_DESIGN.md`.
4. ~~Cloud sync~~ — **resolved: full local for now.** Revisit if/when needed.

---

## 14. Success Metrics

We track these from Phase 1.

| Metric | Target by end of Phase 2 |
|---|---|
| Time from "open app" to "first audible bar of new piece" | < 60 seconds |
| Latency: guitar pluck → note on staff | < 20 ms |
| Agent musical-correctness rate (voice-leading errors / 100 ops) | < 5 |
| Crash-free sessions | > 99.5% |
| Round-trip MusicXML→edit→MusicXML lossless | 100% |
| Daily active composers (alpha cohort) | 25+ |
| Pieces composed start-to-finish in Stockhausen | 10+ |

---

## 15. Working Cadence

- **Weekly:** review §13 (Open Questions), update roadmap, demo something playable.
- **Monthly:** re-score §8 (Build vs Buy) — anything changed?
- **Quarterly:** re-read §1–§5 (Vision, Principles, Pillars, Non-Goals). Adjust language to reflect what we've learned.

---

## 16. Glossary (for non-musicians on the team)

- **DAW** — Digital Audio Workstation. The category of software like Pro Tools, Logic, Ableton.
- **MIDI** — Musical Instrument Digital Interface. The *symbolic* events ("note C4 on at time T with velocity V"). Not audio.
- **MusicXML** — The standard XML format for sheet music interchange.
- **MEI** — Music Encoding Initiative. Scholarly-oriented XML for music.
- **SFZ / SF2** — Sample-library formats. SFZ is the open standard; SF2 is SoundFont.
- **VST3 / AU / CLAP / AAX / LV2** — Plugin formats (Cubase/Steinberg / Apple / open / Pro Tools / Linux).
- **DDSP** — Differentiable DSP. ML technique that learns synthesizer parameters end-to-end.
- **Onset detection** — Finding when a new note starts in audio.
- **Pitch tracking / detection** — Finding *what pitch* is sounding at each moment.
- **CRDT** — Conflict-free Replicated Data Type. The math behind real-time collab.
- **MCP** — Model Context Protocol. Anthropic's open standard for exposing tools to LLMs.
- **Radif** — The traditional repertoire and modal system of Persian classical music.
- **Voice-leading** — The principles governing how individual melodic lines move between chords. A correctness criterion.

---

*This document is alive. It changes when we learn. Read it before every major decision. Update it whenever we make one.*
