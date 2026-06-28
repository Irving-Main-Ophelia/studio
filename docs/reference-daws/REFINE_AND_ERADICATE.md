# Refine & Eradicate — what we're doing wrong today

> The maintainer's brief was explicit: *refine what we already have, and eradicate what we're doing
> wrong.* This doc is the honest list. Each item: the problem, why it matters (against the North Star
> / the reference teardowns), and the concrete fix. Grouped: **trust**, **sound**, **data model**,
> **backend hygiene**, **frontend / editor**, **doc drift**.
>
> Nothing here is a bug report on a broken feature — it's about **direction**: places where the
> current build either over-promises, blocks the roadmap, or paints us into a corner.

---

## 1. Doc ↔ code drift — the docs describe a worse product than we shipped  ⚠️ highest priority

> **Corrected June 27, 2026** after reading the actual backend. The earlier draft of this section
> claimed a "silent stub" trust crisis. **That was wrong** — it trusted `PHASE_1.md`/`parking-lot`
> instead of the code. The real problem is the reverse: **the docs are stale and undersell the code.**

**What the docs say (stale).** `PHASE_1.md` §1.2/§1.3 and `docs/parking-lot.md` describe
`score.reharmonize`, `score.add_section`, and `theory.analyze_form` as empty-diff `phase1_stub`s, and
`theory.analyze_form` as returning a single `undivided` section.

**What the code actually does (verified).** All three are **implemented** in
`backend/agent/app/agent_tools.py`:
- `theory_analyze_form` (≈L146) — real cadence-based phrase/section detection.
- `score_reharmonize` (≈L466) — Claude-assisted chord substitution, with an honest `no_substitutions`
  warning when it changes nothing.
- `score_add_section` (≈L539) — real Claude + music21 generation, with a `generation_failed` warning
  on fallback.

And the stubs that *do* remain are **honest**: `audio_stem_separate` / `audio_transcribe` /
`score_import_audio` return `{"stub": true, "reason": …}`; `export_stems` / `export_minus_one` return
`{"status": "stub", "reason": …}`. The backend already follows "work or fail loudly."

**Why it matters.** Stale docs that *undersell* are as corrosive as overselling: the next agent
re-implements work that's done, or distrusts a tool that works. The phase docs are the contract; when
they lie about the code, every downstream decision is built on sand.

**Fix (this is a Phase-3.5 workstream):**
1. **Reconcile the docs** — update `PHASE_1.md` §1.2/§1.3 and `parking-lot.md` to mark these three
   tools *done*; move their parking-lot entries to a "shipped" note. Audit every other "stub/deferred"
   claim in `PHASE_1.md` against the code (the code is ahead in several places).
2. **Codify the honest-stub convention** — the existing `{"stub": true, "reason": …}` /
   `{"status": "stub", …}` / typed `TheoryWarning` pattern becomes the *documented* rule, so future
   tools follow it.
3. **Frontend honesty audit** — verify the UI renders those flags as an explicit "not available yet"
   (never as a silent success). `DiffOverlay` already reads `warnings`; confirm audio/export stub
   responses surface a clear message.

> Ratified rule (already largely followed): **a tool in the advertised surface either works or fails
> loudly** via `stub`/`status`/`warning`. No silent empty-diff successes — and **no docs that claim a
> shipped tool is a stub.**

---

## 2. Sound — playback is a Phase-0 stopgap that blocks the roadmap

**Problem.** `apps/desktop/src/audio/Player.ts` still uses `smplr`'s `SplendidGrandPiano` (Phase 0).
`sfizz.wasm` + the real sample set (VSCO2/Sonatina/VCSL) is deferred (parking-lot, M1.2). WAV export
is a backend **sine-bank fallback** (`PHASE_1.md` §1.2).

**Why it matters.** Every reference teardown converges here: Guitar Pro's RSE, GarageBand's
instruments, orchestration changes, world-music packs, even a believable guitar — **all of it is
mute until the sampler is real.** This is the single highest-leverage piece of plumbing in the
project (see `GAP_MATRIX.md` priority stack #1).

**Fix.**
- Land `sfizz.wasm` in an AudioWorklet behind the existing `Player.play/.stop/.preload` surface
  (the abstraction is already there — ADR-0005/0010).
- Replace the sine-bank WAV export with an `OfflineAudioContext` render through the real sampler +
  mixer chain.
- Only *then* layer Track D (amp modeling, loop browser) on top.

---

## 3. Data model — extend it now, before the DAW UIs land

**Problem.** `project.json#mixer` (`PHASE_1.md` §1.8) models only `gain_db / pan / mute / solo` per
track + a master bus. There is no schema for **sends/buses, automation lanes, audio clips/takes,
clip gain, or markers**. The Pro Tools and GarageBand teardowns (Tracks B/C) all need these.

**Why it matters.** If we build the recording/mixing UIs first and the schema later, we pay a
painful migration tax on every existing project (and the format is versioned + on-disk, §1.8). Cheap
now, expensive later.

**Fix — a Phase-1 schema-only step (no UI):** bump `schema_version` and reserve the shapes:
```jsonc
{
  "mixer": {
    "tracks": [{ "id", "gain_db", "pan", "mute", "solo",
                 "sends": [], "inserts": [], "group": null }],
    "buses": [],            // aux/submix targets (Track C)
    "master": { "gain_db": 0, "inserts": [] }
  },
  "automation": [],          // per-track/param breakpoint lanes (Track C)
  "audio_clips": [],         // references into takes/ with offsets + clip gain (Track B)
  "markers": []              // named song positions; tie to analyze_form (Track B)
}
```
Write the migrator alongside (§1.8 already mandates on-load migration). Leave the fields empty until
their track ships — but stop the format from being a blocker.

---

## 4. Backend hygiene — ahead-of-phase routes wired into `main.py`

**Problem.** `backend/agent/app/main.py` registers `orchestration`, `audio`, `practice`, `style`,
`generate`, and `multi_agent` routers — Phase-2/Phase-3 surfaces — while Phase 1 isn't fully closed.
Some are real-ish, some are stubs. The result is a large, partly-untested public surface on the local
API.

**Why it matters.** Local-only API, so it's not a security issue — but it is a **maintenance and
honesty** issue: routes that 200-OK with stub data invite the same trust problem as §1, and they
dilute the test surface (`PHASE_1.md` §1.2 counts 41 backend integration tests, but the ahead-of-phase
routes aren't all covered).

**Fix.**
- Gate ahead-of-phase routers behind a `settings.experimental` flag (default off), OR keep them
  registered but make every stub return a typed `{ "status": "not_implemented", "phase": N }` body —
  never fabricated data.
- Add a one-line registry in `main.py` comments mapping each router → its phase → real|stub, so the
  next agent knows the ground truth without spelunking.
- Make sure the frontend doesn't surface stub routes as if they were live features.

---

## 5. Frontend / editor — fragility and the live-capture cliff

**Problem A — edit pipeline fragility.** The imported-score mouse-edit pipeline (ADR-0015) just had a
blocking, *invisible* failure (multi-voice `<backup>` measures returned no notes; the error was
swallowed because `EditorStatusBar` early-returned when no project was open — `PHASE_1.md` §1.17).
Fixed, but it shows the edit path is under-tested on real-world imports.

**Fix.** Build a corpus of real-world MusicXML imports (multi-voice, piano `<backup>`, cross-staff,
guitar with `<technical>`) as fixtures; run the full resolve→edit→reload path against each in CI.
This corpus also de-risks Track A (guitar articulations are exactly the `<technical>`/`<notations>`
elements that broke).

**Problem B — the live-capture cliff.** ADR-0015's edit path does a **full `osmd.clear()` + reload**
per edit. Fine for Phase-1 typed edits. But Phase 2's live guitar→score (Pillar 3) needs the
**≤17 ms** incremental render budget (Architecture §6.4 / latency diagram). A full reload per note
will never hit that.

**Fix.** Spec the incremental-render path (append-only bar rendering) as an explicit Track-A/Phase-2
deliverable, *separate* from the typed-edit reload path. Don't discover this gap during live capture.

---

## 6. Doc ↔ code drift

**Problem.** `apps/desktop/src/App.tsx` still hardcodes `BROWSER_INFO = { version: "0.0.1", phase:
"0" }`, while `PHASE_1.md` marks Phase 1 essentially done. Small, but it's a signal that surface
metadata isn't tracking the roadmap.

**Fix.** Source app version/phase from a single place (package version + a `PHASE` constant), and
make "what phase are we in" a one-liner the splash/About reads. Cheap, keeps the next agent oriented.

---

## 7. Things that are *right* — keep, don't touch

So the list isn't all critique:

- **ScoreDiff envelope (ADR-0012)** — agent never mutates the live score; accept/reject/refine. This
  is exactly right; every new tool (reharmonize, add_section, the Track-E assistants) must keep using
  it.
- **MusicXML-as-truth + music21 mutation, OSMD as display (ADR-0015)** — the right separation;
  alphaTab/tab rendering slots in without violating it (`GUITAR_PRO.md` §3).
- **Event-sourced operation log** — undo/redo/replay foundation; clips, automation, and recording
  takes should all become operations in the same log.
- **Theory engine as the gate between LLM and score (Architecture §"Theory Engine")** — keep routing
  every assistive-AI output (drummer, strum, reharmonize) through it.
- **Local-first / no telemetry on musical content** — every Track here was designed to preserve it.

---

## Priority order for the fixes

1. **§1 Trust** (stop silent stub successes) — do immediately; it's a few hours and protects the
   product's soul.
2. **§2 Sound** (sfizz.wasm) — unblocks the whole audible roadmap.
3. **§3 Data model** (schema-only extension) — cheap insurance before Tracks B/C.
4. **§5A test corpus** — de-risks Track A.
5. **§4 backend hygiene** + **§6 doc drift** — housekeeping; bundle into the next milestone.
6. **§5B incremental render** — spec now, build in Phase 2.
