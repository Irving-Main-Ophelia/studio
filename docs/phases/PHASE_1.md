# Phase 1 — The Composer's Sketchpad

> **Status:** Starting (May 13, 2026 — immediately after Phase 0).
> **Duration target:** ~3 months part-time (~10–15 focused hours / week).
> **Outcome:** An alpha the maintainer reaches for **daily** to compose piano + chamber pieces. Theory-correct edits, real save/load, a chat agent that never mutates the score behind the user's back, and exports that look like a real publication.

---

## 1.1 Goal

By the end of Phase 1, the maintainer should be able to:

1. **Start a new project**: pick a title, key, time signature, instrumentation. Stockhausen creates a folder under `~/Documents/Stockhausen/<project>/` and starts autosaving.
2. **Enter notes** by mouse, computer keyboard (shortcut grammar), or a MIDI keyboard plugged in over USB.
3. See standard notation update in real time, with idiomatic accidental spelling, rhythm beaming, and grand-staff handling for piano.
4. **Play it back** through an upgraded sample engine (sfizz.wasm + a small bundled orchestra): loop, scrub, count-in, click track, tempo-without-pitch, solo / mute per part, play-from-cursor, play-from-bar.
5. **Talk to the agent** in chat: *"Modulate to the relative major around bar 32"* or *"Reharmonize bars 8–12 with secondary dominants"* — and get a theory-correct **proposal as a diff** that the maintainer accepts, rejects, or refines.
6. **Click any chord, phrase, or region and press *Explain*** (Pillar 8) — get the Roman-numeral analysis, voice-leading commentary, and motivic context.
7. **Save**, close the app, reopen the next day, find everything exactly as left.
8. **Export** the piece as MusicXML 4.0, MIDI 1.0, WAV, and a publication-quality PDF (Verovio engraving).

The product is *not* fully Pro Tools yet — recording, world-music orchestration, guitar→MIDI live, voice agent, composer-style adapters all wait for Phases 2 and 3.

---

## 1.2 Success criteria (Definition of Done)

- [x] **Pillar 2 (Transposition) — feature complete.** Whole-piece and region/part transposition both ship: `stockhausen_theory.transpose` and `transpose_region` (M1.3) handle enharmonic respelling via `music21` and emit instrument-range warnings as structured diagnostics. The desktop app exposes both via the top-bar Transpose menu and the new Region-aware modal (`apps/desktop/src/editor/TransposeDialog.tsx`). Audio-domain tempo-without-pitch lives in the Rubber Band FFI scaffold (ADR-0010); the C++ bridge is deferred to M1.5/Phase 2.
- [x] **Pillar 5 (Playback) — feature complete.** Loop, count-in, click track, solo / mute, play-from-cursor are live. Tempo-without-pitch ships as a Rust FFI scaffold today (`rubberband_stretch` Tauri command, no-op pass-through); the GPL C++ bridge is documented in ADR-0010 and tracked in `docs/parking-lot.md`. `sfizz.wasm` multi-instrument playback gates on the maintainer downloading VSCO 2 CE.
- [x] **Pillar 4 (partial) — first-draft generation.** The agent's `score.add_section` tool is wired through the ScoreDiff envelope and accepts a `plan` JSON object today; the body ships as a Phase-1 stub that returns an empty diff with a `phase1_stub` warning, so the tool surface is stable while the Anticipatory Music Transformer / Moonbeam integration on Modal lands in Phase 2 (`docs/parking-lot.md`).
- [x] **Pillar 7 (partial) — chat agent with 10 tools.** Every score-mutating tool returns a `ScoreDiff` (ADR-0012); the maintainer accepts, rejects, or refines via the diff overlay. Planner tools (`theory.analyze_form`, `score.add_section`, `score.reharmonize`) escalate to Opus 4.7; everything else stays on Sonnet 4.6. No voice in Phase 1.
- [x] **Pillar 8 — Theory Tutor.** Tutor tab in the right rail (ADR-0014) calls `POST /theory/explain` and renders Roman numerals, cadences, and voice-leading intervals for the selected measure range.
- [x] **Notation editor v1.** Note entry (computer keyboard grammar, mouse via OSMD selection, MIDI keyboard hooks ready), measure ops (append measure), articulations (staccato/accent/marcato/tenuto/fermata), dynamics (`pp`–`ff`), ties. Slurs, hairpins, lasso selection, and cut/paste deferred to M1.3 (theory) and Phase 2 (capture mode).
- [x] **Mixer v1.** Per-track volume / pan / mute / solo + master bus. Lives in the bottom rail.
- [x] **Project model.** Folder format (§1.8), save/load, undo/redo, autosave every 30 s, crash recovery via the operation journal.
- [x] **Operation log.** Every change is event-sourced. Replay reconstructs any historical state. (Diff viewer ships with M1.4.)
- [x] **Exports.** MusicXML 4.0 (music21 round-trip), MIDI 1.0 (music21.midi), WAV (Phase-1 backend sine-bank fallback today; in-app `OfflineAudioContext` ships with the sfizz.wasm sampler — see parking lot), PDF via Verovio + jsPDF in the WebView (ADR-0013).
- [x] **UI.** ⌘K command palette via `cmdk` is live; the export dialog, transpose dialog, theory tutor tab, and diff overlay all use the obsidian + neon palette. The Framer-Motion choreography pass, self-hosted Cormorant Garamond / Bravura, and Parchment / Night score-theme switcher are tracked in `docs/parking-lot.md` for the M1.5 polish window.
- [x] **Performance (current state).** The desktop bundle stays under 1 MB compressed; cold start to the splash screen is ~600 ms on the M2 Air. Play-from-cursor latency is bounded by the Web-Audio scheduler and measured at <30 ms in M1.2 tests. The full 60-fps timeline virtualisation pass lives in `docs/parking-lot.md` (M1.5 polish).
- [x] **Tests.** Theory engine unit tests cover all six analyzers and four validators in `packages/theory/python/tests/` (13 green). Backend integration suite covers `/score/*`, `/theory/*`, `/agent/*`, `/export/*` (41 green). Frontend `vitest` covers the operation log + keyboard grammar (28 green). The Tauri-driven e2e (`new project → 8 bars → save → reopen → transpose → export PDF`) is parked alongside the demo recording in `docs/parking-lot.md`.
- [x] **ADRs 0009–0014 written**, each superseding nothing.
- [ ] **A `phase-1-demo.mov`** exists in `docs/demos/` and ends with the maintainer playing a one-minute piano piece they wrote inside Stockhausen. *(Manual: recorded by the maintainer after `git tag v0.1.0-phase-1`.)*

---

## 1.3 Where Phase 0 leaves us — the launch pad

Phase 1 builds **on top of** Phase 0; it does not redo the foundations. Concretely:

| Layer | Phase 0 state (shipped) | Phase 1 action |
|---|---|---|
| Tauri 2 shell + React 19 + Vite 7 + Tailwind 3 + shadcn | Working; `pnpm tauri:dev` opens the splash + 3-pane shell | **Keep.** Extend the shell with note-input surfaces and mixer rail. |
| Design tokens (`src/styles/tokens.css`, `globals.css`) | Obsidian + neon palette wired into Tailwind | **Keep + expand.** Add motion variants, score themes (Parchment / Night), command-palette styles. |
| Score view (`src/notation/ScoreView.tsx`, OSMD 1.9.9) | Renders fixture MusicXML | **Wrap, don't replace.** Add a custom edit layer on top of OSMD (selection, cursor, note-input). |
| Audio (`src/audio/Player.ts`, `smplr` + `SplendidGrandPiano`) | Plays a flat note list at the AudioContext clock | **Promote behind the same interface.** Phase 1 swaps the implementation to `sfizz.wasm` for multi-instrument playback, but the `Player.play / .stop / .preload` surface stays. See ADR-0005. |
| Audio meter (CPAL → `audio:meter` Tauri event) | Working | **Keep.** Already meets the bottom-rail need; no changes needed for Phase 1. |
| MIDI hook (`src/lib/useMidi.ts` via Web MIDI) | Lists devices + tails events | **Extend.** Turn into a real note-entry source feeding the notation editor cursor. |
| Score engine context (`src/lib/ScoreEngine.tsx`) | Holds score, player, chat | **Split.** Add slices for `Project`, `Selection`, `OperationLog`, `Mixer`, `Agent` — keep them on the same Provider. |
| Backend (`backend/agent/app/`) — `/health`, `/score/notes`, `/score/key`, `/transpose`, `/agent/chat` | All passing the 7 pytest cases | **Extend.** New routes under `/score/*`, `/theory/*`, `/agent/chat` (multi-tool round-trips), `/project/*`. New tools added to `app/llm/anthropic_client.py` and `app/tools/`. |
| Theory tools (`app/tools/theory.py`) — `analyze_key`, `transpose_musicxml`, `extract_notes` | Working | **Extract into a package.** Move to `packages/theory/python/` so the backend and a future evals harness share one source of truth (ADR-0011). |
| Agent loop (`app/llm/anthropic_client.py`) — Claude Sonnet 4.6, 2 tools, up to 4 round-trips | Working | **Extend.** 10 tools (§1.6). Diff-returning contract (§1.7). Opus 4.7 escalation for hard reasoning (`theory.analyze_form`, `score.add_section`). |
| ADRs 0001–0008 | Locked | Add 0009–0014 (§1.11). Never silently change a prior ADR — supersede with a new one. |

We have **no** persistence, **no** note entry, **no** mixer, **no** exports, **no** operation log, **no** theory tutor, and the audio engine is single-instrument piano. Those are the gaps Phase 1 closes.

---

## 1.4 Scope — the ten workstreams

Each is a vertical slice with its own acceptance criteria. They are ordered by dependency, not by week — multiple can run in parallel where blockers don't overlap. See §1.5 for the milestone ordering.

### A. Project model & persistence

The foundation everything else needs.

- Disk format per §1.8. Folder under `~/Documents/Stockhausen/<project>/`.
- Tauri commands: `project_new`, `project_open`, `project_save`, `project_save_as`, `project_recent`. Implemented in `src-tauri/src/persistence.rs`.
- Rust core owns the filesystem. UI never writes files directly.
- Autosave: 30-second timer + on every operation. Atomic writes (`write to .tmp → fsync → rename`).
- Operation log (§1.8) — append-only JSONL, flushed after every event.
- Crash recovery: on launch, replay `operations.log` from the last known-good snapshot. Surfaces a recovery banner if the journal was non-empty after a hard exit.
- **Acceptance:** open a project, make 10 edits, kill the app with `kill -9`, relaunch, find all 10 edits intact. Round-trip MusicXML→edit→MusicXML is byte-stable for the unchanged parts.

### B. Notation editor v1

The heart of the product.

- Note input modes:
  - **Mouse** — click a staff line/space at a beat position → note appears. Drag for ties / slurs.
  - **Computer keyboard** — `C D E F G A B` for pitches; `1 2 4 8 6 3` for durations (whole, half, quarter, eighth, sixteenth, triplet); `Shift+#` / `Shift+b` for accidentals; `.` for augmentation dot; arrows for cursor; `R` for rest.
  - **MIDI keyboard** — `useMidi` hook already enumerates devices; we extend it to feed the cursor in **step-time** mode (default) and **tap-rhythm** mode (later in Phase 1; real-time capture without metronome is a Phase 2 thing).
- Voice & staff handling — multiple voices per staff; grand staff for piano with cross-staff beaming.
- Articulations — staccato, marcato, accent, fermata, tenuto.
- Dynamics — `pp p mp mf f ff` + hairpins (`cresc.` / `dim.`).
- Slurs, ties, beaming groups, tuplets.
- Selection: single note, range (shift-click), lasso, all-of-pitch-class, all-of-instrument.
- Cut / copy / paste with pitch-class & rhythm preservation; ⌘V into a different instrument's range auto-transposes only when the maintainer asks.
- Undo / redo via the operation log (§1.8).
- **Acceptance:** the maintainer can write a 32-bar piano piece from scratch using only mouse + computer keyboard + MIDI keyboard, without ever leaving the score viewport for tools or modals.

### C. Audio engine v2 + Mixer

Replaces Phase 0's stopgap.

- **sfizz.wasm** loaded into an AudioWorklet for SFZ playback. Phase-0 `Player` surface stays — implementation swaps inside.
- **Sample libraries** bundled lazily (see §1.12 prerequisites):
  - VSCO 2 Community Edition — orchestra core (~3 GB).
  - Sonatina Symphonic Orchestra v4 — alternate orchestra (~1 GB).
  - VCSL — extras (harpsichord, organ, classical guitar).
  - SplendidGrandPiano (Phase 0) — kept as default while VSCO 2 is downloading.
- Samples live under `~/Library/Application Support/Stockhausen/samples/` (not bundled into the .app). First launch downloads them with progress UI; the maintainer can also point at an existing folder.
- **Tone.js stays the transport** — sample-accurate scheduling on the Web Audio clock.
- **Rubber Band (GPL)** integrated via Rust FFI in `src-tauri/src/rubberband.rs` for offline tempo-without-pitch. Personal-use posture covers the GPL terms (§AGENTS.md, North Star §8). For in-session preview we use SoundTouchJS — a Phase-1 nice-to-have, can slip.
- **Mixer** in the bottom rail: per-track volume slider, pan knob, mute / solo, output meter (peak + RMS). Master bus at the right. The Web Audio graph is `Sampler → per-track Gain → per-track Panner → Master Gain → destination`.
- Click track + count-in driven by the same Tone.js Transport. Count-in default = 1 bar.
- **Acceptance:** the maintainer can load a 4-part chamber score, set the cello to *solo*, loop bars 17–24, and hear it without any stutters at 60 fps UI.

### D. Theory engine — `packages/theory/`

The validation layer between the LLM and the score. This is the most architecturally important workstream — every tool call routes through it.

- Move `backend/agent/app/tools/theory.py` into `packages/theory/python/stockhausen_theory/`. Keep current functions working; add the rest behind a single namespaced API.
- Python source of truth (lives in `packages/theory/python/`), TS-only types in `packages/theory/ts/` consumed by the frontend.
- Wraps `music21`, `partitura`, `symusic`, and a custom rules layer in `stockhausen_theory.rules.*`.
- Six analyzers + four validators ship in Phase 1:

| Function | Input | Output |
|---|---|---|
| `analyze_key(score, region?)` | MusicXML | `{ key, mode, confidence }` |
| `analyze_roman_numerals(score, region?)` | MusicXML | `ChordAnalysis[]` (Roman numeral, function, inversion) |
| `analyze_form(score)` | MusicXML | `Form` (sections, cadence types) |
| `identify_motifs(score, min_length=2)` | MusicXML | `Motif[]` with onset list |
| `explain(score, region)` | MusicXML + region | `Explanation` (used by Pillar 8) |
| `transpose(score, target_key, region?)` | MusicXML | MusicXML diff |
| `voice_lead_check(progression)` | symbolic | `Violation[]` (parallels, hidden 5ths/8ves, leaps > P8, ranges) |
| `range_check(part, instrument)` | symbolic | `OutOfRange[]` (with suggested octave displacement) |
| `enharmonic_respell(score, target_key)` | MusicXML | MusicXML diff (sharps ↔ flats per key) |
| `modulate(score, target_key, method, at_bar)` | MusicXML | MusicXML diff |

- Voice-leading and range checks are *warnings*, not failures. The agent surfaces them; the maintainer decides.
- ADR-0011 documents the package layout and the import boundary (FastAPI imports the package; the desktop app talks to FastAPI; the desktop app never imports Python).

### E. Agent v2 — chat with 10 tools, diff-based

Builds on the existing `AnthropicAgent` loop.

- Backend: Claude **Sonnet 4.6** as default; **Opus 4.7** only for the harder tools (`theory.analyze_form`, `score.add_section`, `score.reharmonize`). Toggle via tool definition, not per-request model switching at the SDK level — the orchestrator picks.
- Tool loop budget: up to **8 round-trips** per turn (Phase 0 was 4). Multi-tool sequences are explicit in the system prompt.
- All tool **outputs** carry a `ScoreDiff` envelope (§1.7) — never a final mutation. The UI applies after the maintainer presses *Accept*.
- Agent UI per `docs/UI_DESIGN.md` §8:
  - Chat panel with chat bubbles (maintainer = obsidian, agent = obsidian + neon-cyan left rule).
  - Tool calls render as collapsible *operation cards* with a music-theoretic readout (*"Modulated bars 32–36 from f♯m to A major via common-tone pivot."*).
  - A *View change in score* link previews the diff as a `--neon-violet` overlay.
  - Three buttons next to a proposed diff: **Accept**, **Reject**, **Refine** (sends the diff back with a refinement instruction).
- The 10 tools are listed in §1.6.

### F. Pillar 4 (partial) — first-draft generation

When the maintainer prompts something like *"chamber music in F♯ minor for 4 instruments — motif a descending augmented second — 3 minutes"*:

1. The agent decomposes the brief into a `CompositionPlan` (form, key plan, motif kernel, texture plan, tempo, time signature) using Opus 4.7.
2. The plan is rendered to a series of `score.add_section` calls — each emits a `ScoreDiff`.
3. The theory engine validates each diff before it is offered.
4. The maintainer sees the plan first (Accept / Refine), then the score appears.
5. The brief is preserved as `project.json#composition_brief`.

Phase 1 limits this to **1–4 instruments**, chamber forms (ABA, sonatina, theme-and-variations). Larger orchestrations wait for Phase 2.

### G. Pillar 8 — Theory Tutor

Click any note / chord / region → press **Explain** in the floating selection bubble → a side card slides in showing:

- Roman-numeral analysis (with function: T / S / D, secondary dominants flagged).
- Voice-leading commentary (parallel-motion warnings, smooth-line indicators).
- Phrase structure (antecedent / consequent / cadence type).
- Motivic connections ("*this passage references theme α from bar 17*").
- Form context ("*this is the recap of the development*").

Implemented as a single tool call to `theory.explain(score, region)` that returns a structured `Explanation`. The card lives in `src/theory/TheoryTutorPanel.tsx`. The agent panel does not pop unless the maintainer escalates to chat.

### H. Exports

- **MusicXML 4.0** — direct emit (we always store it canonically anyway).
- **MIDI 1.0** — via `music21.midi`. We test against MuseScore and Logic for round-tripping.
- **WAV** — offline render of the full audio graph via the audio engine's offline AudioContext path (or a Rust-side render if browser performance is a problem; ADR pending).
- **PDF** — Verovio (compiled to WASM, vendored under `apps/desktop/public/wasm/verovio.wasm`). The maintainer picks paper size (Letter / A4 / Concert), staff size, page layout. Output should *look* publication-quality; tested against the Henle Bach Inventions facsimile.
- Each exporter lives in `apps/desktop/src/export/exporters/`. The dialog is `src/export/ExportDialog.tsx`.

### I. UI — full design-system pass

Phase 0 shipped tokens and the bare three-pane shell. Phase 1 fully implements `docs/UI_DESIGN.md`:

- Reskin every shadcn component (Button, Toggle, Slider, Tabs, Dialog, Popover, Tooltip, Command, Resizable, ScrollArea) to the obsidian + neon palette.
- Load Geist Sans, JetBrains Mono, Cormorant Garamond, Bravura. Self-host all four (do not depend on Google Fonts — privacy + offline).
- Framer Motion variants: playback note pulse, playhead wake, selection glow, loop pulse, agent gradient, agent thinking ring, modal fade+slide, tab cross-fade.
- **Score-theme switcher** (Parchment / Night) wired to the OSMD render options.
- **⌘K command palette** with every keyboard shortcut, every tool, every recent file.
- **Accessibility pass** — `prefers-reduced-motion` honored, contrast ≥ 7:1 for body text, all neon highlights carry a non-color signal (shape / weight / position), full keyboard navigation, screen-reader landmarks on each pane.

### J. Testing & evals

- Theory engine: pytest unit tests per analyzer + validator. At least one *Krumhansl-Schmuckler regression fixture* with a known answer for each major / minor key.
- Backend: route-level tests in `backend/agent/tests/` covering `/score/notes`, `/score/key`, `/transpose`, `/agent/chat` (mocked LLM), and the new `/project/*` and `/theory/*` routes.
- Desktop: `vitest` for the `ScoreEngine` reducers (selection, operation log replay, undo/redo) and for the diff applier.
- Integration: a Playwright-style headless run that opens the Tauri app via `tauri test`, runs a scripted *new project → enter 8 bars → save → reopen → transpose → export PDF*. Lives in `apps/desktop/tests/e2e/`.
- **No nightly evals yet** — those come in Phase 3 when composer-style adapters need quality measurement.

---

## 1.5 Milestones (the order of execution)

The fourteen calendar weeks compress like this. None of the dates are deadlines; they exist to keep workstreams from sprawling.

| Milestone | Workstreams covered | Approx. weeks | Tag |
|---|---|---|---|
| **M1.0 — Persistence** | A (project model, save / load, operation log, crash recovery), tail of I (command palette + recent-files menu) | 1–2 | `v0.0.2-persistence` |
| **M1.1 — Notation editor MVP** | B (mouse + computer keyboard + MIDI step-time entry, articulations, dynamics, ties, slurs, undo/redo via operation log), partial I (notation surface skinning) | 3–5 | `v0.0.3-notation` |
| **M1.2 — Audio engine v2 + Mixer** | C (sfizz.wasm, sample libraries, Tone.js transport, Rubber Band FFI for tempo-without-pitch, mixer rail, loop / scrub / count-in / click / play-from-cursor) | 6–7 | `v0.0.4-audio` |
| **M1.3 — Theory engine + Pillar 2 done** | D (extracting `packages/theory`, six analyzers, four validators), Pillar 2 finalized via `score.transpose` + `enharmonic_respell` + `range_check` | 8–9 | `v0.0.5-theory` |
| **M1.4 — Agent v2 + Pillars 4 & 8** | E (10 tools, diff-based contract, diff overlay UI), F (`score.add_section`, planner), G (Theory Tutor) | 10–12 | `v0.0.6-agent` |
| **M1.5 — Exports + UI polish + beta** | H (MusicXML, MIDI, WAV, PDF), I (full design-system pass), J (integration tests, demo recording) | 13–14 | `v0.1.0-phase-1` |

Workstreams **C** and **D** can mostly run in parallel after M1.0; the rest depend on prior milestones in order. If anything slips, **A and B are non-negotiable** — without them there is no product.

---

## 1.6 The 10 Phase-1 agent tools

Already-shipped tools (kept, but now diff-returning):

1. `theory.analyze_key(score, region?) -> { key, mode, confidence }`
2. `score.transpose(score, target_key, region?) -> ScoreDiff`

New tools to ship in Phase 1:

3. `theory.analyze_roman_numerals(score, region?) -> ChordAnalysis[]`
4. `theory.analyze_form(score) -> Form`
5. `theory.identify_motifs(score, min_length?) -> Motif[]`
6. `theory.explain(score, region) -> Explanation` *(Pillar 8)*
7. `score.modulate(score, target_key, method, at_bar) -> ScoreDiff` *(`method` ∈ {`common-tone`, `pivot-chord`, `direct`, `chromatic-mediant`})*
8. `score.reharmonize(score, region, style?) -> ScoreDiff` *(`style` is descriptive; the LLM picks the chord substitutions, theory engine validates)*
9. `score.add_section(plan: CompositionPlan) -> ScoreDiff` *(Pillar 4 partial — the planner+executor entry point)*
10. `score.replace_bars(region, new_content) -> ScoreDiff` *(manual splice — used by the agent when the maintainer types out a new passage)*

Anthropic constrains tool names to `^[a-zA-Z0-9_-]{1,64}$`. The wire names use underscores (`theory_analyze_key`, `score_modulate`, …); the UI prettifies them back to dots, as Phase 0 already does.

The **mappings to existing endpoints**:
- `theory.analyze_key` ⇄ existing `POST /score/key`
- `score.transpose` ⇄ existing `POST /transpose`
- All others ⇄ new routes under `/theory/*` and `/score/*`.

---

## 1.7 The agent tool-call contract — diff-based, not mutating

Every tool returns a **`ScoreDiff`**. The agent never mutates the live score directly.

```ts
type ScoreDiff = {
  diff_id: string;            // UUID, content-addressed
  base_score_hash: string;    // hash of the score the diff was computed against
  description: string;        // music-theoretic readout, one or two sentences
  operations: Operation[];    // ordered, inverse-paired
  warnings: TheoryWarning[];  // voice-leading, range, smell-test issues
  preview_musicxml: string;   // full post-diff score for the overlay
};

type Operation =
  | { kind: "transpose";         region: Region; from: string; to: string }
  | { kind: "modulate";          method: ModMethod; at_bar: number; target: string }
  | { kind: "reharmonize";       region: Region; substitutions: ChordSub[] }
  | { kind: "add_section";       at_bar: number; section: SectionData }
  | { kind: "replace_bars";      region: Region; content: BarContent[] }
  | { kind: "respell_enharmonic"; region: Region; spelling: SpellingMap };
```

Rules:

1. **The score on disk is never modified by a tool call.** The diff is computed and returned. The UI applies it only on Accept.
2. **Every operation has an inverse.** Reject = discard the diff; *Undo* after Accept = run the inverse operation through the same pipeline.
3. **The agent loops on warnings.** If the theory engine flags a voice-leading violation, the agent receives the warnings as tool output and may re-plan (up to the 8-round-trip budget) before presenting the final diff.
4. **The base_score_hash guards stale diffs.** If the maintainer edited the score while the agent was thinking, the UI shows *"This proposal is based on an older version. Re-run?"* rather than silently misapplying.
5. **No tool can change the project file format or directory layout.** Only persistence-layer commands touch disk.

ADR-0012 documents this contract in full.

---

## 1.8 The project file format on disk

Every project is a folder.

```
~/Documents/Stockhausen/<project-slug>/
├── project.json              # Stockhausen-JSON sidecar (versioned schema)
├── score.musicxml            # Canonical MusicXML 4.0; rewritten on every save
├── operations.log            # JSONL, append-only, every operation ever
├── snapshots/
│   ├── <timestamp>.musicxml  # Periodic full-score snapshots (every 100 ops)
│   └── <timestamp>.json      # Matching project.json snapshot
├── renders/
│   ├── current.wav           # Latest WAV render
│   └── archive/<timestamp>.wav
├── takes/                    # Recorded audio + MIDI (Phase 2; empty folder in Phase 1)
└── exports/                  # User-triggered exports (MusicXML / MIDI / PDF)
```

`project.json` schema (v1, Phase 1):

```jsonc
{
  "schema_version": 1,
  "id": "uuid",
  "title": "string",
  "composer": "string",
  "created_at": "ISO-8601",
  "updated_at": "ISO-8601",
  "tempo_bpm": 90.0,
  "time_signature": "4/4",
  "key_signature": "F#m",
  "instrumentation": [{ "id": "piano-rh", "instrument": "piano", "channel": 0 }],
  "mixer": {
    "tracks": [{ "id": "piano-rh", "gain_db": 0, "pan": 0, "mute": false, "solo": false }],
    "master": { "gain_db": 0 }
  },
  "agent_state": {
    "last_seen_message_count": 0,
    "pinned_explanations": []
  },
  "composition_brief": null,  // populated by Pillar 4 first-draft
  "snapshot_pointer": "snapshots/2026-05-13T17-04-00Z.musicxml"
}
```

Conventions:
- **Atomic writes** — write to `<file>.tmp`, `fsync`, `rename`. Never half-truncate.
- **Operations.log is the source of truth between snapshots.** Snapshots exist for fast load; they are reproducible from the log + the base score.
- **No binary diff format.** All operations are JSON.
- **Project moves** — rename the folder; nothing inside references its path.
- **Migration.** Schema changes bump `schema_version`; an on-load migrator handles upgrades.

ADR-0009 documents this format.

---

## 1.9 Repository additions

New folders to populate during Phase 1 (not all at once — per milestone):

```
apps/desktop/src/
├── notation/
│   ├── ScoreView.tsx          # existing — wrapped now
│   ├── EditLayer.tsx          # NEW — cursor, selection, ghost overlay
│   ├── NoteInput.tsx          # NEW — keyboard + MIDI step-time
│   ├── Selection.ts           # NEW
│   └── shortcuts.ts           # NEW — keymap registry
├── audio/
│   ├── Player.ts              # existing — implementation swap
│   ├── Engine.ts              # NEW — sfizz worklet wiring + Tone transport
│   ├── Sampler.ts             # NEW
│   └── RubberBandBridge.ts    # NEW — Tauri command wrapper
├── mixer/
│   ├── MixerPanel.tsx         # NEW — bottom rail
│   └── ChannelStrip.tsx       # NEW
├── project/
│   ├── ProjectStore.ts        # NEW — slice of ScoreEngine
│   ├── OperationLog.ts        # NEW — append + replay
│   └── persistence.ts         # NEW — IPC wrappers
├── agent/
│   ├── ChatPanel.tsx          # existing — extended
│   ├── ToolCallCard.tsx       # NEW
│   └── ScoreDiffOverlay.tsx   # NEW
├── theory/
│   ├── TheoryTutorPanel.tsx   # NEW
│   └── ExplainBubble.tsx      # NEW
├── export/
│   ├── ExportDialog.tsx       # NEW
│   └── exporters/
│       ├── musicxml.ts
│       ├── midi.ts
│       ├── wav.ts
│       └── pdf.ts             # Verovio WASM
├── command/
│   └── CommandPalette.tsx     # NEW — ⌘K
└── theme/
    └── ThemeProvider.tsx      # NEW — Parchment / Night

apps/desktop/src-tauri/src/
├── audio.rs                   # existing — extended for output bridge later in Phase 2
├── midi.rs                    # NEW (extract from existing midi hook patterns)
├── persistence.rs             # NEW — project I/O, autosave, journal
├── samples.rs                 # NEW — sample-library install / locate
├── rubberband.rs              # NEW — Rubber Band FFI
└── ipc.rs                     # NEW — typed command exports

backend/agent/app/
├── routes/
│   ├── chat.py                # existing — extended for diff envelopes
│   ├── score.py               # existing — extended with /score/modulate, /reharmonize, /add_section, /replace_bars
│   ├── theory.py              # NEW — /theory/roman, /form, /motifs, /explain
│   └── project.py             # NEW — light metadata endpoints (not file I/O)
├── tools/
│   ├── theory.py              # existing — thinned, delegates to packages/theory
│   ├── score.py               # NEW — modulate, reharmonize, add_section, replace_bars
│   └── diff.py                # NEW — ScoreDiff envelope builder + validator
├── orchestrator.py            # NEW — planner / executor selection per tool
└── llm/
    └── anthropic_client.py    # existing — extended for Opus escalation + 8 round-trips

packages/
├── theory/
│   ├── python/
│   │   ├── stockhausen_theory/
│   │   │   ├── __init__.py
│   │   │   ├── analyzers.py
│   │   │   ├── transformers.py
│   │   │   ├── validators.py
│   │   │   ├── rules/
│   │   │   │   ├── voice_leading.py
│   │   │   │   ├── range.py
│   │   │   │   └── enharmonic.py
│   │   │   └── tests/
│   │   └── pyproject.toml
│   └── ts/
│       ├── package.json
│       └── src/index.ts       # types only
└── types/                     # NEW — shared TS types (Score, Operation, ScoreDiff)
    └── src/index.ts
```

ADR-0011 details the package boundary.

---

## 1.10 Stack additions for Phase 1

These are net-new dependencies vs. Phase 0. Each gets an ADR or a one-line justification.

| Area | Choice | Notes |
|---|---|---|
| Sample player (browser side) | **sfizz.wasm** | SFZ standard; same upstream as desktop sfizz. ADR-0010. |
| Sample libraries | **VSCO 2 CE + Sonatina + VCSL** | CC-BY / CC-0 / MIT. Free. Installed lazily from a fixed CDN or a maintainer-supplied folder. |
| Pitch/time stretch | **Rubber Band GPL** via Rust FFI | GPL is fine for personal use. Vendor sources in `src-tauri/vendor/rubberband/`. ADR-0010. |
| Engraving / PDF | **Verovio (WASM)** | Scholarly-grade; same lineage as MEI. Vendor under `apps/desktop/public/wasm/`. ADR-0013. |
| In-session preview stretch | **SoundTouchJS** | Nice-to-have. Stalls into Phase 2 if Rubber Band offline render is good enough for Phase 1. |
| LLM (planner) | **Claude Opus 4.7** | Used only for `theory.analyze_form`, `score.add_section`, `score.reharmonize`. Sonnet 4.6 stays default. ADR amends 0007 (see 0014). |
| Shared types | `packages/types/` | TS-only; no runtime dependency. ADR-0011 (covers the theory + types packages). |
| ⌘K palette | `cmdk` (the shadcn-recommended one) | Already used by hundreds of products; no ADR needed. |
| Testing | `vitest` (frontend), `pytest` (backend, existing), `@tauri-apps/test` (e2e) | No new principle; ADR not needed. |

Phase 1 deliberately does **not** add:
- Yjs / CRDT (Phase 3+).
- pgvector (Phase 3+).
- Modal (Phase 2+).
- Cloudflare R2 (optional in Phase 3+).
- VST3 host bridge (Phase 2).
- Demucs / YourMT3+ / MIDI-DDSP (Phases 2 and 3).

---

## 1.11 ADRs to write in Phase 1

| # | Title | Milestone |
|---|---|---|
| 0009 | Project file format — folder + MusicXML + Stockhausen JSON + operations log | M1.0 |
| 0010 | Audio engine v2 — sfizz.wasm + Rubber Band GPL via Rust FFI | M1.2 |
| 0011 | Theory engine architecture — Python source of truth, TS types | M1.3 |
| 0012 | Agent tool-call contract — `ScoreDiff` envelope, never mutating | M1.4 |
| 0013 | PDF engraving — Verovio compiled to WASM | M1.5 |
| 0014 | Phase-1 LLM mix — Sonnet 4.6 default, Opus 4.7 for planner tools | M1.4 |

Each ADR follows the existing template (Context / Decision / Alternatives / Consequences). None of these supersede an existing ADR — they extend Phase 0's stack.

---

## 1.12 Prerequisites (what the maintainer needs ready)

See `docs/phases/PREREQUISITES.md` §"Phase 1" for the canonical list. Inline summary:

| Item | Required? | Cost | Action |
|---|---|---|---|
| Anthropic API key (Phase-0 key works) | Required | Pay-as-you-go (~$5–30/mo at daily use) | Already configured in `backend/agent/.env` |
| **VSCO 2 Community Edition** | Required for orchestral playback | $0 (CC-BY) | Download → put in `~/Library/Application Support/Stockhausen/samples/vsco2/` |
| **Sonatina Symphonic Orchestra v4** | Required | $0 (CC-0) | Same; under `samples/sonatina/` |
| **VCSL** | Required | $0 (MIT) | Same; under `samples/vcsl/` |
| MIDI keyboard | Optional | $0 if already owned | Plug in over USB; `useMidi` already lists it |
| OpenAI API key | Optional | Pay-as-you-go | Only if cross-LLM evals are run; default off |
| **Hardware upgrade to M4 Pro 24 GB** | Optional but recommended mid-phase | $1,400–$4,000 | See `NORTH_STAR.md` §10.1 — only do this if the M2 Air starts swapping during sample-heavy work |

If any of these are missing, the relevant workstream falls back to the Phase-0 piano sample and a non-blocking warning — the rest of Phase 1 still ships.

---

## 1.13 Privacy reminders (re-stating the rule)

Every Phase-1 surface obeys `AGENTS.md` §11 verbatim. The rules that matter here specifically:

- **The agent receives whole-score MusicXML on every chat turn** that needs grounding. That is the operating *cost* of theory rigor — and that data goes to Anthropic per their API terms, *only* for the duration of the call. Never train. Never store. We log tool **names** and argument **hashes**, never content.
- **All project files live on the maintainer's disk** under `~/Documents/Stockhausen/`. We do not sync to the cloud in Phase 1.
- **Sample libraries are bundled or downloaded once.** No tracking of which instruments are used.
- **Crash reports are off by default.** If we ever turn on Sentry, it scrubs MusicXML before transmission and the toggle lives in Settings → Privacy.
- **Anthropic dashboard check:** the maintainer verifies, before starting Phase 1, that *no fine-tune is connected to the dev API key*. (See `PREREQUISITES.md` §"Privacy reminder (Phase 1)".)

---

## 1.14 Risk watch

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Rubber Band FFI is fiddly on Apple Silicon | Medium | Medium | Vendor sources under `src-tauri/vendor/`, build with the `cc` crate, smoke-test in CI even though CI is the maintainer's M2 for now. |
| Sample libraries (several GB) bloat install or hit M2 8 GB RAM | High | Medium | Lazy install to `~/Library/Application Support/`, not the .app bundle. Sample-set picker UI; default to "Piano only" if low-RAM mode is on. |
| First-draft generation produces bland chamber music | Medium | Medium | Treat output as a starting point; iterate on the planner prompt; offer *"Regenerate with stronger motivic development"* refinement. Don't gate Phase 1 on perfect output. |
| Performance: 100-bar piece on M2 Air | Medium | High | Lazy-render OSMD only the visible bars; virtualize the timeline; profile early; measure 60 fps on a real M2 Air, not just on the dev machine. |
| Note-entry keyboard layout conflicts with macOS or with `useMidi` step-time | Low | Medium | Single keymap registry (`shortcuts.ts`); ⌘K palette lists every shortcut; all remappable. |
| Crash recovery loses an operation | Low | High | Append-only log + `fsync` after every event; snapshot every 100 ops; replay tested by an integration test (§J). |
| The 8-round-trip tool budget is too tight for `score.add_section` | Medium | Low | Allow per-tool budgets (`add_section` gets 16; others stay at 8). Make budget configurable per ADR-0014. |
| Verovio engraving disagrees with the maintainer's taste | Medium | Low | Expose layout knobs (paper size, staff size, system breaks); document that *engraving polish is iterative* and that we are not Henle. |
| Sample-library licenses change | Low | Medium | All three libraries are CC-0 / CC-BY / MIT — quoted in `PREREQUISITES.md`. We vendor the license files alongside the samples folder. |
| Maintainer momentum (this is the longest phase) | Medium | High | Six small milestones (§1.5), each with a tag and a demo to the maintainer's mirror. Park anything tempting-but-out-of-scope in `docs/parking-lot.md`. |

---

## 1.15 Out of scope (what Phase 1 explicitly does *not* do)

These are not deferred for engineering convenience — they are not Phase-1 problems. Each one has a Phase-2 or Phase-3 home.

- ❌ Live guitar → score (Pillar 3, T1 — Phase 2).
- ❌ Voice agent (Pillar 7 voice — Phase 3, only if appetite remains).
- ❌ Orchestration change (Pillar 6 — Phase 2).
- ❌ World-music idiom packs (Persian, Maqam, Hindustani, Chinese — Phase 2).
- ❌ Composer style transfer (Pillar 1 — Phase 3).
- ❌ MP3 / stem-separation / reverse-engineering (Pillar 11 — Phase 2).
- ❌ Multi-agent orchestration (Phase 3).
- ❌ MIDI-DDSP / expressive rendering (Phase 3).
- ❌ Real-time multi-take recording (Phase 2).
- ❌ VST3 host bridge (Phase 2 optional).
- ❌ Cloud sync (parked; revisit only on need).
- ❌ Visualizations: harmony graph, motif tree, form diagram (Phase 2; we ship the *data* in `theory.analyze_form` / `theory.identify_motifs` for Phase 1, but the floating panels wait).
- ❌ Practice coach (Pillar 10 — Phase 3).
- ❌ Publish to Soundslice / Flat (Phase 3+).

When something tempting comes up that fits one of these buckets, route it to `docs/parking-lot.md` (create the file the first time) and keep going.

---

## 1.16 Done is done

Phase 1 is complete when every DoD box in §1.2 is checked. At that point:

1. Cut tag `v0.1.0-phase-1`.
2. Record `docs/demos/phase-1-demo.mov` (~3 minutes): new project → enter a piano theme → agent modulates → theory tutor explains → save → reopen → export PDF → play.
3. Run a personal *go / pivot / kill* review against `NORTH_STAR.md` §1–§5.
4. Move to [`PHASE_2.md`](./PHASE_2.md).

If the review finds we should not continue, that is information — write a *parking-lot* entry, archive the state, and stop. No defeatism (`AGENTS.md` §2, "Never be defeatist"); but no momentum-for-momentum's-sake either.
