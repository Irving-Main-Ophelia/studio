# ADR-0019 — Guitar Pro import via alphaTab (import-only); OSMD stays the single renderer

- **Status:** Accepted, June 28, 2026
- **Phase:** 4 — M4.0 (A7 — Guitar Pro import)
- **Relates to:** ADR-0004 (OSMD notation), ADR-0015 (OSMD display / music21 edit).

## Context

The maintainer owns Guitar Pro files (`.gp`, `.gpx`, `.gp5`, older GP3–5). Opening them in
Stockhausen is a Track-A Definition-of-Done item (`GUITAR_PRO.md` §2.6). Two libraries can read them:

- **alphaTab** (`@coderline/alphatab`, MPL-2.0) — a cross-platform **renderer + player + parser** for
  Guitar Pro 3–8, MusicXML, and its own alphaTex. It is **not an editor**. *(It can serialise: 1.8 ships
  an `exporter.Gp7Exporter` and an `AlphaTexExporter` — but no MusicXML exporter, and we are not building
  a GP-writing feature; see point 4.)*
- **OSMD** (already shipped, ADR-0004) — renders MusicXML (incl. tablature, bends, glissandi) via
  VexFlow. Also display-only; our edits go through music21 → reload (ADR-0015).

The risk (`GUITAR_PRO.md` §3, TRACK_A §A.6): adopting alphaTab as a *second renderer* forks the
display layer — two engines, two sets of rendering bugs, two playback paths.

## Decision

**alphaTab is an importer only. OSMD remains the one and only canonical renderer.**

1. **Import path.** alphaTab parses `.gp/.gpx/.gp5` into its `Score` model in the frontend; we convert
   that model to **MusicXML** and hand it to the existing import pipeline (the same entry point a
   `.musicxml` file uses). From that point on the file is an ordinary Stockhausen score: rendered by
   OSMD, edited via music21, played by our `Engine`/`Sampler`.
2. **No second renderer in the canonical view.** alphaTab never draws the score the maintainer edits.
3. **Optional preview only.** alphaTab's own renderer/player *may* be offered as a throwaway
   pre-conversion **preview** of an imported file (a "this is what we're about to import" pane). It is
   never the editable surface and holds no state after conversion.
4. **No user-facing `.gp` export.** Although alphaTab *can* write GP7 (`Gp7Exporter`), exporting `.gp`
   is low-value for a local-first personal tool, and MusicXML is the interchange truth (North Star §6.3).
   The exporter is used internally only to mint a binary `.gp` **test fixture** for the import round-trip
   test. Revisit a user-facing export only on a concrete collaborator demand. (Matches `GUITAR_PRO.md`
   §2.6 / §4; corrects its "cannot write" wording.)

### Conversion boundary

alphaTab's model → MusicXML conversion is the only new, non-trivial surface. It runs in the frontend
(alphaTab is JS) and emits standard `score-partwise` MusicXML — staves, measures, notes, and the
guitar `<technical>` elements (`<string>`, `<fret>`, hammer-on/pull-off, bend, harmonic) the edit
corpus (M3.5.3) already proves the pipeline survives. Coverage is **incremental**: notes + rhythm +
tunings + the core articulations first; exotic effects degrade to plain notes with a logged warning
(honest-stub convention, ADR-0017), never a silent drop.

## Consequences

- The whole Guitar Pro file ecosystem opens in Stockhausen without a display fork or a write-format
  liability.
- One renderer (OSMD), one edit path (music21), one source of truth (MusicXML in `ScoreEngine`) —
  ADR-0015 stays intact.
- alphaTab is a frontend dependency (`apps/desktop`); its synth/player assets are only loaded for the
  optional preview, not the main view.
- Imperfect GP features surface as visible warnings, not silent data loss.
- Tests: a small `.gp`→MusicXML conversion fixture asserts notes/measures/tunings/core-`<technical>`
  survive into the import pipeline.

## Key files

| Area | Path |
|------|------|
| alphaTab dependency | `apps/desktop/package.json` (`@coderline/alphatab`) |
| GP import + model→MusicXML | `apps/desktop/src/notation/guitarpro/` (A7) |
| Import entry point (shared with MusicXML) | `apps/desktop/src/lib/ScoreEngine.tsx` |
| Canonical renderer (unchanged) | `apps/desktop/src/notation/ScoreView.tsx` |
