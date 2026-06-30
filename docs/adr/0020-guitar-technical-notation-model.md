# ADR-0020 — Guitar technical-notation model: `<technical>`/`<notations>` ↔ Operation ↔ agent tool

- **Status:** Accepted, June 29, 2026
- **Phase:** 4 — M4.1 (A2 — Guitar articulations, read/write)
- **Relates to:** ADR-0015 (OSMD display / music21 edit), ADR-0017 (tool-honesty), ADR-0018 (schema v3),
  ADR-0019 (alphaTab import-only).

## Context

M4.1 (A2) is the long pole of Phase 4: author and edit the core guitar articulation set —
bend, slide, hammer-on, pull-off, palm mute, let ring, vibrato, natural/artificial harmonics,
dead/ghost notes, strum direction — by hand **and** via the agent, with every technique surviving the
`resolve → edit → reload` round-trip (PHASE_4 §4.2 A2, §4.9 risk #1).

Two facts constrain the model:

1. **MusicXML encodes these in two grammatically different shapes.** Most live inside
   `<note><notations><technical>` (`<bend>`, `<harmonic>`, `<hammer-on>`, `<pull-off>`, `<string>`,
   `<fret>`); a few live under `<articulations>` or `<ornaments>` (`<other-articulation>` for palm
   mute, `<wavy-line>`/`<vibrato>`); spans (palm mute, let ring, slide) carry `type="start"|"stop"`,
   exactly like `<tie>` and `<slur>` already do in the codebase.

2. **music21 already models the whole set**, but splits it across two object kinds:
   - **Point articulations** (attach to *one* `Note`, live in `note.articulations`):
     `articulations.FretBend` (`<bend>` + `<bend-alter>`/`<pre-bend>`/`<release>`),
     `articulations.StringHarmonic` (`harmonicType` natural/artificial),
     `articulations.StringIndication` / `FretIndication`, `articulations.Stress`/dead-note markers.
   - **Spanners** (connect *two* notes, live at part/score level):
     `articulations.HammerOn` and `articulations.PullOff` subclass `spanner.Spanner`, and serialise to
     `<hammer-on type="start">…</hammer-on>` on note A + `<hammer-on type="stop"/>` on note B. Slides
     (`spanner.Glissando`/`<slide>`) and the palm-mute/let-ring brackets are the same shape.

Empirically verified (June 29, against music21 9.3, the M3.5.3 corpus fixture, and our `_serialise`):

| Authoring call | Serialises to | Re-parses to |
|---|---|---|
| `FretBend(bendAlter=ChromaticInterval(2))` on a note | `<bend><bend-alter>2</bend-alter></bend>` | `FretBend` in `note.articulations` |
| `FretBend(..., preBend=True, release=0.5)` | `<bend>…<pre-bend/><release offset=…/></bend>` | same |
| `HammerOn(noteA, noteB)` inserted at part level | `<hammer-on type="start">H</hammer-on>` / `<hammer-on type="stop"/>` | `HammerOn` spanner |
| corpus fixture `<hammer-on>` start/stop pair | — | `HammerOn` spanner (removable by `getFirst() is note`) |

`_serialise` (which round-trips through `score.write("musicxml")`) preserves spanners, so the ADR-0015
pipeline can carry them without a special export path.

## Decision

**Keep ADR-0015 intact: the canonical edit path is the music21 pipeline; OSMD only renders.** Guitar
techniques become first-class members of that pipeline, addressed exactly like every other edit — by a
single `(part_index, measure_number, beat_offset, voice)` cursor resolved through
`POST /score/edit/note/resolve`. We do **not** fork in a second annotator; the existing ElementTree
batch injector (`stockhausen_theory.guitar.apply_techniques`, the old `guitar_add_techniques` agent
tool) stays as a coarse bulk helper, but new single-technique edits go through `score_edit.py` so there
is one round-trip-tested source of truth.

### 1. Two op families, by MusicXML grammar — not by "how many notes the guitarist clicks"

- **Point techniques** — one note, one cursor. New `/score/edit/technical/*` endpoints, parallel to
  `/score/edit/articulation/toggle`. A point technique is either a **valueless toggle** (vibrato,
  natural/artificial harmonic, dead/ghost) added to a `ALLOWED_TECHNICALS` map the same way
  `ALLOWED_ARTICULATIONS` works, or a **valued set** (bend, with `bend_alter`/`pre_bend`/`release`)
  that needs its own endpoint because it carries parameters and `bend_alter == 0` means "remove".

- **Span / connective techniques** — start/stop across notes. Follow the existing
  `/score/edit/tie/set` `start|stop|continue|none` discipline:
  - **Connective** (hammer-on, pull-off, slide): the *guitarist clicks the start note*; the edit
    attaches the spanner from that note to the **immediately following note** in performance order
    (next note in the same voice; else the first note of the next measure). The op is still addressed
    by a single cursor — the "two-note-ness" is an implementation detail, not a second click. This is
    why the maintainer's plan lists hammer-on/pull-off under "point": the *authoring gesture* is one
    note, even though the *data* is a span.
  - **Bracketed span** (palm mute, let ring, rake): a `start` cursor and a `stop` cursor, mirroring a
    tie chain — deferred to the M4.1 span subset.

### 2. Every technique is an Operation with an inverse

The edit pipeline does not build `Operation` objects server-side (ADR-0015): the **route returns new
MusicXML**, and the *caller* journals the op.

- **Hand-edit path:** the frontend mirrors the new MusicXML into `OperationLog` via
  `buildScoreReplaceOp(previous, next)` inside `applyEditOp` — a replace-op whose inverse is "restore
  `previous`". Undo/redo already travels this journal; technique edits get it for free.
- **Agent path:** each technique is wrapped in a `ScoreDiff` via `build_replace_op(previous, next)`
  (`app/agent_tools.py`), identical to every other score-mutating tool. The inverse is the captured
  `previous_musicxml`. The agent tools call the **same** `score_edit.py` functions the routes do.

### 3. Agent tool surface

One agent tool per technique *family*, parameterised the way the routes are (matching how `tie/set` is
one endpoint over four tie types):

- `guitar_bend` — set/clear a bend on a note (`bend_alter`, `pre_bend`, `release`).
- `guitar_connect` — set/clear a connective technique (`technique: hammer_on|pull_off`, plus
  `slide` when the span subset lands) from a note to the next.

These live alongside the existing `guitar_*` tools; system prompts may be Spanish (CLAUDE.md exception).

### 4. Full core-set mapping (the M4.1 target; ✅ = landed in the first subset)

| Technique | Shape | MusicXML | music21 | Surface |
|---|---|---|---|---|
| **Bend** (target/pre-bend/release) ✅ | point (valued) | `<bend><bend-alter>` | `FretBend` | `/technical/bend`, `guitar_bend` |
| **Hammer-on** ✅ | connective | `<hammer-on start/stop>` | `HammerOn` spanner | `/technical/connect`, `guitar_connect` |
| **Pull-off** ✅ | connective | `<pull-off start/stop>` | `PullOff` spanner | `/technical/connect`, `guitar_connect` |
| Natural / artificial harmonic | point (toggle) | `<harmonic><natural/></harmonic>` | `StringHarmonic` | `ALLOWED_TECHNICALS` |
| Vibrato | point (toggle) | `<wavy-line>`/`<vibrato>` | `expressions`/`TremoloSpanner` | `ALLOWED_TECHNICALS` |
| Dead / ghost note | point (toggle) | `<notehead>x` + `<technical>` | note-head + marker | `ALLOWED_TECHNICALS` |
| Strum / brush direction | point (toggle) | `<arrow>`/`<technical>` | `articulations` | `ALLOWED_TECHNICALS` |
| Slide (legato/shift) | connective | `<slide start/stop>` | `Glissando` spanner | `/technical/connect` |
| Palm mute | bracketed span | `<other-articulation>` start/stop | direction span | `/technical/span` (tie pattern) |
| Let ring | bracketed span | `<other-articulation>` start/stop | direction span | `/technical/span` (tie pattern) |

### 5. Render seam (ADR-0019 risk)

OSMD draws what it can (bend arrows, `H`/`P` glyphs); for glyphs OSMD cannot draw we fall back to the
standard-staff articulation and **track the gap** rather than forking the renderer. Notation is the
goal this phase; *audible* bend/palm-mute voicing is Phase 7 (Track D) — the seam is documented in
PHASE_4 §4.10.

## Consequences

- The first subset (bend + hammer-on + pull-off) ships now, de-risked by the M3.5.3 corpus, which
  already round-trips exactly these elements. Each gets a fixture-backed `resolve → edit → reload` test.
- Remaining core-set members extend the same two endpoints / `ALLOWED_TECHNICALS` map per ADR §4 — no
  new architecture, only vocabulary.
- The old `guitar_add_techniques` batch tool is **not** removed (it still serves "annotate many notes
  at once"), but it is no longer the path single edits or the frontend take; divergence risk is noted.
- Tests: `tests/test_edit_corpus.py` (new technical round-trip cases) + `fixtures/guitar_hopo_bend.musicxml`.

## Key files

| Area | Path |
|------|------|
| music21 technique ops | `backend/agent/app/tools/score_edit.py` (`set_bend`, `set_connective_technique`) |
| Routes | `backend/agent/app/routes/score_edit.py` (`/score/edit/technical/{bend,connect}`) |
| Agent tools | `backend/agent/app/agent_tools.py` (`guitar_bend`, `guitar_connect`) |
| Frontend api + engine | `apps/desktop/src/lib/api.ts`, `apps/desktop/src/lib/ScoreEngine.tsx` |
| Edit affordances | `apps/desktop/src/notation/NoteEditMenu.tsx` (+ EditLayer/NoteEditToolbar/ScoreView) |
| Corpus | `backend/agent/tests/test_edit_corpus.py`, `tests/fixtures/guitar_hopo_bend.musicxml` |
