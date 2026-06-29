# Edit-pipeline test corpus (M3.5.3 / Workstream D)

Real-world MusicXML shapes the imported-score edit pipeline (ADR-0015) must survive.
`tests/test_edit_corpus.py` runs the full `resolve → /score/edit/* → reload` path against
each file and asserts it round-trips without the silent failures that bit us on June 27, 2026.

| File | Exercises | Why it's here |
|------|-----------|---------------|
| `multi_voice_backup.musicxml` | `<backup>` + two `<voice>`s | The exact June-27 bug: notes in Voice sub-streams, `measure.notesAndRests == []`. Regression lock. |
| `piano_grand_staff.musicxml` | `<staves>2</staves>` + per-note `<staff>` | part_index ↔ staff mapping for imported piano. |
| `cross_staff.musicxml` | one voice switching `<staff>` mid-measure | Cross-staff writing; the edit must keep a note's staff. |
| `tuplets.musicxml` | `<time-modification>` 3:2 triplet | Beat math under tuplets. |
| `guitar_technical.musicxml` | `<notations>/<technical>` (hammer-on/pull-off, bend, harmonic) | The Track-A / Phase-4 elements; de-risks tablature work. |

These are intentionally tiny and hand-authored so a failure points at one feature.
Add a row here when you add a fixture.
