# ADR-0009 — Project on disk: folder format with operations log + atomic snapshot

- **Status:** Accepted, May 13, 2026
- **Phase:** 1 — M1.0 (Persistence)
- **Supersedes:** —

## Context

Phase 0 had no concept of a project: scores were loaded from immutable
demo fixtures and held in memory. Phase 1 requires the maintainer to:

- Start a new piece from a blank grand staff,
- Continue working across sessions,
- Recover gracefully from a hard crash (forced quit, dead battery, OS
  update reboot mid-edit),
- Audit every edit historically (the maintainer is a composer — losing
  yesterday's modulation because of a bad gesture is unacceptable),
- Eventually let the agent propose edits as diffs that can be rolled
  back (M1.4).

The on-disk format needs to support all of that while staying readable
by hand (the maintainer is the only user; transparency beats
abstraction) and friendly to Time Machine / Dropbox-style backup tools.

A single binary file (à la `.sib`, `.musx`, GarageBand `.band`) is the
classical answer, but it has three serious drawbacks:

1. **Opaque** — you can't open it in a text editor or diff it.
2. **Fragile** — a single corrupted byte can take down the whole file.
3. **Backup-hostile** — incremental sync tools transfer the whole blob
   every save.

A pure single-file `.musicxml` is the opposite extreme: transparent, but
without a place to store metadata, layout choices, agent decisions, or
an operation history.

## Decision

Each project is a **folder**:

```
~/Documents/Stockhausen/<project-slug>/
├── project.json       # human-readable metadata + version + last_op_index
├── score.musicxml     # the canonical materialised score (MusicXML 4.0)
└── operations.log     # append-only JSONL journal of every edit
```

The folder is the unit of "a project". Opening a project means opening
the folder. The user-facing `<project-slug>` is derived from the title
via a slug function (`"Sonata in C"` → `"sonata-in-c"`); collisions get
a numeric suffix.

### `project.json`

```json
{
  "version": "1.0",
  "id": "uuid",
  "title": "Sonata in C",
  "composer": "Irving Hernandez",
  "tempo_bpm": 120,
  "time_signature": "4/4",
  "key_signature": "C major",
  "instrumentation": [{ "id": "piano", "instrument": "piano", "channel": 0 }],
  "mixer": { "master": { "gain_db": 0.0, "pan": 0.0 }, "tracks": [] },
  "created_at": "2026-05-13T17:00:00Z",
  "updated_at": "2026-05-13T17:30:00Z",
  "last_op_index": 12
}
```

`last_op_index` is the index of the last operation already folded into
`score.musicxml`. Any operations with `index > last_op_index` in
`operations.log` are **pending**: they happened, were journalled, but
the snapshot wasn't refreshed (crash between writes).

### `operations.log`

JSONL, append-only. One operation per line:

```json
{"id":"op-uuid","kind":"score_transpose","timestamp":"…","index":12,"data":{…},"inverse":{…},"description":"Transposed from C to F"}
```

Each operation carries its own inverse where possible, so undo never
needs server-side support — just journal the inverse as the next entry.
Undo and redo are append-only.

### Atomic writes

Every write to `project.json` and `score.musicxml` is **atomic**:

1. Serialize.
2. `write` to `<file>.tmp` in the same folder.
3. `fsync` the temp file.
4. `rename` over the destination (POSIX `rename(2)` is atomic on the
   same filesystem).
5. `fsync` the parent directory so the rename is durable.

`operations.log` is opened in append mode and fsync'd after each write;
on a partially-written final line we recover the prefix on the next
open.

### Crash recovery

When a project is opened:

1. Read `project.json`. Validate.
2. Read `operations.log`. Drop any malformed trailing line.
3. Read `score.musicxml`.
4. Compute `pending = ops.filter(op => op.index > last_op_index)`.
5. If `pending` is non-empty, surface a banner to the maintainer:
   "Recovered N operations from your last session — apply or ignore?"

This makes data loss **explicit and recoverable** instead of silent.

### Recent projects

`~/Library/Application Support/com.stockhausen.studio/recents.json`
keeps the last 20 opened project paths, last-opened first. On open
it's filtered: paths that no longer resolve are dropped.

## Alternatives considered

- **Single `.stockhausen` file (ZIP archive)** — same disadvantages as
  classical opaque formats. We can revisit for Phase 4 export bundles.
- **SQLite database per project** — overkill for a one-user app and
  blocks the maintainer from inspecting their own data.
- **Git-style content-addressed store** — fascinating for cross-project
  reuse, but doubles the complexity budget. Out of scope.
- **Pure `operations.log` without snapshot** — replay every time we
  open. Becomes painfully slow once `len(ops) > 10⁴`; a periodic
  snapshot is the standard remedy.
- **Cloud-first sync** — explicit non-goal (NORTH_STAR §5 #6, AGENTS.md
  §11). Always local.

## Consequences

- Maintenance is trivial: open a Finder window, copy the folder, you've
  duplicated the project.
- Time Machine sees three small files instead of one big blob → fast
  incremental backups.
- The journal is the audit log: every change has a timestamp, a
  description, and an inverse. M1.4's diff overlay will read from the
  same journal.
- The format is versioned in `project.json` (`"version": "1.0"`).
  Future migrations land in `src-tauri/src/persistence.rs::migrate_*`.
- The maintainer can hand-edit `score.musicxml` if they want; on next
  open the change is folded as a synthetic `score_replace` operation
  (Phase-2 work — for now, manual edits are silently respected).
