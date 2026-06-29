/**
 * TypeScript mirrors of the Rust `persistence::*` types
 * (`src-tauri/src/persistence.rs`). Keep these in sync by hand — the project
 * file format is documented in ADR-0009 and `docs/phases/PHASE_1.md` §1.8.
 */

export const PROJECT_SCHEMA_VERSION = 3 as const;

/** How a part renders (Track A, A1). */
export type ViewMode = "staff" | "tab" | "both";

/** Standard 6-string guitar tuning, string 1 (high E) first. */
export const STANDARD_GUITAR_TUNING: string[] = ["E4", "B3", "G3", "D3", "A2", "E2"];

/**
 * Per-part guitar/fretted-instrument metadata (schema v3 — ADR-0018). Absent on
 * non-fretted parts, which render as standard staff.
 */
export interface GuitarConfig {
  /** Open-string pitch names, string 1 (highest) first. */
  tuning: string[];
  /** Capo fret; 0 = none. */
  capo: number;
  /** "nylon" | "steel" | "electric" | "bass" | "custom". */
  profile: string;
  view_mode: ViewMode;
}

export interface InstrumentationEntry {
  id: string;
  instrument: string;
  channel: number;
  /** Schema v3 — present only on fretted parts (ADR-0018). */
  guitar?: GuitarConfig | null;
}

export interface MixerTrack {
  id: string;
  gain_db: number;
  pan: number;
  mute: boolean;
  solo: boolean;
}

export interface MixerMaster {
  gain_db: number;
}

export interface MixerState {
  tracks: MixerTrack[];
  master: MixerMaster;
}

export interface AgentState {
  last_seen_message_count: number;
  pinned_explanations: string[];
}

export interface ProjectMeta {
  schema_version: number;
  id: string;
  title: string;
  composer: string;
  /** ISO-8601 UTC */
  created_at: string;
  /** ISO-8601 UTC */
  updated_at: string;
  tempo_bpm: number;
  /** "4/4", "3/4", "6/8", … */
  time_signature: string;
  /** Human-readable key: "C major", "F# minor", "Bb major", … */
  key_signature: string;
  instrumentation: InstrumentationEntry[];
  mixer: MixerState;
  agent_state: AgentState;
  composition_brief: string | null;
  /** Index of the last operation folded into `score.musicxml`. `-1` = brand new. */
  last_op_index: number;
}

/**
 * Operations are the *intent* of an edit. Replaying every operation against
 * the base score reconstructs the latest state.
 *
 * The `data` payload's shape depends on `kind`; this is the union of all
 * Phase-1 operation kinds we currently emit.
 */
export type OperationKind =
  | "score_init"
  | "score_replace"
  | "score_transpose"
  | "score_meta_update";

export interface OperationRecord {
  id: string;
  kind: OperationKind | string;
  /** ISO-8601 UTC */
  timestamp: string;
  /** Monotonic index across the entire history of this project. */
  index: number;
  data: Record<string, unknown>;
  /** Inverse operation for undo, if computable when the op was created. */
  inverse?: OperationRecord | null;
  /** Human-readable description for the UI ("Transposed to F♯ minor"). */
  description?: string | null;
}

/**
 * `score_init` payload — the very first operation in a project's life.
 */
export interface ScoreInitData extends Record<string, unknown> {
  musicxml: string;
  composer: string;
  title: string;
  tempo_bpm: number;
  time_signature: string;
  key_signature: string;
}

/**
 * `score_replace` payload — full MusicXML swap (used by transpose, by
 * imports, by any operation we don't have a finer-grained kind for yet).
 */
export interface ScoreReplaceData extends Record<string, unknown> {
  musicxml: string;
  reason: string;
}

/**
 * `score_transpose` payload.
 */
export interface ScoreTransposeData extends Record<string, unknown> {
  target_key: string;
  from_key: string | null;
  interval: string | null;
  musicxml: string;
}

/**
 * `score_meta_update` payload — title / composer / tempo / time-sig / key-sig
 * changes that do not alter the score body.
 */
export interface ScoreMetaUpdateData extends Record<string, unknown> {
  changes: Partial<
    Pick<
      ProjectMeta,
      "title" | "composer" | "tempo_bpm" | "time_signature" | "key_signature"
    >
  >;
}

export interface NewProjectSpec {
  title: string;
  composer: string;
  tempo_bpm: number;
  time_signature: string;
  key_signature: string;
  instrumentation: InstrumentationEntry[];
  initial_musicxml: string;
  initial_operation: OperationRecord;
  parent_dir?: string | null;
}

export interface ProjectHandle {
  /** Filesystem path of the project folder. */
  path: string;
  meta: ProjectMeta;
  score_musicxml: string;
  operations: OperationRecord[];
  /**
   * Operations whose intent was journalled but whose materialised state was
   * never folded into `score.musicxml` (i.e. ops with index > meta.last_op_index).
   * The UI surfaces these via the recovery banner.
   */
  pending_operations: OperationRecord[];
}

export interface SaveResult {
  updated_at: string;
  last_op_index: number;
}

export interface SaveRequest {
  path: string;
  meta: ProjectMeta;
  score_musicxml: string;
  operation?: OperationRecord | null;
}

export interface RecentProject {
  path: string;
  title: string;
  last_opened: string;
}

/* ------------------------- helper constructors ------------------------- */

let _idSeed = 0;

/**
 * UUIDv4-ish identifier; uses `crypto.randomUUID()` where available and
 * falls back to a counter (Tauri's WKWebView is usually modern enough).
 */
export function newOperationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  _idSeed += 1;
  return `op-${Date.now()}-${_idSeed}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
