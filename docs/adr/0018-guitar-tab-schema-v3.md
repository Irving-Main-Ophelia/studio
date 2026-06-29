# ADR-0018 — `project.json` schema v3: per-part guitar metadata (tuning / capo / view) + v2→v3 migrator

- **Status:** Accepted, June 28, 2026
- **Phase:** 4 — M4.0 (Tab view) / M4.2 (Tunings & capo)
- **Supersedes:** nothing. Extends schema v2 (ADR-0016).

## Context

Phase 4 (Tablature & Guitar-Centric Notation) needs to store, per part, the things a guitarist's
notation depends on but standard MusicXML metadata doesn't carry in `project.json`:

- **Tuning** — the pitch of each open string (standard EADGBE, drop D, DADGAD, 7/8-string, custom).
- **Capo** — the fret the capo clamps; tab fret numbers are read relative to it.
- **Profile** — nylon / steel / electric / bass / custom (drives default tuning and, later, sound).
- **View mode** — whether the part renders as `staff`, `tab`, or `both` (Track A, A1).

Schema v2 (ADR-0016) reserved the *DAW* shapes (sends/inserts/buses/automation/clips/markers) but
deliberately left guitar out (it was Phase-4 scope — see `PHASE_3_5.md` §3.5.9). `InstrumentationEntry`
is `{ id, instrument, channel }` with no room for any of the above. Building the tab UI first and
extending the schema later would make every existing project pay a migration tax — the same argument
ADR-0016 made for the DAW shapes.

## Decision

Bump `SCHEMA_VERSION` **2 → 3** and add an **optional** `guitar` block to each instrumentation entry.
A part without a `guitar` block is a non-fretted part and renders as standard staff (today's behaviour).

```jsonc
{
  "schema_version": 3,
  "instrumentation": [
    {
      "id": "guitar",
      "instrument": "guitar",
      "channel": 0,
      "guitar": {                         // optional; absent ⇒ non-fretted part
        "tuning": ["E4","B3","G3","D3","A2","E2"],  // string 1 (highest) → N; pitch names
        "capo": 0,                        // fret; 0 = none
        "profile": "nylon",               // nylon | steel | electric | bass | custom
        "view_mode": "both"               // staff | tab | both
      }
    }
  ]
}
```

`tuning` is an **array of string pitches** so N-string instruments (bass, 7/8-string) are *data, not
code* — the fret model and fretboard component iterate the array. `string 1` is the highest-pitched
(thinnest) string, matching MusicXML `<string>` numbering.

The Rust shape (`src-tauri/src/persistence.rs`):

```rust
pub struct GuitarConfig {
    pub tuning: Vec<String>,   // string pitches, string 1 (highest) first
    pub capo: u8,              // fret; 0 = none
    pub profile: String,       // nylon | steel | electric | bass | custom
    pub view_mode: String,     // staff | tab | both
}
// on InstrumentationEntry:
#[serde(default, skip_serializing_if = "Option::is_none")]
pub guitar: Option<GuitarConfig>,
```

`skip_serializing_if = "Option::is_none"` keeps non-guitar parts **byte-identical** across re-saves
(no empty `guitar: null` noise), preserving the byte-stability guarantee ADR-0016 established.

### On-load migrator (`migrate_meta`)

v2 → v3 needs **no field transforms** — `guitar` is purely additive and defaults to `None`. The
existing stepwise migrator already stamps any `schema_version < SCHEMA_VERSION` up to current, so a v1
*or* v2 project upgrades on open and `project.json` is rewritten atomically (write-tmp → fsync →
rename). A v1 project upgrades straight to v3 in one stamp (all intermediate changes are additive).

### What does *not* change

- Non-guitar parts are unaffected: no `guitar` block, staff view, byte-stable.
- The canonical score (`score.musicxml`) is **not** where tuning/capo/view live — those are part
  *metadata* in `project.json`. The tab *rendering* derives `<string>/<fret>` on demand (the backend
  tab projection, A1), keeping one source of truth (ADR-0015): edits stay in standard MusicXML.

## Consequences

- Phase 4's A1/A2/A3 read/write tuning/capo/profile/view from one place; the fretboard (A4) and
  chord/scale engines (A5/A6) consume the same `tuning` array.
- Opening a v1/v2 project upgrades it losslessly; non-guitar data stays byte-stable across re-opens.
- A project saved by a newer build (schema ahead) still fails closed with a clear message (unchanged).
- Tests: extend `persistence.rs` with `migrates_v2_project_to_v3_and_round_trips_guitar_config`
  alongside the existing v1→v2 and reject-newer guards.

## Key files

| Area | Path |
|------|------|
| Schema structs + `SCHEMA_VERSION` | `apps/desktop/src-tauri/src/persistence.rs` |
| Migrator | `persistence.rs::migrate_meta` |
| Tab projection (consumes tuning/capo) | `backend/agent/app/tools/tab_projection.py` (A1) |
