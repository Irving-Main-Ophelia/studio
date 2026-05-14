# Parking Lot

Ideas that surface during Phase-1 work but belong to Phase 2 or 3. We log
them here so they're not lost; we **do not** implement them.

Format: one bullet per item. Each carries the milestone where it surfaced
and a one-line note about why it was deferred.

---

- **Mouse note-entry (M1.1, deferred).** Click a staff line/space to insert a
  note. Requires an OSMD selection layer (Bounding-Box → coordinate → pitch)
  that overshoots the M1.1 budget. Keyboard + MIDI cover the workflow today;
  revisit once the theory engine in M1.3 gives us pitch-by-coordinate.
- **Lasso & range selection (M1.1, deferred).** Multi-note selection,
  cut/copy/paste, all-of-pitch-class. Belongs in the same OSMD-overlay PR as
  mouse entry.
- **Slurs and crescendo/diminuendo hairpins (M1.1, deferred).** Both rely on
  multi-note selection, which we don't yet have. The agent in M1.4 will
  still be able to add them through `score.add_slur` / `score.add_hairpin`
  proposed-as-diff tools.
- **Voice splitting per staff (M1.1, deferred).** Backend accepts a `voice`
  parameter; UI currently keeps everything on voice 1. Real multi-voice UX
  needs a voice selector — Phase 2.
- **Cross-staff beaming (M1.1, deferred).** Belongs with multi-voice grand
  staff piano UX.
- **sfizz.wasm AudioWorklet sampler (M1.2, deferred).** The engine swap is
  abstracted; ships when the maintainer downloads VSCO 2 CE.
- **Rubber Band GPL FFI implementation (M1.2, deferred).** Scaffold + Tauri
  command shipped. Real C++ link drops in behind the same surface.
- **Per-track output meters in the mixer (M1.2, deferred).** Need AnalyserNodes
  per channel; slipping to M1.5 polish.
- **`score.reharmonize` real implementation (M1.4, deferred to Phase 2).** Today
  ships as an empty-diff stub with a `phase1_stub` warning. The tool surface +
  ScoreDiff contract is locked (ADR-0012), so the body swap is local. Needs
  chord-substitution + voice-leading rewrite.
- **`score.add_section` generator integration (M1.4, deferred to Phase 2).** Same
  shape: stub today, Anticipatory Music Transformer / Moonbeam integration on
  Modal arrives in Phase 2 (NORTH_STAR §6 roadmap).
- **`theory.analyze_form` real form analysis (M1.4, deferred to Phase 2).** Today
  returns a single `undivided` section. Real period/phrase/section detection
  needs a dedicated analyzer + ground-truth fixtures.
- **Stale-diff UI prompt (M1.4, partial).** The diff already carries
  `base_score_hash`; the M1.4 UI does not yet detect a mismatch and prompt
  "this proposal is based on an older version". Land in M1.5 polish.
