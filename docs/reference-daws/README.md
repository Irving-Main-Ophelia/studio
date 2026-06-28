# Reference DAWs — Teardown & Capability Plan

> **Purpose.** Stockhausen's North Star (`NORTH_STAR.md` §0) says we fuse three worlds:
> a **DAW** (Pro Tools / Logic rigor), a **notation editor** (Sibelius / Dorico class), and a
> **conversational co-composer**. This folder studies the three reference products closest to those
> worlds — **GarageBand**, **Guitar Pro**, and **Pro Tools** — feature by feature, decides what to
> **adopt / adapt / skip**, names the **tools and libraries** that get us there, and lists what we
> are currently **doing wrong** and must refine or eradicate.
>
> **Status:** Draft v1 (June 27, 2026). These docs are written to be *elaborated in successive
> chats*, exactly like the `docs/phases/PHASE_*.md` files. Nothing here is implemented yet; this is
> the planning substrate.

---

## How to read this folder

| Doc | What it is |
|---|---|
| [`GARAGEBAND.md`](./GARAGEBAND.md) | Teardown of GarageBand: feature inventory, what we have/lack, what to steal/skip, recommended tech. |
| [`GUITAR_PRO.md`](./GUITAR_PRO.md) | Teardown of Guitar Pro — the most strategically important reference, because Stockhausen is **guitar-first**. |
| [`PRO_TOOLS.md`](./PRO_TOOLS.md) | Teardown of Pro Tools: the audio-DAW half (recording, editing, comping, mixing, routing, automation). |
| [`GAP_MATRIX.md`](./GAP_MATRIX.md) | One master table: **capability × reference app × our status × build/buy/integrate × target phase**. |
| [`REFINE_AND_ERADICATE.md`](./REFINE_AND_ERADICATE.md) | What we already built that is wrong, weak, or drifting — concrete fixes, backend **and** frontend. |
| [`tracks/`](./tracks/) | Five phase-style **capability tracks** (A–E) — the new workstreams these teardowns imply, ready to elaborate. |

Each teardown uses the same verdict vocabulary:

- **ADOPT** — build it; it advances a Pillar and respects the non-goals.
- **ADAPT** — build a composition-first version of it (not a literal copy).
- **SKIP** — explicitly out of scope per `NORTH_STAR.md` §5 (Non-Goals). We name *why*, so we don't relitigate it.

---

## Methodology

1. Read the North Star, the four phase docs, the ADRs, and the live code surface
   (`backend/agent/app/`, `apps/desktop/src/`, `packages/theory/`).
2. Tear down each reference product from current public documentation (June 2026). Sources are
   linked at the foot of each teardown doc.
3. For every feature, assign a verdict and a target phase, **measured against the North Star
   non-goals** — we are composition-first, not a mixing/post house and not an engraving house.
4. Roll everything into [`GAP_MATRIX.md`](./GAP_MATRIX.md) and the five capability tracks.

The single most important framing rule: **we never copy a feature just because a reference app has
it.** Pro Tools has a thousand features for audio-post workflows we will never touch. We adopt only
what serves *a composer sitting with an instrument, thinking out loud, shaping a score.*

---

## The six headline findings

These are the decisions that matter most. Each is argued in the linked doc.

1. **Tablature is our biggest unforced omission.** The entire product premise is "sit with a guitar"
   (Pillars 3, 4, 10), yet we render standard notation only. **OSMD — the renderer we already ship —
   already renders guitar tablature from MusicXML, including bends and glissandi.** Closing this is
   cheap and unlocks the guitar-first identity. → [`GUITAR_PRO.md`](./GUITAR_PRO.md),
   [`tracks/TRACK_A_tablature_guitar.md`](./tracks/TRACK_A_tablature_guitar.md).

2. **The "DAW" half is mostly missing.** We have a notation editor and a 4-knob mixer. We have **no
   audio-clip recording/editing, no comping/playlists, no clip gain, no elastic-audio warp UI, no
   automation lanes, no buses/sends/inserts.** Pro Tools is the map for the subset we should adapt.
   → [`PRO_TOOLS.md`](./PRO_TOOLS.md), [`tracks/TRACK_B_audio_workstation.md`](./tracks/TRACK_B_audio_workstation.md),
   [`tracks/TRACK_C_mixing_routing.md`](./tracks/TRACK_C_mixing_routing.md).

3. **Our sound is a Phase-0 stopgap.** Playback is still `smplr` SplendidGrandPiano. Until
   `sfizz.wasm` + a real sample set lands, every multi-instrument feature (orchestration,
   world-music packs, Guitar Pro's RSE-equivalent) is blocked. This is the highest-leverage piece of
   plumbing. → [`tracks/TRACK_D_instruments_tone.md`](./tracks/TRACK_D_instruments_tone.md).

4. **Guitar tone is a new, in-scope frontier.** GarageBand's amps/pedalboard and Guitar Pro's RSE
   both say a guitar-first tool needs *believable guitar sound*. The open-source answer in 2026 is
   **Neural Amp Modeler (MIT)** + **GuitarML/RTNeural**. This is genuinely new vs. our roadmap.
   → [`GARAGEBAND.md`](./GARAGEBAND.md), [`tracks/TRACK_D_instruments_tone.md`](./tracks/TRACK_D_instruments_tone.md).

5. **GarageBand's "Drummer" is the model for assistive accompaniment** — and the open path is
   **Magenta (GrooVAE / Drumify / MusicVAE)** plus our own agent. This complements, not competes
   with, the co-composer. → [`tracks/TRACK_E_assistive_ai.md`](./tracks/TRACK_E_assistive_ai.md).

6. **We are advertising tools we can't deliver.** `score.reharmonize`, `score.add_section`, and
   `theory.analyze_form` are stubs that return empty diffs — the agent claims competence it lacks,
   which violates the North Star's "theory rigor" principle. Plus several Phase-2/3 routes
   (`orchestration`, `style`, `practice`, `multi_agent`) are wired into `main.py` ahead of being
   real. → [`REFINE_AND_ERADICATE.md`](./REFINE_AND_ERADICATE.md).

---

## How these map onto the phase roadmap

**Decision (maintainer, June 27, 2026): the tracks become new numbered phases (Phase 4+).** The
teardowns do **not** rewrite Phases 0–3; they add new phases after them. Proposed numbering — to be
ratified and reconciled with existing Phase-2/3 overlap in successive chats:

| New phase | Source | Theme |
|---|---|---|
| **Phase 3.5 — Foundation Hardening** ⭐ *first* | [`REFINE_AND_ERADICATE.md`](./REFINE_AND_ERADICATE.md) §1,§3,§4,§6 + [Track D](./tracks/TRACK_D_instruments_tone.md) D1/D2/D6 | **Trust fix** (no silent stub successes) + **`sfizz.wasm`/real WAV** + data-model schema prep + edit-pipeline test corpus |
| **Phase 4 — Tablature & Guitar-Centric Notation** | [Track A](./tracks/TRACK_A_tablature_guitar.md) | tab+staff view, guitar articulations, tunings, fretboard, chord/scale engine, GP import |
| **Phase 5 — Audio Workstation Layer** | [Track B](./tracks/TRACK_B_audio_workstation.md) | audio/MIDI recording, clip editing, comping, clip gain, warp, fades, markers |
| **Phase 6 — Mixing & Signal Routing** | [Track C](./tracks/TRACK_C_mixing_routing.md) | buses/sends, inserts (WAM/Faust), automation lanes, groups, freeze |
| **Phase 7 — Instruments, Tone & Sound Library [adv.]** | [Track D](./tracks/TRACK_D_instruments_tone.md) (rest) | amp/cab modeling (NAM), loop browser, Smart Controls, world-music packs |
| **Phase 8 — Assistive / AI Creation, Practice & Learning** | [Track E](./tracks/TRACK_E_assistive_ai.md) | AI drummer, strum/arpeggiate, groove/humanize, speed trainer, tuner, practice coach |

**The first focus (maintainer's choice): Phase 3.5 — Foundation Hardening.** It is deliberately
numbered *3.5*, not 4, because trust + sound are **foundational** — they finish what Phase 1 (M1.2)
and the agent contract started, and everything else (Phases 4–8) is mute and untrustworthy until
they land. The next chat fully specs Phase 3.5 as a proper `docs/phases/PHASE_3_5.md`.

> **Reconciliation — DONE (June 27, 2026).** Existing Phase 2 (guitar, orchestration, recording) and
> Phase 3 (style, multi-agent, practice) overlap these tracks. The per-item crosswalk
> (supersede / absorb / split / depends-on), the recommended dependency-driven execution order, and
> three open decisions live in **[`RECONCILIATION.md`](./RECONCILIATION.md)**. Non-destructive
> cross-reference banners were added to `docs/phases/PHASE_2.md` and `PHASE_3.md`.

---

## Guardrails carried from the North Star

Every recommendation in this folder already passed these filters:

- **Composition-first.** Non-goal §5.1/§5.4: not a live-performance rig, not an engraving house. We
  borrow audio editing only insofar as it serves capturing and shaping a *composition*.
- **Local-first, private.** No feature here adds cloud sync or telemetry on musical content
  (`CLAUDE.md` Privacy).
- **Theory rigor over novelty.** Assistive AI still routes through the theory engine; it proposes,
  the human disposes (North Star §2).
- **English everywhere in product surfaces; Spanish only inside agent system prompts** (`CLAUDE.md`
  Language rule). These docs are in English.
