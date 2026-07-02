# ADR-0021 — `project.json` schema v4: typed `audio_clips` + `markers` + v3→v4 migrator

- **Status:** Accepted, June 30, 2026
- **Phase:** 5 — M5.0 (Capture loop)
- **Supersedes:** nothing. Extends schema v3 (ADR-0018) / v2 (ADR-0016).

## Context

Phase 5 (Audio Workstation) is the first phase to write real audio data into `project.json`. Schema v2
(ADR-0016) **reserved** the `audio_clips` and `markers` slots as opaque empty arrays
(`Vec<JsonValue>`, "empty until Phase 5") precisely so this moment would not cost a migration tax. M5.0
now fills them:

- **B2 — clip model.** A clip is a *non-destructive* placement of a `takes/` recording on the timeline.
  The take file is immutable; a clip only *references* it. Trim/split/move/duplicate (M5.1) mutate the
  clip as `Operation`s, never the take.
- **B7 — markers.** Named song positions (memory locations) to recall/jump and loop between.

Opaque `Vec<JsonValue>` was the right shape while the fields were unused — it kept the format stable
without committing to a schema. Now that clips and markers have consumers (the capture loop, the
clip/marker UIs), the fields need typed shapes so Rust and the frontend agree on them and the round-trip
is checkable.

## Decision

Bump `SCHEMA_VERSION` **3 → 4** and promote the two reserved slots from `Vec<JsonValue>` to typed shapes.
Positions and lengths are in **seconds** (single clock; ADR-0010 / Tone.js), so the persisted format does
not couple to any sample rate.

```jsonc
{
  "schema_version": 4,
  "audio_clips": [                        // Track B — promoted from the reserved v2 slot
    {
      "id": "clip-a",
      "take_id": "take-001",              // a recording in takes/ (immutable)
      "offset": 0.0,                      // timeline start, seconds (what "move" edits)
      "length": 4.5,                      // clip duration, seconds
      "gain_db": -3.0,                    // per-clip gain in dB (B5); 0 = unity
      "fades": { "fade_in": 0.01, "fade_out": 0.25 }  // clip-edge fades, seconds (B3)
    }
  ],
  "markers": [                            // Track B — promoted from the reserved v2 slot
    { "id": "m1", "name": "Chorus", "position": 4.5 }  // song position, seconds
  ]
}
```

The Rust shapes (`src-tauri/src/persistence.rs`):

```rust
pub struct AudioClip {
    pub id: String,
    pub take_id: String,   // references a take in takes/; the take file is never mutated
    pub offset: f64,       // timeline start, seconds
    pub length: f64,       // clip length, seconds
    pub gain_db: f32,      // per-clip gain in dB (named to match MixerTrack/MixerMaster)
    pub fades: ClipFades,  // { fade_in, fade_out } in seconds
}
pub struct Marker { pub id: String, pub name: String, pub position: f64 }
```

**Field notes.**

- `offset` is the clip's start on the arrangement **timeline** — the field B2's "move" edits — not a
  source in-point into the take. For M5.0 a clip plays its take from the head; trimming the take's
  source in-point is a later, purely *additive* field (`#[serde(default)]`, no version bump).
- `gain_db` (not `gain`) matches the dB convention already used by `MixerTrack`/`MixerMaster`.
- `ClipFades` carries only `fade_in`/`fade_out` seconds; the crossfade *curve/shape* is a later additive
  concern (B3) and is deliberately omitted now.

### On-load migrator (`migrate_meta`)

v3 → v4 needs **no field transforms**. A v3 project wrote `audio_clips`/`markers` as `[]`, which
deserialises straight into an empty typed `Vec`; a v1/v2 project lacked them and `#[serde(default)]`
supplies the empty `Vec`. The existing stepwise migrator already stamps any `schema_version <
SCHEMA_VERSION` up to current and rewrites `project.json` atomically (write-tmp → fsync → rename), so an
older project upgrades on open — a v1 project jumps straight to v4 in one stamp. A project written by a
*newer* build (schema ahead) still fails closed with a clear message (unchanged).

### What does *not* change

- No take is mutated by any of this — clips only *reference* `takes/` files (Pillar 3: performance vs.
  notation). Non-destructive edits arrive as `Operation`s in M5.1.
- `automation`, `sends`, `inserts`, `buses`, `group` stay **reserved** `Vec<JsonValue>` for Phase 6
  (Track C) — Phase 5 does not touch them.
- The frontend `ProjectMeta` round-trips `meta` opaquely through `project_open` → `project_save`, so the
  typed fields survive even before a UI consumes them. The TS mirror (`project/types.ts`) adds
  `AudioClip`/`Marker`/`ClipFades` and bumps `PROJECT_SCHEMA_VERSION` to 4 so a browser-mode project is
  stamped v4 consistently with the Tauri path.

## Consequences

- Opening a v1/v2/v3 project upgrades it losslessly and in place; unchanged data stays byte-stable across
  re-opens (a migrated v4 project is not re-migrated or rewritten on the next open).
- B2/B7 read and write clips/markers from one typed source of truth; the capture loop (B1) writes takes,
  the clip model references them.
- Future clip refinements (source in-point, gain breakpoints, crossfade shape) are additive
  `#[serde(default)]` fields — no further schema bump for them.
- Tests (`persistence.rs`): `round_trips_audio_clips_and_markers` (save → reload with typed fields
  intact) and `migrates_v3_project_to_v4_and_preserves_reserved_slots` (v3 → v4, byte-stable), alongside
  the existing v1→current, v2→v3, and reject-newer guards.

## Key files

| Area | Path |
|------|------|
| Schema structs + `SCHEMA_VERSION` | `apps/desktop/src-tauri/src/persistence.rs` |
| Migrator | `persistence.rs::migrate_meta` (called from `project_open`) |
| Atomic write discipline | `persistence.rs::atomic_write` |
| TS mirror (`AudioClip`/`Marker` + version) | `apps/desktop/src/project/types.ts` |
