# Phase 2 — Guitar in, Agent out

> **Status:** Planned. Starts when Phase 1 DoD is fully checked.
> **Duration:** ~4 months part-time.
> **Outcome:** The maintainer plays guitar and watches the score build. Orchestration changes between idiom packs (Western chamber → orchestra → Persian Radif → Arabic Maqam → Hindustani → Chinese classical). Agent grows from 10 to 30 tools.

---

## 2.1 Goal

By the end of Phase 2, the maintainer should be able to:

1. Plug in a guitar via a USB audio interface. See the live score build as they play.
2. Select a passage and tell the agent: *"Re-orchestrate this for a Persian Radif ensemble"* — and get an idiomatic arrangement.
3. Drop in an MP3 (a piece they love), have Stockhausen separate stems, transcribe them, reverse-engineer the score, and study its harmony.
4. Pick any selection and command: *"Replace bars 41–48 with what I'm about to play"* — play guitar — release — the new passage is spliced in.
5. See a live **harmony graph**, **motif tree**, and **form diagram** alongside the score.
6. Use VST3 instruments the maintainer already owns, if any (via a JUCE bridge).

## 2.2 Success criteria (Definition of Done)

- [ ] **Pillar 3 T1 (guitar → MIDI)** integrated via Jam Origin **MIDI Guitar 3** (purchased; license activated).
- [ ] Live notation update from guitar with ≤ 30 ms end-to-end (target ≤ 20 ms).
- [ ] **Pillar 6 baseline** — orchestration changer with five profiles:
  - Western chamber (string quartet, piano trio, brass quintet).
  - Western full orchestra (Romantic; ~80 players).
  - Hard-rock band (drums, bass, electric guitar, vocal).
  - Jazz combo (piano trio + horns).
  - World ensemble pickable by tradition.
- [ ] **World-Music Idiom Packs** shipped (all four):
  - Persian Radif (tar, setar, santur, ney, kamancheh + dastgāh system).
  - Arabic Maqam (oud, qanun, ney, riq, darbuka + maqam system w/ quarter-tones).
  - Hindustani (sitar, sarod, tabla, bansuri, tanpura + rāga + tāla).
  - Chinese classical (guzheng, erhu, pipa, dizi, yangqin + pentatonic-anchored modes).
- [ ] **Pillar 7 expanded** — 30 chat-agent tools (the original 10 + 20 new; see §2.5).
- [ ] **Pillar 4 full** — guitar splice ("replace bars X–Y with what I play next").
- [ ] **Pillar 11 alpha** — drop-in MP3 → Demucs v4 → YourMT3+ → score reverse-engineered into a read-only project.
- [ ] **Pillar 9** — harmony graph, motif tree, form diagram. **Read-only** (interactive editing comes in Phase 3).
- [ ] **VST3 host bridge** (optional toggle) — loads VST3 instruments through a JUCE bridge.
- [ ] **Project size & performance** — 8-minute orchestral piece opens in <3 s, plays at 60 fps with full sample engine.

## 2.3 Scope (workstreams)

### A. Pillar 3 T1 — Guitar → Score live

- **Audio interface support** — confirm Focusrite Scarlett Solo, Universal Audio Volt 1, RME Babyface work via CPAL on macOS.
- **MIDI Guitar 3 integration** — three integration options, in priority order:
  1. **Standalone + virtual MIDI port** — easiest. MIDI Guitar 3 runs as a separate app, outputs to a virtual MIDI port (IAC on macOS). Stockhausen subscribes via midir.
  2. **VST3 plugin in our JUCE bridge** — neater; loads MIDI Guitar 3 inside our process.
  3. **Direct SDK** (if Jam Origin offers one) — best latency.
- **Notation realtime renderer** — an incremental OSMD layer that appends bars as the player plays.
- **Quantization policy** — keep two parallel tracks:
  - `performance` — humanized MIDI exactly as played.
  - `notation` — quantized, snapped to the current grid. User toggles which they see/edit.
- **Live theory hints** — agent watches the buffer; if it detects a recognizable progression or mode, it surfaces a non-blocking hint card.

### B. Pillar 6 baseline — Orchestration Changer

- Define `OrchestrationProfile` schema:
  ```yaml
  profile_id: western_romantic_orchestra
  display_name: Romantic Orchestra
  tradition: western
  ensemble:
    - section: woodwinds
      instruments: [flute*2, oboe*2, clarinet*2, bassoon*2]
    - section: brass
      instruments: [horn*4, trumpet*2, trombone*3, tuba]
    - section: percussion
      instruments: [timpani, bass_drum, cymbals, glockenspiel]
    - section: strings
      instruments: [violin_1*14, violin_2*12, viola*10, cello*8, contrabass*6]
  tuning: equal_12tet
  idiom_rules:
    - rule: prefer_string_pads_for_long_sustained_chords
    - rule: avoid_doublings_in_woodwinds_below_E4
    - rule: use_horn_for_long_lyrical_lines
  ```
- Agent uses the profile + rules to re-arrange a source piece.
- Source pieces are *symbolic* (MusicXML / MIDI) — we don't re-orchestrate audio.

### C. World-Music Idiom Packs

Each pack ships:

1. **Samples** — open-license or commissioned recordings of the canonical instruments. Format: SFZ.
2. **Tuning system** — a `TuningTable` that maps to non-12-TET (where applicable):
   - Persian: dastgāh (microtonal "koron"/"sori" accidentals).
   - Arabic: maqam (quarter-tones; ½-flat, ½-sharp).
   - Hindustani: rāga-aware shrutis.
   - Chinese: pentatonic-anchored; mostly 12-TET-compatible.
3. **Notation extensions** — MusicXML 4.0 supports microtonal accidentals; we render them via custom VexFlow glyphs.
4. **Idiom rules** — YAML rules consulted by the agent (ornamentation grammar, characteristic phrases, register conventions).
5. **Reference repertoire** — a few canonical pieces in each tradition for the user to study.

Acquisition plan:
- Persian: VSCO 2 includes tar/setar; supplement with Ancient Sounds packs + Persa.sf2; commission recordings of the ney/kamancheh if quality is insufficient.
- Arabic: search Freesound + commission as needed (~$2–5k for full pack).
- Hindustani: sample libraries exist; quality-screen.
- Chinese: similar to Hindustani.

### D. Pillar 7 expanded — 30 tools

The 10 from Phase 1 plus:

11. `record.start_guitar_capture(target_bars)`
12. `record.stop_capture()`
13. `record.merge_capture(target_bars, mode: replace|insert|overdub)`
14. `orchestration.change_instrument(part, new_instrument)`
15. `orchestration.add_part(instrument)`
16. `orchestration.remove_part(part)`
17. `orchestration.set_profile(profile_id)`
18. `audio.stem_separate(audio_file) -> Stems`
19. `audio.transcribe(audio_file, instruments?) -> MusicXML`
20. `score.import_audio(audio_file) -> ProjectId`  *(combines stem-sep + transcribe + new-project)*
21. `score.export(format)`
22. `theory.analyze_motivic_relations(score) -> MotifGraph`
23. `theory.suggest_modulation(from_key, style?) -> ModulationOptions`
24. `theory.check_orchestration(score, profile)` — voicing & range issues
25. `playback.play_from(bar)`
26. `playback.loop(bars)`
27. `playback.set_tempo(bpm)`
28. `playback.toggle_solo(part)`
29. `project.snapshot(name)`
30. `project.revert(snapshot_id)`

### E. Pillar 11 alpha — MP3 reverse-engineering

- Drop an MP3 into Stockhausen.
- `audio.stem_separate` runs Demucs v4 on Modal → returns `drums.wav`, `bass.wav`, `other.wav`, `vocals.wav`.
- `audio.transcribe` runs YourMT3+ on each stem → returns MusicXML.
- Stockhausen opens a new read-only project showing the reverse-engineered score.
- The user can annotate, study, re-orchestrate, but **cannot publish** (we mark provenance in the project file).

### F. Pillar 9 — Visualizations (read-only)

Three new floating panels:

- **Harmony graph** — neo-Riemannian *Tonnetz* lattice. Click a node → jump to the bar where that chord lives.
- **Motif tree** — themes as nodes, derivations as edges. Click → highlight all occurrences in the score.
- **Form diagram** — section blocks (Exposition / Development / Recap, or AABA, or fugue layout). Click → jump.

Use **React Three Fiber** for the harmony graph if a 3D feel improves comprehension; the motif tree and form diagram can be 2D SVG.

### G. VST3 host bridge (optional)

- Build a JUCE-based standalone VST3 host that runs in a sidecar process.
- The desktop app talks to it via gRPC or local socket.
- Loads instruments the maintainer owns (Spitfire, Kontakt, etc.).
- Toggle in Settings; defaults off.

### H. Voice agent — STILL DEFERRED

Phase 2 stays **text-only**. Voice waits for Phase 3 (and only if the maintainer wants it).

## 2.4 ADRs for Phase 2

| # | Title |
|---|---|
| 0015 | MIDI Guitar 3 integration approach |
| 0016 | Microtonal MusicXML extensions + VexFlow custom glyphs |
| 0017 | Demucs v4 deployment on Modal |
| 0018 | YourMT3+ deployment on Modal |
| 0019 | Idiom-rule DSL for world-music packs |
| 0020 | JUCE VST3 host: in-process vs sidecar |

## 2.5 Risk watch

| Risk | Mitigation |
|---|---|
| MIDI Guitar 3 SDK terms restrict embedding | If true, fall back to standalone + virtual MIDI port approach. |
| World-music quarter-tone notation doesn't survive MusicXML round-trip in third-party apps | We tolerate it; Stockhausen reads/writes losslessly. External apps degrade — not our problem. |
| Demucs / YourMT3+ inference on Modal is slow on long files | Chunk audio into ~30 s segments; parallelize. |
| Sample-library size on disk explodes | Lazy-download per pack; offer "uninstall pack" controls. |
| JUCE VST3 host complexity | Sidecar process keeps it isolated; failure here doesn't crash Stockhausen. |
| Live guitar-to-score is *jittery* musically | Two-track approach (performance + notation); user picks which to display. |

## 2.6 Done is done

When all DoD items in §2.2 are checked, Phase 2 is complete. Cut `v0.2.0-phase-2`, record `phase-2-demo.mov`. Move to [`PHASE_3.md`](./PHASE_3.md).
