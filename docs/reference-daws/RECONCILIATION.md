# Reconciliation — new phases (3.5, 4–8) × existing Phases 2 & 3

> **Decision context.** The maintainer chose (June 27, 2026) to turn the five capability tracks into
> **new numbered phases** ([`README.md`](./README.md)). Phases 2 and 3 were already *planned* (not
> started) and their content **overlaps** the new phases. This doc is the authoritative crosswalk:
> for every Definition-of-Done item in Phase 2 and Phase 3, it states the **disposition** and the
> **owner**, so nothing is silently overridden (same discipline as the ADRs).

---

## Principles

1. **Stable IDs.** Phase numbers are permanent identifiers (they're tied to git tags like
   `v0.2.0-phase-2`). We do **not** renumber existing phases. Execution order is tracked separately
   (§"Recommended execution order").
2. **Non-destructive.** This pass adds cross-reference banners to `PHASE_2.md` / `PHASE_3.md`; it
   does not delete their content. Physically relocating absorbed items is a *later, opt-in* step
   (see Decision B).
3. **Never silent.** Every reassignment is recorded here and pointed at from both ends.

**Disposition vocabulary:**
- **STAYS** — item remains owned by its current phase.
- **ABSORB → Phase N** — ownership moves to a new phase; the old checkbox becomes a pointer.
- **SPLIT** — part stays, part moves; both ends cross-reference.
- **DEPENDS-ON Phase N** — stays, but now has a hard prerequisite on a new phase (the key finding).

---

## Crosswalk — Phase 2 (Guitar in, Agent out)

| Phase-2 DoD item | Disposition | Owner / note |
|---|---|---|
| **Pillar 3 T1** — guitar→MIDI (MIDI Guitar 3) | **STAYS** + **DEPENDS-ON 3.5, 4, 5** | The capture engine is unique to Phase 2. But it's mute without **3.5** (sound), illegible without **4** (tab/notation), and uncaptured without **5** (takes). |
| **Live notation ≤30 ms** | **SPLIT** | Incremental-render path (≤17 ms budget) → **Phase 4** (Track A; REFINE §5B). Guitar binding stays Phase 2. |
| **Pillar 6** — orchestration changer (5 profiles) | **SPLIT** | Orchestration **agent + profile schema + idiom rules** = **STAYS** Phase 2. The **sound** (SFZ samples + tuning) for non-Western ensembles → **ABSORB Phase 7**. |
| **World-Music Idiom Packs** (4) | **SPLIT** | Idiom rules + microtonal **notation** + reference repertoire = **STAYS** Phase 2. **Samples + tuning tables** → **ABSORB Phase 7** (Track D, D7). |
| **Pillar 7** — 30 agent tools | **DISTRIBUTE** | The count is a **checkpoint** that STAYS Phase 2. Individual tools land in their owning phase: `record.*` → **5**, `orchestration.*` → **2**, `audio.stem/transcribe/import` → **2** (Pillar 11), `playback.*` mostly shipped, `project.*` shipped. |
| **Pillar 4 full** — guitar splice | **STAYS** + **DEPENDS-ON 5** | Splice needs the recording/capture model from Phase 5. |
| **Pillar 11 alpha** — MP3 → stems → score | **STAYS** Phase 2 | Independent (Demucs/transcription). Backend `audio.py` stub already exists — see REFINE §4. |
| **Pillar 9** — harmony graph / motif tree / form diagram (read-only) | **STAYS** Phase 2 + **DEPENDS-ON 3.5** | Form diagram needs the *real* `theory.analyze_form` (today a stub — REFINE §1). |
| **VST3 host bridge** (optional JUCE) | **ABSORB → Phase 6** | Track C, C2 owns insert/plugin/instrument hosting (WAM/Faust + optional VST3 sidecar). |
| **Project size & performance** | **STAYS** (cross-cutting NFR) | Re-test after Phase 5/6 land. |

## Crosswalk — Phase 3 (Co-Composer & Style)

| Phase-3 DoD item | Disposition | Owner / note |
|---|---|---|
| **Pillar 1 alpha** — composer adapters | **STAYS** Phase 3 | Independent (the marquee Phase-3 differentiator). |
| **Pillar 3 T2** — in-house guitar→MIDI | **STAYS** Phase 3 + **DEPENDS-ON 4, 5** | Same dependencies as T1. |
| **Pillar 6 advanced** — MIDI-DDSP / DDSP-VST expressive render | **ABSORB → Phase 7** *(recommended — Decision C)* | Expressive rendering is tone/sound (Track D). Could also stay Phase 3; flagged. |
| **Pillar 7 multi-agent** | **STAYS** Phase 3 | Independent. |
| **Pillar 10** — practice coach | **ABSORB → Phase 8** | Track E, E6. |
| **Pillar 12 full** — production exports | **STAYS** Phase 3 | Fed by **4** (tab in parts), **5** (markers/comping), **6** (stems via freeze). |
| **Voice agent** (optional) | **STAYS** Phase 3 | Unchanged; still optional/last. |
| **Eval harness** | **STAYS** Phase 3 | Independent; should measure the new phases too. |

---

## What each new phase absorbs (bidirectional view)

| New phase | Absorbs from existing phases |
|---|---|
| **Phase 3.5 — Foundation** | (nothing; it's net-new foundation + finishes Phase-1 M1.2 sound) |
| **Phase 4 — Tablature/Guitar** | Phase 2 "live notation" incremental-render path |
| **Phase 5 — Audio Workstation** | Phase 2 `record.*` tools + the capture substrate behind Pillar 3/4 |
| **Phase 6 — Mixing/Routing** | Phase 2 **VST3 host bridge** |
| **Phase 7 — Instruments/Tone** | Phase 2 **world-music samples + tuning**; Phase 2 orchestration **sound**; Phase 3 **MIDI-DDSP expressive render** *(recommended)* |
| **Phase 8 — Assistive/Practice** | Phase 3 **practice coach (Pillar 10)** |

Everything not in this table **stays** with its original phase.

---

## Recommended execution order (labels stay as stable IDs)

The big finding: **Phase 2's headline feature (live guitar→score) depends on the new phases**, so we
cannot run "2 then 3 then 4+". Dependency-driven order:

1. **Phase 3.5 — Foundation Hardening** ⭐ (trust + sfizz + schema + test corpus) — prereq for all.
2. **Phase 4 — Tablature & Guitar notation** — guitar-first identity; prereq for legible capture.
3. **Phase 5 — Audio Workstation** — recording/clips/comping/markers; prereq for guitar capture/splice.
4. **Phase 7 — Instruments/Tone** — amp modeling, loop browser, world-music sound (feeds orchestration).
5. **Phase 6 — Mixing & Routing** — sends/automation/freeze; absorbs VST3.
6. **Phase 2 (residue)** — guitar capture (Pillar 3 T1), splice (Pillar 4), orchestration *agent*,
   MP3 reverse-eng (Pillar 11), visualizations (Pillar 9) — now unblocked.
7. **Phase 8 — Assistive/Practice** — drummer, strum/arp, groove, speed trainer, tuner.
8. **Phase 3 (residue)** — composer adapters, guitar T2, multi-agent, production exports, voice, eval.

> Steps 4/5 can swap. The Speed Trainer + tuner (part of Phase 8) are small and may be pulled
> forward opportunistically.

---

## Decisions — RATIFIED (maintainer, June 27, 2026)

All three confirmed by the maintainer. The non-destructive defaults stand.

- **Decision A — Numbering: STABLE IDs.** Existing phase numbers are permanent identifiers (tied to
  `v0.2.0-phase-2`-style tags). Execution is tracked via the dependency-driven ordered list above, not
  by renumbering.
- **Decision B — Scope now: LEAVE INTACT.** Phase 2/3 docs keep their content + cross-reference
  banners; the new-phase docs own the absorbed items. No hollowing-out for now (revisit per new phase
  as it's fully written).
- **Decision C — MIDI-DDSP: → Phase 7.** Expressive rendering lives in the instruments/tone layer
  (Track D), alongside amp modeling and the samplers. The Phase-3 banner already reflects this.
