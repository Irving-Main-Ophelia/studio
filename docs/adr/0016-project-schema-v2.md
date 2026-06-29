# ADR-0016 — `project.json` schema v2: reserved DAW shapes + v1→v2 migrator

- **Status:** Accepted, June 27, 2026
- **Phase:** 3.5 — M3.5.2 (Data Model v2)
- **Supersedes:** nothing. Extends the schema-v1 format defined in ADR-0009 / PHASE_1.md §1.8.

## Context

`project.json` (schema v1, ADR-0009) models the mixer as `gain_db / pan / mute / solo` per
track + a master gain. The DAW-reference tracks (Phases 4–8) need much more: aux/submix **buses**,
per-track **sends** and **insert** chains, track **groups/VCAs**, **automation** lanes, **audio
clips/takes**, and song-position **markers** (see `docs/reference-daws/REFINE_AND_ERADICATE.md` §3,
Tracks B/C).

The format is **versioned and on-disk** (PHASE_1.md §1.8). If we build the recording/mixing UIs
first and extend the schema later, every existing project pays a migration tax. Reserving the shapes
now — empty, before any UI consumes them — is cheap insurance.

## Decision

Bump `SCHEMA_VERSION` **1 → 2** and reserve the DAW shapes, all empty/defaulted until their owning
phase ships. The reserved shapes (in `src-tauri/src/persistence.rs`):

```jsonc
{
  "schema_version": 2,
  "mixer": {
    "tracks": [{ "id", "gain_db", "pan", "mute", "solo",
                 "sends": [], "inserts": [], "group": null }],   // Track C / Phase 6
    "master": { "gain_db": 0, "inserts": [] },                   // Track C
    "buses": []                                                  // Track C
  },
  "automation": [],   // Track C / Phase 6 — per-track/param breakpoint lanes
  "audio_clips": [],  // Track B / Phase 5 — references into takes/ + clip gain
  "markers": []       // Track B / Phase 5 — named song positions (tie to analyze_form)
}
```

Each reserved field is `#[serde(default)]`, so:

- A **v1** `project.json` (which lacks these fields) deserialises straight into the v2 struct with
  the new fields defaulting to empty — the in-memory value is already correct.
- A v2 `project.json` written by us always includes them (`[]` / `null`).

### On-load migrator (`migrate_meta`)

`project_open` runs `migrate_meta(&mut meta)` after parsing:

- `schema_version > SCHEMA_VERSION` → **error** (a project from a newer build; refuse, don't mangle).
- `schema_version == SCHEMA_VERSION` → no-op (`false`).
- `schema_version < SCHEMA_VERSION` → stamp the current version, return `true`.

When it returns `true`, `project_open` rewrites `project.json` via the existing `atomic_write`
(write-tmp → fsync → rename), so the upgrade is durable and crash-safe. v1 → v2 needs **no field
transforms** — the reserved fields are purely additive. Future stepwise migrations (v2 → v3 …) chain
inside the same function.

### What does *not* change

- No UI. This is schema-only headroom; the fields stay empty until Phases 5/6 fill them.
- The frontend `ProjectMeta` TS type is untouched: it round-trips `meta` opaquely through
  `project_open` → `project_save`, and the `#[serde(default)]` fields tolerate omission either way.

## Consequences

- Opening a v1 project upgrades it losslessly and in place; unchanged data is byte-stable across
  re-opens (a migrated v2 project is not re-migrated or rewritten on the next open).
- Phases 4–8 add their data into already-reserved slots — no schema bump, no migration tax for the
  features that motivated this.
- A project saved by a *newer* Stockhausen (schema ahead) fails to open with a clear message instead
  of silent corruption.
- Tests: `migrates_v1_project_to_v2_losslessly_and_byte_stable`,
  `rejects_newer_than_supported_schema` (both in `persistence.rs`).

## Key files

| Area | Path |
|------|------|
| Schema structs + `SCHEMA_VERSION` | `apps/desktop/src-tauri/src/persistence.rs` |
| Migrator | `persistence.rs::migrate_meta` (called from `project_open`) |
| Atomic write discipline | `persistence.rs::atomic_write` |
