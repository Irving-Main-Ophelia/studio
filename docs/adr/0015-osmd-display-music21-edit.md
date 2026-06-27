# ADR-0015 — Notation editing: OSMD for display, music21 for mutation

- **Status:** Accepted, June 27, 2026
- **Phase:** 1 — M1.7 (imported-score mouse editing)
- **Supersedes:** ADR-0004 §Consequences (line "Live editing works against the OSMD `MusicSheet` tree")

## Context

Phase 1 shipped keyboard/MIDI note entry and score-wide transposition. The maintainer also needs **Word-like editing on imported MusicXML** (e.g. a ~900 KB lead sheet): double-click / right-click a note, change pitch, duration, articulation, dynamics; vertical drag for semitone transpose.

OpenSheetMusicDisplay (OSMD) 1.9.9 is a **renderer**, not an editor. Its internal `MusicSheet` / graphic tree is useful for hit-testing and playback cursor sync, but **must not be treated as the source of truth for edits**.

Early implementation painted selection chrome (highlight boxes, context menus, drag previews) on top of the SVG without reliably mutating canonical MusicXML — the score *looked* interactive but behaved like a static image.

## Decision

**Two-layer notation edit pipeline:**

1. **Display layer (frontend, OSMD + VexFlow SVG)**
   - `ScoreView` owns an OSMD mount node exclusively; React overlays are **siblings**, never children of the OSMD container (OSMD `render()` destroys foreign DOM).
   - `EditLayer` attaches pointer listeners to the scroll container; hit-testing walks OSMD's graphic tree (`osmdHitTest.ts`) and/or stamped SVG attributes (`osmdAnnotate.ts`).
   - Visual feedback only: selection highlight, pitch-drag preview label, `NoteEditMenu`.

2. **Mutation layer (local FastAPI + music21)**
   - Every edit is a single POST under `/score/edit/*` that takes the **current MusicXML string**, applies one operation via `backend/agent/app/tools/score_edit.py`, and returns **new MusicXML**.
   - The frontend commits that string to `ScoreEngine` state immediately (`applyEditOp`), then calls `osmd.clear(); osmd.load(xml); osmd.render()`.
   - Playback metadata (`/score/notes` extract) refreshes in the **background** and must **never roll back** a successful edit.

3. **Coordinate resolution (critical bridge)**
   - OSMD graphic timestamps and music21 `beat_offset` (quarter-note beats within the measure) are **not the same coordinate system**.
   - OSMD `part_index` from `Sheet.Instruments` may **not** match music21 `score.parts` order (multi-staff piano, imported scores).
   - Before any edit API call, resolve the clicked note to authoritative coordinates via:
     - `POST /score/edit/note/resolve` (`find_note_by_hint`: measure + pitch + beat hint), and/or
     - `list_notes` index match in `noteResolve.ts` (measure + pitch + nearest beat, part index is a soft signal only).

## Product / UX rules (this session)

- **English only** in UI strings, errors shown in the score viewport, and code.
- **Technical failures → browser console** (`engineLog.ts`), not overlaid on the score (except short human edit errors like "No note found at beat …" in `EditorStatusBar`).
- **No optimistic rollback** on slow `extractNotes` for large scores — the edited MusicXML is canonical once the edit endpoint returns 200.
- **Editing enabled whenever MusicXML is loaded**, not only when a project folder is open (`ScorePane`: `editEnabled={Boolean(engine.score?.musicxml)}`).
- **Privacy:** edit payloads stay local; no logging of MusicXML content beyond the immediate tool call.

## Consequences

- ADR-0004 remains correct for *rendering*; editing does **not** mutate OSMD's tree in place.
- Imported-score mouse editing is **not done** until end-to-end verify: click → resolve → edit API → OSMD re-render shows the change on real files (Chan Cil scale).
- Future work: stable note IDs in MusicXML or a sidecar index to avoid re-resolving by measure/beat/pitch on every click.
- Tests: `noteResolve.test.ts`, `test_score_edit.py::test_resolve_note_by_hint_wrong_part`; still missing browser e2e on large imports.

## Key files

| Area | Path |
|------|------|
| Pointer / menu / drag | `apps/desktop/src/notation/EditLayer.tsx` |
| OSMD hit test | `apps/desktop/src/notation/osmdHitTest.ts` |
| SVG stamp + annotation | `apps/desktop/src/notation/osmdAnnotate.ts` |
| Coordinate match | `apps/desktop/src/notation/noteResolve.ts` |
| Render + reload | `apps/desktop/src/notation/ScoreView.tsx` |
| Edit commit | `apps/desktop/src/lib/ScoreEngine.tsx` (`applyEditOp`, `resolveNoteForApi`) |
| Backend ops | `backend/agent/app/tools/score_edit.py` |
| Resolve endpoint | `POST /score/edit/note/resolve` |
