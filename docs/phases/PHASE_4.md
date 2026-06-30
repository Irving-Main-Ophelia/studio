# Phase 4 — Tablature & Guitar-Centric Notation

> **Status:** Active — next to execute after Phase 3.5 (June 28, 2026).
> **Duration target:** ~5–7 weeks part-time (A2 is the long pole).
> **Outcome:** The maintainer can **open, read, write, and play guitar tablature** alongside standard
> notation, with the vocabulary a guitarist actually thinks in — tunings, capo, and the core
> articulation set (bends, slides, hammer-ons/pull-offs, palm mute, let ring, vibrato, harmonics,
> dead/ghost notes, strums). Guitar Pro files the maintainer already owns open in Stockhausen. Every
> guitar technique is an `Operation` in the log and an agent-callable edit, and survives the
> `resolve → edit → reload` round-trip.
>
> **Why Phase 4, why now.** Stockhausen is guitar-first (North Star §0; Pillars 3, 4, 10) yet renders
> standard staff only. Phase 3.5 just made the app **sound** real and locked the **edit pipeline** with
> a guitar-`<technical>` test corpus; Phase 4 is the first phase that builds *on top of* that
> foundation, and it is the prerequisite for legible live guitar→score capture (Phase 2 residue) —
> see [`../reference-daws/RECONCILIATION.md`](../reference-daws/RECONCILIATION.md) (Phase 4 absorbs
> Phase 2's "live notation" incremental-render path).
>
> **Source of scope:** [`../reference-daws/tracks/TRACK_A_tablature_guitar.md`](../reference-daws/tracks/TRACK_A_tablature_guitar.md)
> (the skeleton this doc promotes) + [`../reference-daws/GUITAR_PRO.md`](../reference-daws/GUITAR_PRO.md)
> (primary teardown) + [`../reference-daws/GARAGEBAND.md`](../reference-daws/GARAGEBAND.md).

---

## 4.1 Goal

By the end of Phase 4 the maintainer can:

1. **See any guitar part as tablature, standard staff, or both**, with a per-part toggle that persists
   in `project.json`. Bends and glissandi render.
2. **Author and edit the core guitar articulation set** — bend/pre-bend/release, slide, hammer-on,
   pull-off, palm mute, let ring, vibrato, natural/artificial harmonics, dead/ghost notes, and strum
   direction — by hand *and* by asking the agent. Each one is an `Operation` and round-trips through
   MusicXML.
3. **Set per-part tuning and capo** (standard, drop D, DADGAD, custom) and have fret numbers — and
   transposition respelling (Pillar 2) — follow the tuning.
4. **Open a `.gp` / `.gpx` / `.gp5` file** they already own; it imports to MusicXML and plays.
5. **Look at an interactive fretboard** that follows playback and the current selection, and **ask for
   a chord voicing or a scale shape** and see it on the fretboard / above the staff.
6. Work in **lead-sheet mode** (rhythmic/slash notation + chord charts) when a part is just changes.

This phase *does* add user-facing surface (it is the opposite of Phase 3.5's hardening posture): tab
view, a fretboard component, a chord/scale engine, and a Guitar Pro importer.

---

## 4.2 Success criteria (Definition of Done)

Grouped by workstream. A box is checked only when the feature **round-trips** (where applicable) and
has a test.

**A1 — Tab rendering** *(M4.0 — landed)*

- [x] **Per-part** view toggle **staff / tab / both**, persisted in `project.json` (schema v3). `ScorePane`
      renders one `ViewModeToggle` per part; the backend `project_views` projects each part independently
      (`test_tab_projection.py` covers a 2-part score).
- [x] OSMD renders a tab staff from the canonical MusicXML (TAB clef + `<staff-details>` + per-note
      `<string>/<fret>`). **Visually confirmed** via a headless OSMD render of the projected fixture:
      the TAB staff draws with frets 0/3/5/12, the hammer-on (`H`) and the bend marker render in both
      `tab` and `both` views. *(A glissando/slide wasn't in the fixture — slides arrive with A2.)*
- [x] The toggle never forks the source of truth: the canonical MusicXML in `ScoreEngine` is unchanged;
      a backend projection (`app/tools/tab_projection.py`) emits the view-specific MusicXML (ADR-0015 intact).

**A2 — Guitar articulations (read/write) ← the core, the long pole** *(M4.1 — core set landed; ADR-0020)*

- [x] The core set parses, round-trips through MusicXML, and is both hand-editable and
      **agent-editable**: **bend** (`FretBend`, target/pre-bend/release), **hammer-on**, **pull-off**,
      **slide** (`Glissando`), **natural & artificial harmonics** (`StringHarmonic`), **vibrato**
      (`TrillExtension` wavy line), **dead/ghost notes** (notehead `x` / parenthesis), **strum up/down**
      (`ArpeggioMark`), **palm mute** & **let ring** (bracketed spans). All round-trip-tested.
      *Render seam (ADR-0020 §5):* OSMD draws bends/`H`/`P`/gliss; per-glyph visual verification of the
      newer markers (wavy-line, brackets, arpeggiate) is **not** re-confirmed this milestone — gaps fall
      back to the standard-staff articulation, OSMD stays the single renderer.
- [x] Point techniques use the `/score/edit/technical/*` family (`/toggle` map for markers, `/bend` for
      the valued bend); **connective** (hammer-on/pull-off/slide) and **bracketed-span** (palm mute, let
      ring) techniques follow the `/tie/set` start/stop discipline via `/technical/connect` and
      `/technical/span`.
- [x] Each technique is an `Operation` (inverse via frontend `OperationLog` replace-op / agent
      `build_replace_op`) and an agent tool (`guitar_bend`, `guitar_connect`, `guitar_marker`,
      `guitar_span`); the edit-pipeline corpus (`fixtures/guitar_technical.musicxml` +
      `fixtures/guitar_hopo_bend.musicxml`) covers every technique via `resolve → edit → reload`
      (`test_edit_corpus.py`). *Manual-UI follow-up:* bracketed spans are agent-driveable over any range;
      the note menu spans to the bar end (no arbitrary range-select affordance yet).

**A3 — Tunings, capo, multi-string** *(M4.2 — UI + respelling landed)*

- [x] Per-part guitar metadata in the schema (tuning array, capo, profile, view mode); `schema_version`
      2 → 3 with a lossless migrator (ADR-0018; `persistence.rs` tests).
- [x] Fret math: pitch → (string, fret) honouring tuning + capo (`app/tools/fretboard.py`, tested).
      **Transpose/tuning respelling (Pillar 2):** `reassign_fret_positions` + `POST /score/tab/refret`
      rewrite a part's `<string>/<fret>` to follow the tuning/capo after a transpose or tuning change;
      unplayable notes lose their position rather than misstate it (`test_tab_projection.py`).
- [x] Tuning presets (standard / drop D / DADGAD / bass) + **custom via array** + capo, all set in the
      UI (`TuningControl` in `ScorePane`) and persisted; the tab view re-projects on change. Bass/7–8
      string stay data-model-ready, UI-deferred per §4.7 Q1.

**A4 — Fretboard viewer** *(M4.3 — landed)*

- [x] React+SVG fretboard (`notation/Fretboard.tsx`, panel `shell/FretboardPanel.tsx`) honouring the
      part tuning/capo, synced to **the current selection** (emerald dot) **and the playhead** (rose dots
      for the part's currently-sounding notes during playback, from the extracted note timings).
- [x] Shows the chord voicing (A5) and scale shape (A6) for the current query; pick among ranked voicings.

**A5 — Chord engine** *(M4.3 — engine landed)*

- [x] Generate chord voicings **algorithmically** (`app/tools/guitar_engine.py`: music21 `harmony` for
      pitch classes + the fret model + a window search), not from a static DB; reachable from the agent
      (`guitar_chord_voicings`) and the fretboard panel. Ranked by root-in-bass / openness / position
      (`test_guitar_engine.py` asserts the open-chord shapes).
- [~] Auto chord-**diagrams** above the staff with a density control (§4.7 Q2): **not done** — the engine
      generates voicings **on demand**, and A8's lead-sheet adds chord **symbols** (text) above the staff;
      the auto-grid-diagram density toggle is the one remaining A5 follow-up.

**A6 — Scale engine** *(M4.3 — landed)*

- [x] Scale viewer on the fretboard (`guitar_engine.scale_shape` + the panel's Scale mode), sharing A5's
      fret model; reachable from the agent (`guitar_scale_shape`). Theory-Tutor wiring (Pillar 8) is light
      — the same engine is one call away when the Tutor wants a shape.

**A7 — Guitar Pro import** *(M4.0 — landed)*

- [x] `@coderline/alphatab` (MPL-2.0) ingests Guitar Pro **read-only** → MusicXML
      (`src/notation/guitarpro/`), wired into the file-open flow; OSMD stays primary. Tested via alphaTex
      **and a real binary `.gp` fixture** (`__fixtures__/sample.gp`, self-minted with `Gp7Exporter`) so the
      `ScoreLoader.loadScoreFromBytes` path is exercised. Coverage is the core set
      (pitch/rhythm/voices/string-fret/ties/harmonics/HOPO); other effects degrade with a counted warning
      (ADR-0017). alphaTab is **dynamically imported** (code-split: ~1.2 MB out of the startup bundle).
- [ ] *(Optional)* alphaTab's player preview — not done (deferred; optional).
- [x] No user-facing `.gp` **export** (§4.7 Q3) — MusicXML is the interchange truth.

**A8 — Rhythmic/slash notation & chord charts** *(M4.4 — landed)*

- [x] Lead-sheet mode: a per-part **"lead"** view (`app/tools/leadsheet_projection.py`,
      `POST /score/tab/leadsheet`, `score_leadsheet` agent tool) projects rhythmic **slash** noteheads +
      **chord symbols** (`<harmony>`) derived from the whole score's harmony, round-tripping through
      MusicXML (`test_tab_projection.py`). Wired as a 4th `ViewModeToggle` mode; opt-in per part (§4.7 Q2),
      OSMD stays the single renderer (ADR-0015).

**General**

- [x] ADRs written: **0018** (schema v3) + **0019** (alphaTab import-only) + **0020** (technical model).
- [~] `git tag v0.4.0-tablature`: **not yet cut.** All workstreams A1–A8 have landed and round-trip with
      tests (rust 11 · backend 192 · frontend 90 green). The remaining open items before the tag are the
      **A5 auto-chord-diagram density toggle** (§4.7 Q2) and the optional A7 alphaTab player preview — plus
      a maintainer demo pass. Cut the tag once those are closed or explicitly waived.

---

## 4.3 Where we are — the launch pad (verified June 28, 2026)

Read the code, not just the docs. Confirmed state of every surface Phase 4 touches:

| Layer | Reality today | Phase-4 action |
|---|---|---|
| Renderer (`notation/ScoreView.tsx`, `osmdFactory.ts`) | OSMD `^1.9.9`, single standard-staff view, `backend: "svg"`. No tab options set; no view toggle. | A1: add a per-part view mode + a backend MusicXML projection for tab/both; verify OSMD tab + bends/glissandi. |
| Edit pipeline (`app/routes/score_edit.py`, `app/tools/score_edit.py`) | `/score/edit/*` covers insert/remove/articulation/tie/dynamic/duration/pitch/transpose/respell/key. `ALLOWED_ARTICULATIONS` = **5 generic** (staccato, accent, marcato, tenuto, fermata). Point + span (`tie/set`) patterns both exist. | A2: extend the vocabulary with guitar `<technical>`; add span techniques on the tie/set pattern; one `Operation` + agent tool each. |
| Articulation type (frontend `lib/api.ts`) | `Articulation = staccato \| accent \| marcato \| tenuto \| fermata`; `toggleArticulation` calls the route. | A2: widen the type; add UI affordances; render where OSMD supports it. |
| Edit-pipeline corpus (`tests/test_edit_corpus.py`, `fixtures/guitar_technical.musicxml`) | **M3.5.3 landed.** Guitar `<technical>` (hammer-on/pull-off, bend, natural harmonic + `<string>/<fret>`) already **round-trips** `list → resolve → edit → reload` in CI. | A2 starts **de-risked**: the fragile path is proven on these elements; extend the corpus per technique. |
| Project schema (`src-tauri/src/persistence.rs`) | **schema v2** (M3.5.2) reserves DAW shapes (sends/inserts/buses/automation/clips/markers). `InstrumentationEntry` = `{id, instrument, channel}` — **no tuning/capo/view**. v1→v2 migrator pattern in place. | A3: bump 2 → 3, add per-part guitar metadata + a v2→v3 migrator (reuse the `migrate_meta` pattern). |
| Guitar domain knowledge (`app/guitar_styles.py`) | A real registry for **"Variaciones sobre un tema de Chan Cil"** (Tema + 6 Variaciones + Coda) — a **classical nylon-guitar** piece, written notation transposing octave-down clef. The composer's actual current work. | Anchors the priority order (§4.7 Q1): classical 6-string standard tuning first. |
| Sound (`audio/Engine.ts`, `Sampler.ts`) | **M3.5.1 landed.** Distinct GM/VCSL timbre per part; real WAV via `offlineRender.ts`. | Guitar techniques get *audible* playback here; expressive per-technique rendering (bend pitch, palm-mute damping) is mostly **Phase 7** (Track D) — Phase 4 notates, Phase 7 voices. |

**Net:** the two things that usually make tab work expensive — a fragile edit pipeline and a renderer
that can't do tab — are already handled (corpus + OSMD). The remaining work is breadth (the
articulation vocabulary) and two new components (fretboard, chord/scale engine) plus the alphaTab importer.

---

## 4.4 Scope — the workstreams

### A1 — Tab rendering (turn OSMD's tab on; dual view) — *cheap, visible*

OSMD already renders tablature from MusicXML when the part carries a TAB clef, `<staff-details>` with
per-string `<staff-tuning>`, and notes with `<technical><string>/<fret>`. The work:

- A **view mode** per part: `staff` / `tab` / `both`, stored in the schema (A3) and toggled in the UI.
- A **backend projection** (music21) that takes the canonical MusicXML + the part's tuning/capo and
  emits the view-specific MusicXML OSMD renders — `both` = a 2-staff part (notation + tab), `tab` =
  tab-only, `staff` = today's behaviour. This keeps **one source of truth** (ADR-0015): OSMD stays a
  pure renderer, edits still go through music21 → reload.
- Verify bends/glissandi render; wire the toggle into `ScoreView`/the part header.

> Depends on A3's minimal fret model (assign `<string>/<fret>` from pitch + standard tuning). That
> slice ships with M4.0; full tuning/capo is M4.2.

### A2 — Guitar articulations (read/write) — *the core, the bulk of the phase*

Extend the music21 edit pipeline to emit/parse the MusicXML `<technical>` + `<notations>` guitar
vocabulary. Two shapes, both already present in the codebase:

- **Point techniques** (attach to one note): hammer-on, pull-off, dead/ghost note, natural/artificial
  harmonic, vibrato marker, strum/brush direction, bend (with `<bend-alter>` target). → extend
  `ALLOWED_ARTICULATIONS` / add a `/score/edit/technical/*` family; music21 has the matching
  `articulations.*` classes.
- **Span techniques** (start/stop across notes): palm mute, let ring, slides between notes (legato/
  shift), rakes. → follow the `/score/edit/tie/set` `start/stop/continue/none` pattern.

Each technique becomes an `Operation` with an inverse (so undo works) and an **agent tool** so Claude
can write idiomatic guitar parts (Pillars 3–4). Extend the corpus fixture set so every technique has a
`resolve → edit → reload` regression test — the discipline §4.9 calls the highest risk.

### A3 — Tunings, capo, multi-string

- **Schema v3.** Add per-part guitar metadata. Tuning is an **array of string pitches** (so N-string
  is data, not code), plus `capo` (fret int), `profile` (nylon/steel/electric/bass/…), and
  `view_mode`. Bump `schema_version` 2 → 3; ship a v2→v3 migrator reusing `persistence.rs::migrate_meta`.
  ADR-0018.
- **Fret math.** pitch + tuning + capo → (string, fret), with a lowest-position / playability
  preference; the inverse for reading imported tab. Transposition **respelling follows the tuning**
  (Pillar 2).
- **Presets:** standard EADGBE, drop D, DADGAD ship first; custom via the array. Bass (EADG) and
  7/8-string are **data-model-ready but deferred** for UI/QA (§4.7 Q1).

### A4 — Fretboard / keyboard viewer

A React+SVG component synced to the playhead + selection, honouring the part tuning/capo. Renders the
A5 voicing and A6 scale for the current context. (Keyboard view is a stretch; fretboard is the Pillar.)

### A5 — Chord engine

Generate chord voicings/diagrams **algorithmically** (music21 harmony + the fret model), not a static
DB — the agent already "knows" theory. Reachable from the agent and the fretboard. Auto-diagrams above
the staff are **opt-in** with a density control (§4.7 Q2).

### A6 — Scale engine

Scale viewer on the fretboard, sharing A5's fret model; feeds the Theory Tutor (Pillar 8).

### A7 — Guitar Pro import (alphaTab, import-only)

Add `@coderline/alphatab` (MPL-2.0) as an **importer only**: parse `.gp/.gpx/.gp5` (+ GP3–5) → convert
alphaTab's model to MusicXML → existing import pipeline. **OSMD stays primary** (no display fork; ADR-0019).
Optionally use alphaTab's player as a quick pre-conversion preview. **No `.gp` export** (§4.7 Q3).

### A8 — Rhythmic/slash notation & chord charts

Lead-sheet mode: slash/rhythmic notation + chord symbols, round-tripping through MusicXML. Lowest
priority; lands last.

---

## 4.5 Milestones (order of execution)

| Milestone | Workstreams | Status | Tag |
|---|---|---|---|
| **M4.0 — Tab view & GP import** | A1 (per-part toggle + projection) + A7 (alphaTab import, code-split) + minimal A3 (fret math + schema v3) | ✅ **landed & verified** (rust 11 · backend 34 tab + suite · frontend 84 green; tab/both **visually confirmed** in OSMD). Deferred to later milestones: tuning/capo UI + transpose respelling (M4.2), alphaTab player preview (optional). | — |
| **M4.1 — Guitar articulations** | A2 (core set: bend, slide, HOPO, palm mute, let ring, vibrato, harmonics, dead/ghost, strum) | ✅ **core set landed** (ADR-0020). All 10 techniques round-trip-tested + hand- and agent-editable via `/score/edit/technical/*` + `guitar_{bend,connect,marker,span}`. Follow-ups: OSMD per-glyph visual check + arbitrary-range span UI. | — |
| **M4.2 — Tunings, capo, fret math** | A3 full (tuning/capo **UI** + custom + transpose respelling) | ✅ landed (`TuningControl` + `/score/tab/refret`). | — |
| **M4.3 — Fretboard + chord/scale engines** | A4 + A5 + A6 | ✅ landed (`Fretboard`/`FretboardPanel` + `guitar_engine` + `/guitar/*`). A5 auto-diagram density toggle is the one follow-up. | — |
| **M4.4 — Lead-sheet mode** | A8 | ✅ landed (`leadsheet_projection` + "lead" view mode). | `v0.4.0-tablature` |

> M4.0 and M4.1 are independent and could run in parallel; M4.0 ships first because it is cheap and
> immediately demoable. A2 (M4.1) is the long pole — budget accordingly.

---

## 4.6 ADRs to write

| # | Title | Milestone |
|---|---|---|
| 0018 | Guitar/tab project **schema v3** — per-part tuning/capo/profile/view-mode + v2→v3 migrator | M4.0/M4.2 |
| 0019 | **alphaTab import-only**; OSMD stays the single renderer (no display fork) | M4.0 |
| 0020 | **Guitar technical-notation model** — `<technical>`/`<notations>` ↔ `Operation`/agent-tool mapping; point vs. span techniques | M4.1 |

*Numbering:* ADRs are taken through 0017 (Phase 3.5). Phase 4 takes **0018–0020**. `PHASE_2.md` §2.4's
loose reservation of 0015–0020 is superseded — renumber Phase 2's ADRs upward when that phase is
written (tracked in `RECONCILIATION.md`, consistent with the `PHASE_3_5.md` §3.5.6 note).

---

## 4.7 Open questions → answers (RATIFIED — maintainer, June 29, 2026)

All three ratified by the maintainer (same discipline as `RECONCILIATION.md`'s ratified decisions).

**Q1 — Which tunings/instruments matter first?**
**Ratified: classical nylon, 6-string, standard tuning (EADGBE) first**, with capo. Evidence: the
composer's actual work is `guitar_styles.py`'s *"Variaciones sobre un tema de Chan Cil"* — a classical
nylon piece — and North Star §0 is "a composer with a guitar." Steel acoustic and electric come **for
free** in the model (identical fret math; they differ only in *sound* — Track D/Phase 7 — and
articulation emphasis). Ship presets **standard / drop D / DADGAD** + arbitrary custom via the tuning
array. **Bass (EADG) and 7/8-string:** keep the data model N-string-ready, but **defer** their
UI/fretboard/QA past M4.2.

**Q2 — Auto chord-diagrams above the staff: on by default or opt-in?**
**Ratified: opt-in, off by default, with a density control.** The composer's work is contrapuntal
classical variations, not chord-chart lead sheets — auto-diagrams would clutter, and auto-deriving
chords from counterpoint is noisy. Ship the chord engine (A5) generating voicings **on demand**;
expose auto-above-staff as a toggle with GP8-style density. Matches the teardown verdict ("ADAPT …
user toggles density").

**Q3 — Is `.gp` export ever needed, or is MusicXML enough?**
**Ratified: SKIP `.gp` export.** (Correction to the earlier teardown claim: alphaTab 1.8 *does* ship a
`Gp7Exporter`, so writing GP7 is technically possible — we still skip it.) Rationale stands on **value,
not capability**: `.gp` export is low-value for a local-first personal tool, and MusicXML is the
interchange truth (North Star §6.3). A7 stays **import-only**; the `Gp7Exporter` is used internally only
to mint a binary `.gp` **test fixture** (A7 round-trip test). Revisit user-facing export only on a
concrete collaborator demand.

---

## 4.8 Prerequisites

| Item | Required? | Action |
|---|---|---|
| `@coderline/alphatab` (MPL-2.0) | Required for A7 | `pnpm add @coderline/alphatab` in `apps/desktop` |
| A `.gp/.gpx/.gp5` test file | Required for A7 | one of the maintainer's own files, or a public-domain sample, kept out of VCS if copyrighted |
| OSMD `^1.9.9` (already shipped) | Required for A1 | none — verify tab + bend/glissando rendering on a fixture |
| music21 (backend, shipped) | Required for A2/A3/A5/A6 | none |
| smplr/VCSL guitar timbre (M3.5.1) | Nice to have | already shipped; expressive per-technique voicing is Phase 7 |

---

## 4.9 Risk watch

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| A technique doesn't survive `resolve → edit → reload` (the §1.17 multi-voice class of bug) | Medium | High | Extend the M3.5.3 corpus **per technique**; add the fixture before the route. The pipeline is already proven on hammer-on/bend/harmonic. |
| OSMD's tab is render-only and may miss some `<technical>` glyphs | Medium | Medium | Keep OSMD primary; for glyphs OSMD can't draw, fall back to the standard-staff articulation; track gaps, don't fork the renderer. |
| alphaTab + OSMD become two renderers (display fork) | Medium | High | ADR-0019: alphaTab is **importer-only** (+ optional preview); the canonical render is always OSMD. |
| Schema v3 migrator corrupts a project | Low | High | Atomic writes (already in `persistence.rs`); reuse the tested v1→v2 migrator pattern; round-trip test; snapshot before migrate. |
| Bend/slide pitch isn't *audible* (only notated) | High | Low | Accept for Phase 4 — notation is the goal; expressive voicing is **Phase 7** (Track D). Document the seam. |
| Fret assignment picks unplayable shapes | Medium | Low | Lowest-position heuristic + manual `<string>/<fret>` override; the agent can be asked to re-voice. |

---

## 4.10 Out of scope (explicitly not Phase 4)

- ❌ Audio recording / clip editing / comping (**Phase 5**).
- ❌ Live guitar→MIDI capture binding (**Phase 2 residue**) — Phase 4 only delivers the *legible
      notation + incremental-render path* that capture depends on.
- ❌ Expressive per-technique **sound** (bend pitch glide, palm-mute damping, amp/dist) — **Phase 7**
      (Track D). Phase 4 *notates* techniques; Phase 7 *voices* them.
- ❌ `.gp` **export** (§4.7 Q3).
- ❌ Drum/percussion tablature (**Phase 2** rhythm section) beyond what alphaTab import yields for free.
- ❌ Speed Trainer / built-in tuner (**Phase 8**, may be pulled forward opportunistically).

---

## 4.11 Done is done

Phase 4 is complete when every DoD box in §4.2 is checked. Then:

1. Cut `v0.4.0-tablature`.
2. Update `docs/phases/README.md` to mark Phase 4 done and the next phase (Phase 5 — Audio Workstation)
   active.
3. Move to **Phase 5 — Audio Workstation**
   ([`../reference-daws/tracks/TRACK_B_audio_workstation.md`](../reference-daws/tracks/TRACK_B_audio_workstation.md)),
   which the legible guitar notation from this phase makes capture/splice tractable.
</content>
</invoke>
