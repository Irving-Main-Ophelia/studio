# Phase 1 — The Composer's Sketchpad

> **Status:** Planned. Starts when Phase 0 DoD is fully checked.
> **Duration:** ~3 months part-time.
> **Outcome:** A composition app the maintainer reaches for **daily** to write piano + chamber pieces. Theory-correct, with a useful written agent.

---

## 1.1 Goal

By the end of Phase 1, the maintainer should be able to:

1. Start a new project, give it a title, key, time signature, instrumentation.
2. Enter notes by **mouse**, **computer keyboard** (in numbered-note mode), or **MIDI keyboard input**.
3. See standard notation update in real time, with idiomatic spelling, rhythm beaming, voice/staff separation.
4. Play the piece back via the upgraded sample engine: looping, tempo without pitch, count-in, click track, solo/mute per part.
5. Ask the agent: *"Modulate to the relative major around bar 32"* or *"Reharmonize bars 8–12 with secondary dominants"* — get a theory-correct proposal as a **diff**, accept or reject.
6. Get an inline explanation of any chord, modulation, or phrase by clicking it and pressing *Explain* (Pillar 8 — Theory Tutor).
7. Save the project, close the app, reopen the next day, find everything exactly as left.
8. Export the piece as **MusicXML**, **MIDI**, **WAV**, and a **publication-quality PDF**.

## 1.2 Success criteria (Definition of Done)

- [ ] **Pillar 2 (Transposition)** is feature-complete: full piece, regions, single parts; symbolic and audio paths; idiomatic enharmonic spelling; instrument-range warnings.
- [ ] **Pillar 5 (Playback)** is feature-complete: loop, scrub, count-in, click, solo/mute, tempo-without-pitch (Rubber Band GPL), play-from-cursor, play-region, play-from-bar.
- [ ] **Pillar 4 (partial)** — first-draft generation: the agent accepts a natural-language brief and produces a chamber-music draft (1–4 parts).
- [ ] **Pillar 7 (partial)** — chat agent with **10 tools** (see §1.6).
- [ ] **Pillar 8** — Theory Tutor: click any moment → explanation (key, function, voice-leading, motif relations).
- [ ] **Notation editor** — note entry (mouse, computer keyboard, MIDI keyboard), measure ops, voice/staff handling, articulations, dynamics, hairpins, slurs, ties.
- [ ] **Mixer** — per-track volume / pan / mute / solo.
- [ ] **Project model** — save / load, undo / redo, autosave every 30 s, crash recovery from journal.
- [ ] **Operation log** — every change is event-sourced. Diff viewer in the UI.
- [ ] **Exports** — MusicXML 4.0, MIDI 1.0, WAV (offline render), PDF (via Verovio engraving).
- [ ] **UI** — fully skinned per `docs/UI_DESIGN.md`: obsidian + neon, parchment score, Broadway-marquee transport, glass panels, Framer-Motion choreography.
- [ ] **Performance** — opening a 100-bar piano piece is <1 s; play-from-cursor latency <50 ms; UI is 60 fps on M2 Air.

## 1.3 Scope (the 10 workstreams)

Each is a vertical slice we land then iterate on. They run mostly in parallel.

### A. The notation editor

- Note input modes:
  - **Mouse** — click on a staff line/space at a beat position.
  - **Computer keyboard** — `C D E F G A B` for pitches; `1 2 4 8` for durations; `Shift+#`/`Shift+b` for accidentals; arrow keys to move cursor.
  - **MIDI keyboard** — real-time MIDI in (via Web MIDI) maps to the cursor position; tap-rhythm or step-time.
- Voice & staff handling: multiple voices per staff; staff split (grand staff for piano).
- Articulations: staccato, marcato, accent, fermata.
- Dynamics: `pp p mp mf f ff` + hairpins (`cresc.`, `dim.`).
- Slurs, ties, beaming groups.
- Selection: single note, range (shift-click), lasso, all-of-pitch-class, all-of-instrument.
- Cut / copy / paste with intelligent pitch-class & rhythm preservation.
- Undo / redo via the operation log.

### B. The audio engine v2

Replace Phase 0's stopgap player with the real audio engine:

- **sfizz.wasm** loaded into an AudioWorklet for SFZ playback.
- Sample library bundled in `apps/desktop/public/samples/`:
  - VSCO 2 Community Edition (orchestra; ~3 GB).
  - Sonatina Symphonic Orchestra v4 (alternate orchestra).
  - VCSL (extras: harpsichord, pipe organ, classical guitar, world).
  - A general-MIDI fallback SoundFont for instant compatibility.
- **Rubber Band (GPL)** integrated via Rust FFI in the Tauri core for tempo-without-pitch.
- Tone.js stays the transport / scheduler.
- AudioWorklet chain: Sampler → per-track gain → master bus → output.
- Per-track volume, pan, mute, solo via Web Audio `GainNode` + custom `PannerNode`.

### C. The agent v2 (chat-only, 10 tools)

Agent backend:
- Anthropic Claude Sonnet 4.6 default; Opus 4.7 for hard reasoning tasks.
- One **planner** + **executor** pattern in a single LLM (multi-agent waits for Phase 3).
- Tools surface via MCP-style typed schemas (see §1.6 for the list).
- Per-tool unit tests in `backend/agent/tests/tools/`.

Agent UI:
- Chat panel per `docs/UI_DESIGN.md` §8.
- Tool-call cards render with a music-theoretic readout + a **View change in score** link.
- Diff overlay on the score (proposed change in `--neon-violet`) before accept.

### D. Theory engine

The validation layer between the LLM and the score:

- Wraps `music21` (Python) + `partitura` (Python) + `symusic` (C++ via Python bindings) + a custom rules layer.
- Lives in `packages/theory/python/` (Python source of truth) and `packages/theory/ts/` (thin TypeScript types client-side).
- Functions:
  - `analyze_key(score, region?) -> Key`
  - `analyze_roman_numerals(score, region?) -> List[ChordAnalysis]`
  - `transpose(score, from_key, to_key, region?, instrument_check=True) -> Score`
  - `voice_lead_check(progression) -> List[Violation]`
  - `range_check(part, instrument) -> List[OutOfRange]`
  - `analyze_form(score) -> Form`
  - `identify_motifs(score, min_length=2) -> List[Motif]`

### E. Pillar 4 partial — first-draft generation

When the user prompts *"chamber music in F♯ minor, 4 instruments, motif = descending augmented second, 3 mins"*:

1. Planner LLM decomposes the brief into a `CompositionPlan`:
   - form (sonata-allegro, ABA, …),
   - key plan (table of keys per section),
   - motivic kernel (a Theme entity),
   - texture plan,
   - tempo, time signature.
2. Generator LLM writes a `music21` Python script (or emits structured `score.add_section` tool calls) that builds the score.
3. Theory engine validates and applies.
4. Score appears in the editor. User refines from there.

### F. Pillar 8 — Theory Tutor

Click any note, chord, or region → press *Explain* → a side card shows:

- Roman-numeral analysis.
- Voice-leading commentary.
- Phrase structure (antecedent / consequent / cadence type).
- Motivic connections (this passage references theme X from bar Y).
- Form context (this is the recap of the development).

Implemented as another tool surface: `theory.explain(score, region)`.

### G. Project model & persistence

- Canonical disk format: a folder
  ```
  ~/Documents/Stockhausen/<project-name>/
  ├── project.json           # Stockhausen JSON (sidecar)
  ├── score.musicxml         # canonical MusicXML 4.0
  ├── operations.log         # JSONL of every operation, append-only
  ├── renders/
  │   ├── current.wav
  │   └── ...
  └── takes/                 # recorded audio/MIDI takes
  ```
- Autosave on a 30 s timer + on every operation.
- Crash recovery: on launch, replay `operations.log` from the last known-good snapshot.
- Undo/Redo via inverse ops in the log.

### H. Mixer

- Per-track strip: volume slider, pan knob, mute, solo, output meter.
- Master bus: output level, master mute.
- Side rail under the score; collapsible.

### I. Exports

- **MusicXML 4.0** — direct emit (we always store it canonically anyway).
- **MIDI 1.0** — via `music21.midi`.
- **WAV** — offline render of the audio engine.
- **PDF** — Verovio engraving. We let the user pick paper size, layout. Output should look publication-quality.

### J. UI — full design-system pass

- Re-skin every shadcn component to the obsidian + neon palette.
- Typography: load Geist Sans, JetBrains Mono, Cormorant Garamond, Bravura.
- Framer-Motion: implement the animations from `docs/UI_DESIGN.md` §4.
- Score-theme switcher: Parchment ↔ Night.
- Accessibility pass: `prefers-reduced-motion`, contrast ≥ 7:1, keyboard nav, ⌘K command palette.

## 1.4 Repository additions

```
apps/desktop/src/
├── notation/
│   ├── ScoreView.tsx
│   ├── NoteInput.tsx
│   ├── Selection.ts
│   └── ...
├── audio/
│   ├── Engine.ts
│   ├── Sampler.ts
│   ├── RubberBandBridge.ts        # FFI wrapper
│   └── Mixer.ts
├── project/
│   ├── ProjectStore.ts
│   ├── OperationLog.ts
│   └── Persistence.ts
├── agent/
│   ├── ChatPanel.tsx
│   ├── ToolCallCard.tsx
│   └── ScoreDiffOverlay.tsx
├── theory/
│   └── TheoryTutorPanel.tsx
├── mixer/
│   └── MixerPanel.tsx
├── export/
│   ├── ExportDialog.tsx
│   └── exporters/
│       ├── musicxml.ts
│       ├── midi.ts
│       ├── wav.ts
│       └── pdf.ts                  # calls Verovio via WASM
└── theme/
    └── ThemeProvider.tsx

apps/desktop/src-tauri/src/
├── audio.rs                        # CPAL + AudioUnit/Worklet bridge
├── midi.rs
├── samples.rs                      # SFZ loading
├── rubberband.rs                   # FFI to Rubber Band C++
├── persistence.rs                  # Disk I/O, autosave, crash recovery
└── ipc.rs

backend/agent/app/
├── tools/
│   ├── theory.py                   # analyze_*, transpose, voice_lead_check, …
│   ├── score.py                    # add_section, replace_bars, …
│   ├── playback.py                 # play_region, loop, set_tempo (proxied to UI)
│   └── project.py                  # snapshot, revert, diff
├── orchestrator.py                 # planner + executor pattern
└── routes/
    ├── chat.py
    ├── transpose.py
    └── export.py

packages/theory/
├── python/
│   ├── stockhausen_theory/
│   │   ├── analyzers.py
│   │   ├── transformers.py
│   │   ├── validators.py
│   │   └── rules/
│   │       ├── voice_leading.py
│   │       ├── range.py
│   │       └── enharmonic.py
│   └── pyproject.toml
└── ts/                              # types only
    └── index.ts
```

## 1.5 The 10 agent tools for Phase 1

1. `theory.analyze_key(score, region?) -> { key, mode, confidence }`
2. `theory.analyze_roman_numerals(score, region?) -> ChordAnalysis[]`
3. `theory.analyze_form(score) -> Form`
4. `theory.identify_motifs(score, min_length?) -> Motif[]`
5. `theory.explain(score, region) -> Explanation`  *(Pillar 8)*
6. `score.transpose(score, target_key, region?) -> ScoreDiff`
7. `score.modulate(score, target_key, method, at_bar) -> ScoreDiff`
8. `score.reharmonize(score, region, style?) -> ScoreDiff`
9. `score.add_section(plan: CompositionPlan) -> ScoreDiff`
10. `score.replace_bars(region, new_content) -> ScoreDiff`

Every tool returns a **diff**, not a mutation. The UI applies after the user accepts.

## 1.6 ADRs for Phase 1

| # | Title |
|---|---|
| 0009 | Project file format: folder layout + MusicXML + Stockhausen JSON sidecar + operations.log |
| 0010 | Audio engine v2: sfizz.wasm + Rubber Band GPL via Rust FFI |
| 0011 | Theory engine architecture: Python source of truth, TS types |
| 0012 | Agent tool-call contract: diff-returning, never mutating |
| 0013 | PDF export: Verovio for engraving |
| 0014 | Note-entry shortcut grammar |

## 1.7 Risk watch

| Risk | Mitigation |
|---|---|
| Sample libraries are several GB; bundling bloats install | Ship a small core bundle; download VSCO 2 / Sonatina on first launch from a CDN we control. (No domain needed; we can use a local cache + the maintainer fetches from GitHub Releases.) |
| Rubber Band FFI is fiddly | Vendor the Rubber Band sources; build via `cc` crate; cover with a small smoke test. |
| First-draft generation produces bland music | Treat output as a *starting point*; explicit "regenerate with more motivic development" tool option; iterate on prompts. |
| Performance: 100-bar piece on M2 Air 8 GB | Profile early; lazy-render OSMD only the visible bars; virtualize the timeline. |
| Note-entry keyboard layout conflicts | Document shortcuts in a command palette; make remappable. |
| Crash recovery loses an operation | Append-only log + flush after every event; replay safe. |

## 1.8 Done is done

When all DoD items in §1.2 are checked, Phase 1 is complete. Cut `v0.1.0-phase-1`, record `phase-1-demo.mov`. Move to [`PHASE_2.md`](./PHASE_2.md).
