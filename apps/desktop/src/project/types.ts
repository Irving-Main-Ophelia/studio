/**
 * TypeScript mirrors of the Rust `persistence::*` types
 * (`src-tauri/src/persistence.rs`). Keep these in sync by hand — the project
 * file format is documented in ADR-0009 and `docs/phases/PHASE_1.md` §1.8.
 */

export const PROJECT_SCHEMA_VERSION = 4 as const;

/** How a part renders (Track A, A1 + A8). "lead" = slash + chord symbols. */
export type ViewMode = "staff" | "tab" | "both" | "lead";

/** Standard 6-string guitar tuning, string 1 (high E) first. */
export const STANDARD_GUITAR_TUNING: string[] = ["E4", "B3", "G3", "D3", "A2", "E2"];

/**
 * Named tunings that ship in M4.2 (mirrors backend `fretboard.TUNINGS`; ADR-0018,
 * PHASE_4 §4.7 Q1). Custom tunings are an explicit pitch array, so N-string is data.
 */
export const GUITAR_TUNING_PRESETS: Record<string, string[]> = {
  standard: ["E4", "B3", "G3", "D3", "A2", "E2"],
  drop_d: ["E4", "B3", "G3", "D3", "A2", "D2"],
  dadgad: ["D4", "A3", "G3", "D3", "A2", "D2"],
  bass_standard: ["G2", "D2", "A1", "E1"],
};

/** Match a tuning array to a preset id, or "custom" when it matches none. */
export function tuningPresetId(tuning: string[]): string {
  for (const [id, preset] of Object.entries(GUITAR_TUNING_PRESETS)) {
    if (preset.length === tuning.length && preset.every((p, i) => p === tuning[i])) return id;
  }
  return "custom";
}

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

/**
 * Fade envelope on a clip's edges (schema v4 — ADR-0021). Durations in seconds;
 * `0` = a hard edge. Crossfade curve/shape is a later additive concern (B3).
 */
export interface ClipFades {
  /** Fade-in length from the clip's start, in seconds. */
  fade_in: number;
  /** Fade-out length to the clip's end, in seconds. */
  fade_out: number;
}

/**
 * A non-destructive audio clip: a placement of a `takes/` recording on the
 * timeline (schema v4 — ADR-0021, promoted from the reserved v2 slot). The take
 * file is immutable; a clip only references it. `offset`/`length` are in seconds
 * (`offset` = timeline start, what "move" edits; `length` = how long it sounds).
 */
export interface AudioClip {
  id: string;
  /** Id of the take in `takes/` this clip plays. */
  take_id: string;
  /** Timeline start position, seconds from the song origin. */
  offset: number;
  /** Clip length, in seconds. */
  length: number;
  /** Per-clip gain in dB (B5), independent of Phase-6 track automation. */
  gain_db: number;
  /** Fade envelope on this clip's edges (B3). */
  fades: ClipFades;
}

/**
 * A named song-position marker / memory location (schema v4 — ADR-0021,
 * promoted from the reserved v2 slot). B7 recalls/jumps and loops between two.
 */
export interface Marker {
  id: string;
  name: string;
  /** Song position, seconds from the origin. */
  position: number;
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
  /**
   * Track B — non-destructive audio clips referencing `takes/` (schema v4,
   * ADR-0021). Absent/empty on a project with no audio. Optional here because
   * `meta` round-trips opaquely through Rust; UI consumers land in B2.
   */
  audio_clips?: AudioClip[];
  /** Track B — named song-position markers (schema v4, ADR-0021). See B7. */
  markers?: Marker[];
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
  | "score_meta_update"
  // Phase-5 audio edits (clips/markers live in `meta`, not the MusicXML body).
  | "audio_clip_add"
  | "audio_clip_remove"
  | "audio_clip_set_gain"
  | "marker_add"
  | "marker_remove"
  | "marker_move";

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
