# Phase 3.5 — Foundation Hardening

> **Status:** Active — this is the next phase to execute (June 27, 2026).
> **Duration target:** ~3–4 weeks part-time.
> **Outcome:** Stockhausen **sounds real** (multi-instrument `sfizz.wasm` + a real WAV render), the
> **docs tell the truth** about the code, the **project schema is future-proofed** for the DAW phases
> (4–8), and the **edit pipeline is tested** on real-world scores. This is the launch pad everything
> after it stands on.
>
> **Why 3.5, not 4.** Trust + sound are *foundational*: they finish what Phase 1 (M1.2) and the agent
> contract started. Everything in Phases 4–8 is mute or built on sand until they land. Numbered 3.5
> (a stable ID, per [`../reference-daws/RECONCILIATION.md`](../reference-daws/RECONCILIATION.md)
> Decision A) to signal "before the rest," and to run *now* even though Phases 2–3 remain planned.
>
> **Source of scope:** [`../reference-daws/REFINE_AND_ERADICATE.md`](../reference-daws/REFINE_AND_ERADICATE.md)
> §1 (docs/honesty), §2 (sound), §3 (data model), §5A (test corpus), §6 (drift) +
> [Track D](../reference-daws/tracks/TRACK_D_instruments_tone.md) D1/D2/D6.

---

## 3.5.1 Goal

By the end of Phase 3.5 the maintainer can:

1. Load a 4-part chamber score and hear **distinct instrument timbres** (not one piano for
   everything), through `sfizz.wasm` + a real sample set, with the existing loop / count-in / mixer
   intact.
2. **Export a WAV** that is the real mixed render (not the sine-bank fallback).
3. Open `PHASE_1.md` / `parking-lot.md` and find them **agreeing with the code** — no tool described
   as a stub that actually ships, no "deferred" item that's actually done.
4. Trust that every agent/backend tool **either works or fails loudly** (documented honest-stub
   convention), and see that honesty surfaced in the UI.
5. Start any of Phases 4–8 without a **schema migration tax** — the project format already reserves
   the shapes those phases need.
6. Rely on an **edit-pipeline test corpus** that locks the June-27 multi-voice fix and de-risks the
   guitar-articulation work in Phase 4.

This phase ships **no new user-facing feature surface** beyond real sound. It is deliberately a
*hardening* phase: pay down drift, unblock audio, future-proof the format, raise the test floor.

---

## 3.5.2 Success criteria (Definition of Done)

**Workstream A — Truth & Honesty** *(M3.5.0 — done)*

- [x] `PHASE_1.md` §1.2/§1.3 and `parking-lot.md` reconciled with the code: `theory.analyze_form`,
      `score.reharmonize`, `score.add_section` marked **shipped**, with parking-lot entries moved to
      a "Shipped" note.
- [x] Every other "stub/deferred" claim in `PHASE_1.md` audited against the code; corrections landed
      (incl. the §1.3 audio row noting sfizz moved to Phase 3.5).
- [x] The honest-stub convention is **documented** ([ADR-0017](../adr/0017-tool-honesty-convention.md)):
      `{"stub": true, "reason": …}` / `{"status": "stub", …}` / typed `TheoryWarning`; the "work or
      fail loudly" rule is written down.
- [x] Frontend honesty audit: stub tool results render an explicit `Not available yet — <reason>`
      (`AgentPanel.tsx`); `DiffOverlay` warnings + `ProductionExportPanel` "Coming Soon" confirmed honest.
- [x] Ahead-of-phase routers carry a one-line **registry comment** in `main.py` (router → phase →
      real|stub) — finding: all six are **real**, only `export` `/minus-one` + `/stems` are honest stubs.
- [x] App version/phase sourced from **one place** (`apps/desktop/src/lib/appInfo.ts`); removed the
      hardcoded `phase` from `App.tsx`, `lib.rs`, and the backend `/health`.

**Workstream B — Real Sound**

> **Reconciled June 27, 2026 (M3.5.1).** The acceptance criteria — *distinct timbres per part* and a
> *real WAV render through the sampler + mixer chain* — are met **now** via `smplr`'s `Soundfont`
> (General MIDI) and `Versilian` (VCSL) banks, behind a new `Sampler` interface
> (`apps/desktop/src/audio/Sampler.ts`) wired through `Engine.ts` into the existing `Mixer` and the
> unchanged `Player` surface. The literal **sfizz.wasm + VSCO 2 CE** path (highest fidelity, but needs
> an external Emscripten build + a 3–4 GB local sample download) is **deferred** and scaffolded as
> `SfizzSampler` behind the same interface — it drops in without touching anything above it. Decision
> recorded with the maintainer.

- [~] `sfizz.wasm` in an AudioWorklet behind `Player.play/.stop/.preload` (ADR-0010). **Deferred** —
      replaced for now by a `Sampler` bank (Soundfont/Versilian + `SplendidGrandPiano` fallback) behind
      the *same* `Player` surface. `SfizzSampler` is the scaffolded drop-in for when the WASM binary +
      local SFZ samples exist.
- [~] Local sample-library install to `~/Library/Application Support/Stockhausen/samples/` with a
      progress UI + **"Piano only" low-RAM fallback**. **Piano-only mode shipped** (mixer toggle) and a
      **sampler-load progress indicator** ships; the *local App-Support installer* (`samples.rs`) belongs
      to the deferred sfizz/VSCO path — Soundfont/Versilian stream + cache instead, the same posture as
      the Phase-0 piano.
- [x] A 4-part chamber score plays with **distinct timbres** (a GM/VCSL instrument per part); loop /
      count-in / click / solo-mute (now per part) / play-from-cursor still work.
- [x] **WAV export renders through the real sampler + mixer chain** via `OfflineAudioContext`
      (`apps/desktop/src/audio/offlineRender.ts`); the backend sine-bank is demoted to a
      clearly-labelled emergency fallback in `export/exporters.ts`.
- [x] *(Stretch)* Tempo-without-pitch is real: a **practice-tempo** control (mixer "tempo 100/75/50%")
      plays back slower/faster **without pitch change** — exact and free for the sampler bank, since each
      voice sounds at its natural pitch and only the note schedule is rescaled (`Player.setPlaybackRate`,
      `ScoreEngine.setPracticeTempo`). The playhead/time label stay in score-seconds. Time-domain
      stretching of *recorded audio* (Rubber Band GPL FFI / SoundTouch) remains a Phase-5 concern — the
      `rubberband_stretch` Tauri scaffold stays for it.

**Workstream C — Data Model v2** *(M3.5.2 — done)*

- [x] `project.json` `schema_version` bumped **1 → 2**, reserving `mixer.tracks[].sends/inserts/group`,
      `mixer.buses[]`, `mixer.master.inserts`, `automation[]`, `audio_clips[]`, `markers[]` (all
      empty/defaulted) in `src-tauri/src/persistence.rs`.
- [x] On-load **migrator** v1 → v2 ships (`persistence.rs::migrate_meta`, called from `project_open`);
      opening a v1 project upgrades it losslessly and rewrites `project.json` atomically.
- [x] A round-trip test proves a v1 project loads, migrates, saves, and re-loads byte-stable for
      unchanged data (`migrates_v1_project_to_v2_losslessly_and_byte_stable`), plus a reject-newer-schema guard.

**Workstream D — Edit-Pipeline Test Corpus** *(M3.5.3 — done)*

- [x] A fixture corpus of real-world MusicXML lives under `backend/agent/tests/fixtures/`: multi-voice
      with `<backup>`, piano grand-staff, cross-staff, tuplets, and a guitar part with `<technical>`
      (bend/HOPO/harmonic) — the elements Phase 4 will touch (+ a `README.md` describing each).
- [x] CI (`.github/workflows/ci.yml`) runs the full `list → resolve → /score/edit/* → reload` path
      against each fixture (`tests/test_edit_corpus.py`); the June-27 multi-voice bug has a green
      regression test. *(Also fixed 3 env-leaky API-key tests so the suite is green without a key.)*

**General**

- [x] [ADR-0016](../adr/0016-project-schema-v2.md) (schema v2) and
      [ADR-0017](../adr/0017-tool-honesty-convention.md) (tool-honesty convention) written.
- [ ] `git tag v0.3.5-foundation` cut when all boxes are checked. *(The only item not shipped in-session
      is the deferred **high-fidelity sfizz.wasm + VSCO 2 CE** path — it requires an external Emscripten
      build of sfizz + a 3–4 GB local sample download, so it is the maintainer's task, not a code gap.
      The `SfizzSampler` scaffold makes it a drop-in. Everything else is done; ready to tag.)*

---

## 3.5.3 Where we are — the launch pad (verified June 27, 2026)

Read the code, not just the docs. Confirmed state:

| Layer | Reality | Phase-3.5 action |
|---|---|---|
| Agent tools (`agent_tools.py`) | `analyze_form`, `reharmonize`, `add_section` are **real**, not stubs. Remaining stubs (`audio_*`, `export_stems/minus_one`) are **honest** (`stub:true`/`status:stub`). | Reconcile docs (A); codify the convention; audit the UI surfaces it. |
| Sound (`audio/Player.ts`) | **M3.5.1 landed:** `Engine.ts` + `Sampler.ts` give a distinct GM/VCSL instrument per part behind the unchanged `Player` surface; WAV renders through the real sampler+mixer via `offlineRender.ts`. `SfizzSampler` scaffolds the deferred high-fidelity path. | High-fidelity sfizz.wasm + VSCO 2 is the remaining upgrade (external build + download). |
| Mixer (`audio/Mixer.ts`) | Real: per-track gain/pan/mute/solo + master; comments already anticipate the sfizz swap. | Keep; the sampler wires into `track.input`. |
| Project format (`PHASE_1.md` §1.8) | **M3.5.2 landed:** `schema_version: 2` with reserved DAW shapes + a lossless v1→v2 on-load migrator (`persistence.rs`). | Done (C). Fields stay empty until Phases 5/6. |
| Edit pipeline (ADR-0015) | Works; June-27 multi-voice fix landed. **M3.5.3 landed:** a 5-fixture corpus + CI exercise the full `resolve → edit → reload` path. | Done (D). Incremental render is **Phase 4**, not here. |
| Routers (`main.py`) | **M3.5.0 finding:** all six ahead-of-phase routers are **real**, not stubs; registry comment added. Only `export` `/minus-one` + `/stems` are honest stubs. | Done (A). |

We have **no** real multi-instrument sound, **no** schema headroom for the DAW phases, and **stale
docs**. Those are the gaps Phase 3.5 closes. Note the inversion vs. the earlier draft: the *code* is
healthier than the *docs* claimed — see `REFINE_AND_ERADICATE.md` §1.

---

## 3.5.4 Scope — the four workstreams

### A. Truth & Honesty (docs + the honest-stub convention)

The cheapest high-value work; do it first. Three moves:

1. **Reconcile.** Walk `PHASE_1.md` §1.2/§1.3 and `parking-lot.md` line by line against the code.
   Mark the three implemented tools shipped; correct any other drift (the code is ahead in several
   places — e.g., `theory_explain`, motif analysis, multiple analyzers exist).
2. **Codify** (ADR-0017). Document the existing convention so it's a rule, not folklore:
   - Score-mutating tool that changes nothing → return the diff **with a typed `TheoryWarning`**
     (`no_substitutions`, `generation_failed`, …), never a silent empty success.
   - Non-symbolic tool not yet implemented → `{"stub": true, "reason": …}` (tools) or
     `{"status": "stub", "reason": …}` (routes).
   - The frontend must render either as an explicit, visible "not available / unchanged — here's why".
3. **Audit the UI + routers.** Confirm `DiffOverlay` and the chat surface show warnings; confirm
   audio/export stub responses produce a visible message. Add the `main.py` router registry comment;
   gate genuinely-unsafe-ahead routes behind `settings.experimental` if any aren't honest yet. Fix the
   `App.tsx` `phase: "0"` drift (single source of version/phase).

**Acceptance:** a reader of `PHASE_1.md` and the code cannot find a contradiction; every tool's
"can't do this" path is visible to the user.

### B. Real Sound (`sfizz.wasm` + real WAV)  ← the bulk of the phase

The single highest-leverage piece of plumbing (`GAP_MATRIX.md` priority #1).

- **Engine.** Introduce `apps/desktop/src/audio/Engine.ts` (+ `Sampler.ts`) per `PHASE_1.md` §1.9:
  `sfizz.wasm` in an AudioWorklet, wired into the existing `Mixer` graph
  (`Sampler → track.input → gain → panner → master`). Keep `Player`'s public surface unchanged so
  loop / count-in / play-from-cursor keep working.
- **Samples.** `src-tauri/src/samples.rs` lazy-installs VSCO 2 CE / Sonatina / VCSL to App Support,
  with progress UI and a "Piano only" low-RAM mode (M2 Air, 8 GB). `smplr` piano stays the default
  until a set is present.
- **WAV.** Replace the sine-bank export with an `OfflineAudioContext` render through the real
  sampler + mixer chain. The in-app exporter (`apps/desktop/src/export/exporters.ts`) owns it.
- **Tempo-without-pitch (stretch).** Finish the Rubber Band GPL FFI (`src-tauri/src/rubberband.rs`),
  or ship SoundTouchJS preview. Non-blocking.

**Acceptance:** the 4-part chamber score sounds like four instruments; WAV export matches what you
hear; nothing in the transport/mixer regressed.

### C. Data Model v2 (schema-only, no UI)

Future-proof the format before the DAW UIs (Phases 5–6) need it; avoid a migration tax later.

- Bump `schema_version` 1 → 2. Reserve (empty/defaulted):
  ```jsonc
  {
    "mixer": {
      "tracks": [{ "id","gain_db","pan","mute","solo","sends":[],"inserts":[],"group":null }],
      "buses": [], "master": { "gain_db": 0, "inserts": [] }
    },
    "automation": [], "audio_clips": [], "markers": []
  }
  ```
- Ship the v1 → v2 migrator in the Rust persistence layer (`src-tauri/src/persistence.rs`,
  `PHASE_1.md` §1.8 already mandates on-load migration). Fields stay empty until their owning phase.

**Acceptance:** a v1 project opens, migrates, saves, and re-loads byte-stable for unchanged data.

### D. Edit-Pipeline Test Corpus

Lock the fragile edit path (ADR-0015) and de-risk Phase 4's guitar `<technical>` work.

- Fixtures under `backend/agent/tests/fixtures/`: multi-voice `<backup>`, grand staff, cross-staff,
  tuplets, guitar `<technical>` (bend/HOPO/palm-mute).
- A test runs `resolve → /score/edit/* → reload` against each; the multi-voice regression
  (`test_list_notes_multi_voice_returns_both_voices`, already added) stays in the suite.

**Acceptance:** CI is green across the corpus; an edit on any fixture round-trips through MusicXML.

---

## 3.5.5 Milestones (order of execution)

| Milestone | Workstreams | Status | Tag |
|---|---|---|---|
| **M3.5.0 — Truth pass** | A (docs reconcile + honesty convention + UI/router audit + version drift) | ✅ done | — |
| **M3.5.1 — Real sound** | B (multi-instrument `Sampler`/`Engine` + real WAV + practice tempo) | ✅ done (hi-fi sfizz/VSCO 2 deferred) | — |
| **M3.5.2 — Schema v2** | C (bump + migrator + round-trip test) | ✅ done | — |
| **M3.5.3 — Test corpus** | D (fixtures + CI path) | ✅ done | `v0.3.5-foundation` |

A and C and D can run in parallel around B (the long pole). **B is the phase**; the rest is hardening
that B's sound makes meaningful.

---

## 3.5.6 ADRs to write

| # | Title | Milestone |
|---|---|---|
| 0016 | `project.json` schema v2 — reserved DAW shapes + v1→v2 migrator | M3.5.2 |
| 0017 | Tool-honesty convention — stub/status/warning contract; "work or fail loudly" | M3.5.0 |

`sfizz.wasm` needs **no** new ADR — it lands under the existing **ADR-0010** (audio engine v2 +
Rubber Band). *Numbering note:* `PHASE_2.md` §2.4 loosely reserved 0015–0020; since Phase 3.5 runs
first, treat 0016/0017 as taken and renumber Phase 2's reservations upward when that phase is written
(tracked in RECONCILIATION).

---

## 3.5.7 Prerequisites

| Item | Required? | Action |
|---|---|---|
| Anthropic API key (existing) | Required | already in `backend/agent/.env` |
| **VSCO 2 CE / Sonatina / VCSL** | Required for B | download → `~/Library/Application Support/Stockhausen/samples/…` (see `PREREQUISITES.md`) |
| Rubber Band sources (GPL) | Optional (B stretch) | vendor under `src-tauri/vendor/rubberband/` |
| MIDI keyboard | Optional | unchanged |

If samples are missing, B falls back to the `smplr` piano with a non-blocking warning; A/C/D still
ship.

---

## 3.5.8 Risk watch

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `sfizz.wasm` AudioWorklet integration is fiddly | Medium | High | Keep `smplr` fallback behind the same `Player` surface; ship sound incrementally (one instrument family at a time). |
| Sample libraries (GB) hit the M2 Air's 8 GB RAM | High | Medium | Lazy install; "Piano only" low-RAM mode; Phase-6 freeze is the later pressure valve. |
| Doc reconciliation uncovers *more* drift than expected | Medium | Low | That's the point — it's cheap to fix and high-value. Time-box M3.5.0; log anything large for a follow-up. |
| Schema v2 migrator corrupts a project | Low | High | Atomic writes (`PHASE_1.md` §1.8); round-trip test; snapshot before migrate. |
| WAV `OfflineAudioContext` render is slow/heavy on M2 | Medium | Low | It's offline (non-realtime); chunk if needed; backend sine-bank stays as a labelled emergency path. |

---

## 3.5.9 Out of scope (explicitly not Phase 3.5)

- ❌ Tablature / guitar articulations (**Phase 4**).
- ❌ Audio recording / clip editing / comping (**Phase 5**).
- ❌ Buses / sends / automation **UI** (**Phase 6**) — we only reserve the *schema* here.
- ❌ Amp modeling / loop browser / world-music sound packs (**Phase 7**).
- ❌ Incremental live-capture render (**Phase 4** / Pillar 3) — typed-edit reload stays as-is here.
- ❌ Any new agent tool surface — A only makes the *existing* surface honest and documented.

---

## 3.5.10 Done is done

Phase 3.5 is complete when every DoD box in §3.5.2 is checked. Then:

1. Cut `v0.3.5-foundation`.
2. Update `docs/phases/README.md` to mark 3.5 done and Phase 4 active.
3. Move to **Phase 4 — Tablature & Guitar-Centric Notation**
   ([`../reference-daws/tracks/TRACK_A_tablature_guitar.md`](../reference-daws/tracks/TRACK_A_tablature_guitar.md)),
   which the real sound (B) and the test corpus (D) now make tractable.
