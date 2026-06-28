# Track A — Tablature & Guitar-Centric Notation

> **Status:** Draft skeleton (June 27, 2026). To be elaborated in successive chats, phase-doc style.
> **Becomes:** **Phase 4** (maintainer decision, June 27, 2026 — see [`../README.md`](../README.md)).
> **Source teardown:** [`../GUITAR_PRO.md`](../GUITAR_PRO.md) (primary), [`../GARAGEBAND.md`](../GARAGEBAND.md).
> **Why first:** Stockhausen is guitar-first (North Star §0; Pillars 3, 4, 10) yet renders standard
> staff only. OSMD — already shipped — renders tablature from MusicXML. Highest leverage ÷ cost.

---

## A.1 Goal

The maintainer can open, read, write, and play **guitar tablature** alongside standard notation, with
the full vocabulary a guitarist thinks in: tunings, capo, and the articulation set (bends, slides,
hammer-ons/pull-offs, palm mute, harmonics, vibrato, strums…). Guitar Pro files they already own
open in Stockhausen.

## A.2 Scope (workstreams)

- **A1 — Tab rendering.** Turn on OSMD tablature rendering; dual tab+staff view with a per-part
  toggle (staff / tab / both). Verify bends & glissandi render (OSMD supports them).
- **A2 — Guitar articulations (read/write).** Extend the music21 edit pipeline to emit/parse
  MusicXML `<technical>` + `<notations>`: bend, slide, hammer-on/pull-off, palm-mute, let-ring,
  vibrato, harmonics, dead/ghost notes, tap/slap/pop, strum direction. Each is an `Operation` in the
  log and an agent-callable edit.
- **A3 — Tunings, capo, multi-string.** Part-level tuning metadata (drop D, DADGAD, 7/8-string,
  custom); capo; fret-math that respells when transposed (ties to Pillar 2).
- **A4 — Fretboard / keyboard viewer.** React+SVG component synced to playhead + selection; shows
  scale shapes (A6) and chord voicings (A5).
- **A5 — Chord engine.** Generate chord diagrams/voicings algorithmically (music21 + fret model), not
  a static DB. Optional auto-diagrams above the staff with adjustable density (GP8-style).
- **A6 — Scale engine.** Scale viewer on the fretboard; ties into Theory Tutor (Pillar 8).
- **A7 — Guitar Pro import.** Integrate **alphaTab** (read-only) to parse `.gp/.gpx/.gp5` → convert
  to MusicXML → into the existing pipeline. Optionally use alphaTab's player as a pre-conversion
  preview.
- **A8 — Rhythmic/slash notation & chord charts.** Lead-sheet mode.

## A.3 Candidate tools

| Need | Tool | License | Notes |
|---|---|---|---|
| Tab render | **OSMD/VexFlow** (already shipped) | MIT/BSD | Renders tab + bends/glissandi from MusicXML. Primary. |
| GP file import | **alphaTab** `@coderline/alphatab` | MPL-2.0 | Reads GP3–8, MusicXML, alphaTex; **render/play only, cannot write GP**. Use as importer. |
| Articulation authoring | **music21** (backend, shipped) | BSD | Emits `<technical>`/`<notations>`. |
| Engraved PDF w/ tab | **Verovio** (shipped) | LGPL | Tab in PDF export. |

## A.4 Definition of Done (stub — elaborate later)

- [ ] Per-part view toggle: staff / tab / both, persisted in project.json.
- [ ] The core articulation set renders, round-trips through MusicXML, and is agent-editable.
- [ ] Custom tunings + capo affect fret numbers and transposition respelling.
- [ ] A `.gp5`/`.gpx`/`.gp` file imports and plays.
- [ ] Fretboard viewer follows playback; chord & scale lookups work.
- [ ] Edit-pipeline test corpus (see `../REFINE_AND_ERADICATE.md` §5A) covers guitar `<technical>`.

## A.5 Phase placement

Pulls forward from **Phase 2** (guitar). Tab rendering (A1) + import (A7) are cheap and could land in
a late-Phase-1 "guitar preview" milestone; the full articulation authoring (A2) and live-capture
integration belong with Pillar 3 in Phase 2.

## A.6 Dependencies & risks

- **Depends on:** the §5A import test corpus (de-risks `<technical>` parsing); Track D sound for
  audible playback of guitar techniques.
- **Risk:** OSMD's tab is render-only; all editing stays in music21 — confirm every articulation
  survives the resolve→edit→reload round-trip (the multi-voice bug in §1.17 was exactly this class).
- **Risk:** alphaTab and OSMD are two renderers; keep OSMD primary, alphaTab importer-only, to avoid
  a display fork.

## A.7 Open questions for the maintainer

1. Which tunings/instruments matter first (classical nylon? steel acoustic? electric? bass)?
2. Auto chord-diagrams above the staff: on by default, or opt-in per the GP8 density control?
3. Is `.gp` *export* ever needed (a collaborator who only uses Guitar Pro), or is MusicXML enough?
