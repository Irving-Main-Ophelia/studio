# Track E — Assistive / AI Creation, Practice & Learning

> **Status:** Draft skeleton (June 27, 2026). Elaborate in successive chats, phase-doc style.
> **Becomes:** **Phase 8** (maintainer decision, June 27, 2026 — see [`../README.md`](../README.md)).
> **Source teardown:** [`../GARAGEBAND.md`](../GARAGEBAND.md) (Drummer/Smart), [`../GUITAR_PRO.md`](../GUITAR_PRO.md) (Speed Trainer/tuner).
> **Why:** GarageBand's Drummer proves assistive accompaniment is a force multiplier; Guitar Pro's
> Speed Trainer proves practice tooling earns daily use. Both **complement** the co-composer agent —
> the agent orchestrates them, the theory engine keeps them honest (North Star §2).

---

## E.1 Goal

The maintainer, with a melody + chords, can get an editable, explainable **drum/bass/keys
accompaniment**, **strum or arpeggiate** a progression, **humanize** a stiff part, and **practice**
with a speed trainer and tuner — all routed through the agent and the theory engine, all undoable as
ScoreDiffs.

## E.2 Scope (workstreams)

- **E1 — AI drummer / auto-accompaniment.** Magenta **GrooVAE/Groove** + **Drumify** turn a
  melody/bassline rhythm into a groove; the agent picks the style and the theory engine validates the
  result. Output is editable MIDI (a real track), not a black-box loop. GarageBand-Drummer analogue.
- **E2 — Strum / arpeggiate.** Generate idiomatic guitar/keyboard patterns from a chord progression
  (ties to Track A's fret model). GarageBand Smart-Instruments analogue.
- **E3 — Groove / humanize.** Apply timing/velocity feel (Magenta Groove) or quantize-by-feel; a
  "Groove Track" that others follow. Keep the un-humanized version (two-track idea from
  Architecture §"Notation edit pipeline").
- **E4 — Speed Trainer.** Progressive tempo over loop repeats (10–300%, start/finish, step count) —
  drive from the Tone.js transport. Guitar Pro signature feature; small, beloved.
- **E5 — Tuner.** CPAL input + monophonic pitch (CREPE/pYIN) → a guitar tuner.
- **E6 — Practice Coach (Pillar 10).** Score a live performance vs. the target: pitch/rhythm/dynamics
  errors, difficulty heat-map, practice plan. (Phase 3.)
- **E7 — Arrangement helpers.** Agent tools that *propose-as-diff*: "add a bass line", "thicken with
  inner voices", "double the melody an octave up" — all through the theory engine + ScoreDiff
  envelope.

## E.3 Candidate tools

| Need | Tool | License | Notes |
|---|---|---|---|
| Drum groove / accompaniment | **Magenta GrooVAE/Groove, Drumify** (`@magenta/music`) | Apache-2.0 | Runs in-browser via TF.js, or on Modal. Editable MIDI out. |
| Melody/continuation | **Magenta MusicVAE / MusicRNN** | Apache-2.0 | Optional sketch helpers; agent-gated. |
| Symbolic generation (first draft) | **Anticipatory Music Transformer / Moonbeam** | open | Already in the roadmap (Modal); finishes `score.add_section`. |
| Humanize | **Magenta Groove** | Apache-2.0 | Timing/velocity feel. |
| Monophonic pitch (tuner/coach) | **CREPE / pYIN** (ONNX) | permissive | On-device; ties to Pillar 3 pipeline. |
| Validation gate | **stockhausen_theory** (shipped) | BSD | Every assistive output passes voice-leading/range checks. |

## E.4 Definition of Done (stub)

- [ ] From a melody + chords, generate an editable drum track; accept/reject/refine as a ScoreDiff.
- [ ] Strum/arpeggiate a progression into an editable guitar part.
- [ ] Humanize a quantized part; toggle between humanized and straight.
- [ ] Speed Trainer ramps tempo across loop repeats.
- [ ] Tuner reads guitar pitch from the interface.
- [ ] (P3) Practice coach scores a take and highlights misses.

## E.5 Phase placement

**E1–E5, E7 = Phase 2** (alongside the agent's growth to 30 tools). **E6 (practice coach) = Phase 3**
(it's Pillar 10). E4 (Speed Trainer) is small enough to pull into late Phase 1.

## E.6 Dependencies & risks

- **Depends on:** Track D sound (to hear the drummer/strum); the agent + ScoreDiff envelope
  (shipped); the theory engine (shipped).
- **Risk:** assistive output that's bland or wrong. Mitigation: route through the theory engine,
  present as a diff the human accepts/refines, never auto-apply (North Star §2; ADR-0012).
- **Risk:** Magenta is older TF.js; check it still runs on current toolchains, or run models on Modal
  and return MIDI. Don't block the track on the in-browser path.
- **Privacy:** practice-coach corrections and any on-device models stay local; never sent out
  (`CLAUDE.md` Privacy; North Star §5.6).

## E.7 Open questions for the maintainer

1. Is an AI drummer/accompaniment actually wanted, or does the agent + your own playing cover it?
2. Should assistive features live *inside* the chat agent (tools), as dedicated panels, or both?
3. Practice coach (Pillar 10) — real priority, or a nice-to-have you'd defer past v1?
