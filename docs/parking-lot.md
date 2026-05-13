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
