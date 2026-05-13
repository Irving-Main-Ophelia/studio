/**
 * Operation log + replay + undo/redo.
 *
 * Music analogy: the operation log is the *score's logbook* — every
 * "modulate bars 32–36 to G major", every "add a fermata to the cadence" is
 * jotted down in order. Replaying the logbook from the initial blank-page
 * state reproduces the current score exactly, the way a copyist would
 * reconstruct a piece from a stack of editing notes.
 *
 * Phase-1 Phase-1 operations are append-only on the disk journal (see
 * `persistence.rs`). Undo/redo, however, is a UI concern: it pops from the
 * tip of the materialised log and replays the inverse — the inverse is
 * itself a brand-new operation that gets journalled. That preserves
 * append-only durability while letting the user travel backwards in time.
 */

import type {
  OperationRecord,
  ProjectMeta,
  ScoreInitData,
  ScoreMetaUpdateData,
  ScoreReplaceData,
  ScoreTransposeData,
} from "./types";
import { newOperationId, nowIso } from "./types";

/** Inputs to construct a `score_init` operation for a brand-new project. */
export interface BuildInitOpInput {
  musicxml: string;
  title: string;
  composer: string;
  tempo_bpm: number;
  time_signature: string;
  key_signature: string;
}

export function buildScoreInitOp(input: BuildInitOpInput, index = 0): OperationRecord {
  const data: ScoreInitData = {
    musicxml: input.musicxml,
    title: input.title,
    composer: input.composer,
    tempo_bpm: input.tempo_bpm,
    time_signature: input.time_signature,
    key_signature: input.key_signature,
  };
  return {
    id: newOperationId(),
    kind: "score_init",
    timestamp: nowIso(),
    index,
    data,
    inverse: null,
    description: `Started "${input.title}" in ${input.key_signature} ${input.time_signature} @ ${input.tempo_bpm} bpm`,
  };
}

export interface BuildReplaceOpInput {
  previousMusicXml: string;
  nextMusicXml: string;
  reason: string;
  description: string;
}

export function buildScoreReplaceOp(
  input: BuildReplaceOpInput,
  index: number,
): OperationRecord {
  const data: ScoreReplaceData = {
    musicxml: input.nextMusicXml,
    reason: input.reason,
  };
  const inverseData: ScoreReplaceData = {
    musicxml: input.previousMusicXml,
    reason: `undo: ${input.reason}`,
  };
  const id = newOperationId();
  const timestamp = nowIso();
  const inverse: OperationRecord = {
    id: newOperationId(),
    kind: "score_replace",
    timestamp,
    index: index + 1, // placeholder; rewritten when the inverse actually fires
    data: inverseData,
    inverse: null,
    description: `Undo: ${input.description}`,
  };
  return {
    id,
    kind: "score_replace",
    timestamp,
    index,
    data,
    inverse,
    description: input.description,
  };
}

export interface BuildTransposeOpInput {
  previousMusicXml: string;
  nextMusicXml: string;
  fromKey: string | null;
  toKey: string;
  interval: string | null;
}

export function buildScoreTransposeOp(
  input: BuildTransposeOpInput,
  index: number,
): OperationRecord {
  const data: ScoreTransposeData = {
    musicxml: input.nextMusicXml,
    target_key: input.toKey,
    from_key: input.fromKey,
    interval: input.interval,
  };
  // Inverse = a transpose back to the source key, materialised as a replace.
  const inverseData: ScoreReplaceData = {
    musicxml: input.previousMusicXml,
    reason: `undo transpose to ${input.toKey}`,
  };
  const timestamp = nowIso();
  const inverse: OperationRecord = {
    id: newOperationId(),
    kind: "score_replace",
    timestamp,
    index: index + 1,
    data: inverseData,
    inverse: null,
    description: `Undo: transpose to ${input.toKey}`,
  };
  return {
    id: newOperationId(),
    kind: "score_transpose",
    timestamp,
    index,
    data,
    inverse,
    description:
      input.fromKey != null
        ? `Transposed from ${input.fromKey} to ${input.toKey}`
        : `Transposed to ${input.toKey}`,
  };
}

export interface BuildMetaUpdateOpInput {
  previous: Partial<ProjectMeta>;
  next: Partial<ProjectMeta>;
}

export function buildScoreMetaUpdateOp(
  input: BuildMetaUpdateOpInput,
  index: number,
): OperationRecord {
  const data: ScoreMetaUpdateData = {
    changes: input.next as ScoreMetaUpdateData["changes"],
  };
  const inverseData: ScoreMetaUpdateData = {
    changes: input.previous as ScoreMetaUpdateData["changes"],
  };
  const timestamp = nowIso();
  const inverse: OperationRecord = {
    id: newOperationId(),
    kind: "score_meta_update",
    timestamp,
    index: index + 1,
    data: inverseData,
    inverse: null,
    description: "Undo project metadata change",
  };
  return {
    id: newOperationId(),
    kind: "score_meta_update",
    timestamp,
    index,
    data,
    inverse,
    description: describeMetaChanges(input.next),
  };
}

function describeMetaChanges(changes: Partial<ProjectMeta>): string {
  const parts: string[] = [];
  if (changes.title) parts.push(`title → "${changes.title}"`);
  if (changes.composer !== undefined)
    parts.push(`composer → "${changes.composer || "—"}"`);
  if (changes.tempo_bpm !== undefined)
    parts.push(`tempo → ${changes.tempo_bpm} bpm`);
  if (changes.time_signature) parts.push(`time → ${changes.time_signature}`);
  if (changes.key_signature) parts.push(`key → ${changes.key_signature}`);
  return parts.length > 0 ? `Updated ${parts.join(", ")}` : "Updated project metadata";
}

/**
 * In-memory replay of an operation against the current MusicXML. Only used
 * for crash recovery and for vitest unit tests; the live editor applies
 * operations as it generates them.
 */
export interface ReplayState {
  musicxml: string;
}

export function applyOperation(state: ReplayState, op: OperationRecord): ReplayState {
  switch (op.kind) {
    case "score_init":
    case "score_replace":
    case "score_transpose": {
      const data = op.data as { musicxml?: string };
      if (typeof data.musicxml === "string") {
        return { musicxml: data.musicxml };
      }
      return state;
    }
    case "score_meta_update":
      return state;
    default:
      return state;
  }
}

export function replayOperations(
  initial: ReplayState,
  ops: readonly OperationRecord[],
): ReplayState {
  return ops.reduce(applyOperation, initial);
}

/* ----------------------- Undo/redo bookkeeping ------------------------ */

/**
 * Holds an in-memory cursor into the operation log so the UI can undo/redo
 * along the *applied* sequence. The disk journal stays append-only — undo
 * appends an inverse operation rather than truncating history.
 */
export class OperationLogState {
  private readonly _ops: OperationRecord[];
  /** Number of leading entries currently "active" (i.e. visible to the user). */
  private _cursor: number;

  constructor(ops: OperationRecord[] = []) {
    this._ops = [...ops];
    this._cursor = this._ops.length;
  }

  get operations(): readonly OperationRecord[] {
    return this._ops;
  }

  get appliedCount(): number {
    return this._cursor;
  }

  get nextIndex(): number {
    return this._ops.length === 0 ? 0 : this._ops[this._ops.length - 1].index + 1;
  }

  /** Snapshot suitable for crash-recovery comparisons. */
  toJSON(): OperationRecord[] {
    return [...this._ops];
  }

  /** Append a new operation; clears any redo-able operations beyond the cursor. */
  append(op: OperationRecord): void {
    // Truncating in-memory only. Disk journal stays append-only — when the
    // caller persists `op`, the new entry's `index` collides with any
    // previous future entries' indices and replay disambiguates by order.
    this._ops.length = this._cursor;
    this._ops.push(op);
    this._cursor = this._ops.length;
  }

  /** Replays the active prefix from an initial state. */
  replay(initial: ReplayState): ReplayState {
    return replayOperations(initial, this._ops.slice(0, this._cursor));
  }

  /** Whether an undo is currently possible. */
  canUndo(): boolean {
    return this._cursor > 1; // never undo past the initial `score_init`
  }

  /** Whether a redo is currently possible. */
  canRedo(): boolean {
    return this._cursor < this._ops.length;
  }

  /** Move the cursor back by one; returns the new applied prefix. */
  undo(): OperationRecord | null {
    if (!this.canUndo()) return null;
    this._cursor -= 1;
    return this._ops[this._cursor];
  }

  /** Move the cursor forward by one; returns the freshly re-applied op. */
  redo(): OperationRecord | null {
    if (!this.canRedo()) return null;
    const op = this._ops[this._cursor];
    this._cursor += 1;
    return op;
  }
}
