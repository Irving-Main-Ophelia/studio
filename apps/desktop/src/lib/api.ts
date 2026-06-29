/**
 * Backend agent client. The agent lives on 127.0.0.1:8000.
 *
 * Every request is fail-closed: if the backend is unreachable we surface
 * the error to the caller so the UI can show a banner.
 */

import type {
  CadenceAnalysis,
  MotifAnalysis,
  ProgressionAnalysis,
  RangeAnalysis,
  RhythmValidation,
  TransposeRegionRequest,
  TransposeResult as TransposeRegionResult,
  VoiceLeadingAnalysis,
  VoiceLeadingValidation,
  VoicingValidation,
} from "@stockhausen/theory-types";
import type { ViewMode } from "../project/types";

export const BACKEND_URL = "http://127.0.0.1:8000";

export interface KeyEstimate {
  key: string;
  mode: string;
  confidence: number;
}

export interface NoteEvent {
  midi: number;
  start_sec: number;
  duration_sec: number;
  part_index: number;
  velocity: number;
}

export interface ExtractedScore {
  tempo_bpm: number;
  duration_sec: number;
  notes: NoteEvent[];
}

export interface TransposeResult {
  musicxml: string;
  from_key: string | null;
  to_key: string;
  interval: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ToolCallRecord {
  tool: string;
  input: Record<string, unknown>;
  output: unknown;
  error: boolean;
}

export interface DiffWarning {
  kind: string;
  detail: string;
  measure: number | null;
  beat: number | null;
}

export interface DiffOperation {
  kind:
    | "score_replace"
    | "score_transpose"
    | "score_modulate"
    | "score_reharmonize"
    | "score_add_section"
    | "score_replace_bars"
    | "score_respell_enharmonic";
  description: string;
  forward: Record<string, unknown>;
  inverse: Record<string, unknown>;
}

export interface ScoreDiff {
  diff_id: string;
  base_score_hash: string;
  description: string;
  operations: DiffOperation[];
  warnings: DiffWarning[];
  preview_musicxml: string;
  tool: string;
}

export interface ChatResult {
  reply: string;
  tool_calls: ToolCallRecord[];
  diffs: ScoreDiff[];
}

/* ------------------------ score edit (M1.1) ------------------------- */

export interface EditCursor {
  part_index: number;
  measure_number: number;
  beat_offset: number;
  voice: number | null;
}

export interface InsertNoteResult {
  musicxml: string;
  next_cursor: EditCursor;
  inserted_note: {
    pitch: string;
    midi: number;
    duration_quarters: number;
  };
}

export interface InsertRestResult {
  musicxml: string;
  next_cursor: EditCursor;
}

export interface ToggleResult {
  musicxml: string;
  action: "added" | "removed";
}

export interface AppendMeasureResult {
  musicxml: string;
  new_measure_number: number;
}

export type Articulation = "staccato" | "accent" | "marcato" | "tenuto" | "fermata";
export type Dynamic = "ppp" | "pp" | "p" | "mp" | "mf" | "f" | "ff" | "fff";
export type TieType = "start" | "stop" | "continue" | "none";

export interface ListedNoteRow {
  part_index: number;
  measure_number: number;
  beat_offset: number;
  voice: number | null;
  part_name: string;
  pitch: string;
  midi: number | null;
  duration_quarters: number;
}

class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const json = (await res.json()) as { detail?: string };
      if (json.detail) detail = json.detail;
    } catch {
      // body wasn't JSON
    }
    throw new ApiError(detail, res.status);
  }
  return (await res.json()) as T;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`);
  if (!res.ok) throw new ApiError(res.statusText, res.status);
  return (await res.json()) as T;
}

export const api = {
  health: () => get<{ status: string; version: string; phase: string }>("/health"),

  extractNotes: (musicxml: string) =>
    post<ExtractedScore>("/score/notes", { musicxml }),

  analyzeKey: (musicxml: string) =>
    post<KeyEstimate>("/score/key", { musicxml }),

  transpose: (musicxml: string, target_key: string) =>
    post<TransposeResult>("/transpose", { musicxml, target_key }),

  chat: (messages: ChatMessage[], scoreMusicXml: string | null) =>
    post<ChatResult>("/agent/chat", {
      messages,
      score_musicxml: scoreMusicXml,
    }),

  insertNote: (req: {
    musicxml: string;
    part_index: number;
    measure_number: number;
    beat_offset: number;
    pitch: string;
    duration_quarters: number;
    voice?: number | null;
    replace?: boolean;
  }) => post<InsertNoteResult>("/score/edit/note/insert", req),

  insertRest: (req: {
    musicxml: string;
    part_index: number;
    measure_number: number;
    beat_offset: number;
    duration_quarters: number;
    voice?: number | null;
  }) => post<InsertRestResult>("/score/edit/note/rest", req),

  removeNote: (req: {
    musicxml: string;
    part_index: number;
    measure_number: number;
    beat_offset: number;
    voice?: number | null;
  }) => post<{ musicxml: string }>("/score/edit/note/remove", req),

  toggleArticulation: (req: {
    musicxml: string;
    part_index: number;
    measure_number: number;
    beat_offset: number;
    articulation: Articulation;
    voice?: number | null;
  }) => post<ToggleResult>("/score/edit/articulation/toggle", req),

  setTie: (req: {
    musicxml: string;
    part_index: number;
    measure_number: number;
    beat_offset: number;
    tie_type: TieType;
    voice?: number | null;
  }) => post<{ musicxml: string }>("/score/edit/tie/set", req),

  setDynamic: (req: {
    musicxml: string;
    part_index: number;
    measure_number: number;
    beat_offset: number;
    dynamic: Dynamic;
  }) => post<{ musicxml: string }>("/score/edit/dynamic/set", req),

  appendMeasure: (req: { musicxml: string; part_index: number }) =>
    post<AppendMeasureResult>("/score/edit/measure/append", req),

  listScoreNotes: (musicxml: string) =>
    post<{ notes: ListedNoteRow[] }>("/score/edit/notes/list", { musicxml }),

  /**
   * Project the canonical score into per-part tablature views for OSMD (Track A, A1).
   * Display-only: the canonical MusicXML stays the source of truth (ADR-0015).
   */
  projectTabView: (req: {
    musicxml: string;
    parts: {
      part_index: number;
      view_mode: ViewMode;
      tuning?: string[] | null;
      capo?: number;
    }[];
  }) => post<{ musicxml: string }>("/score/tab/project", req),

  resolveScoreNote: (req: {
    musicxml: string;
    measure_number: number;
    pitch: string;
    beat_hint: number;
  }) => post<ListedNoteRow>("/score/edit/note/resolve", req),

  getNoteInfo: (req: {
    musicxml: string;
    part_index: number;
    measure_number: number;
    beat_offset: number;
    voice?: number | null;
  }) =>
    post<{
      part_index: number;
      measure_number: number;
      beat_offset: number;
      voice: number | null;
      part_name: string;
      pitch: string | null;
      midi: number | null;
      duration_quarters: number;
      articulations: string[];
      is_rest: boolean;
    }>("/score/edit/note/info", req),

  changeNoteDuration: (req: {
    musicxml: string;
    part_index: number;
    measure_number: number;
    beat_offset: number;
    duration_quarters: number;
    voice?: number | null;
  }) => post<{ musicxml: string }>("/score/edit/note/duration", req),

  respellNote: (req: {
    musicxml: string;
    part_index: number;
    measure_number: number;
    beat_offset: number;
    voice?: number | null;
  }) => post<{ musicxml: string; pitch: string }>("/score/edit/note/respell", req),

  changeNotePitch: (req: {
    musicxml: string;
    part_index: number;
    measure_number: number;
    beat_offset: number;
    pitch: string;
    voice?: number | null;
  }) => post<{ musicxml: string; pitch: string }>("/score/edit/note/pitch", req),

  transposeNoteSemitones: (req: {
    musicxml: string;
    part_index: number;
    measure_number: number;
    beat_offset: number;
    semitones: number;
    voice?: number | null;
  }) => post<{ musicxml: string; pitch: string }>("/score/edit/note/transpose-semitones", req),

  setKeySignature: (req: { musicxml: string; tonic: string; mode: string }) =>
    post<{ musicxml: string; key: string }>("/score/edit/key-signature/set", req),

  /* --------------------- theory analyzers (M1.3) --------------------- */
  progression: (musicxml: string) =>
    post<ProgressionAnalysis>("/theory/progression", { musicxml }),
  voiceLeading: (musicxml: string) =>
    post<VoiceLeadingAnalysis>("/theory/voice-leading", { musicxml }),
  range: (musicxml: string) => post<RangeAnalysis>("/theory/range", { musicxml }),
  cadences: (musicxml: string) => post<CadenceAnalysis>("/theory/cadences", { musicxml }),
  motifs: (musicxml: string, n = 4, min_occurrences = 2) =>
    post<MotifAnalysis>("/theory/motifs", { musicxml, n, min_occurrences }),
  formAnalysis: (musicxml: string) =>
    post<{
      key: { tonic: string; mode: string; confidence: number };
      total_measures: number;
      phrases: Array<{
        measure_start: number;
        measure_end: number;
        cadence_kind: string | null;
        cadence_roman: [string, string] | null;
      }>;
      sections: Array<{
        name: string;
        measure_start: number;
        measure_end: number;
        phrase_count: number;
        closes_with: string | null;
      }>;
    }>("/theory/form", { musicxml }),

  /* --------------------- theory validators (M1.3) -------------------- */
  validateVoiceLeading: (musicxml: string) =>
    post<VoiceLeadingValidation>("/theory/validate/voice-leading", { musicxml }),
  validateRange: (musicxml: string) =>
    post<{ warnings: RangeAnalysis["parts"][number]["warnings"] }>(
      "/theory/validate/range",
      { musicxml },
    ),
  validateVoicing: (musicxml: string) =>
    post<VoicingValidation>("/theory/validate/voicing", { musicxml }),
  validateRhythm: (musicxml: string) =>
    post<RhythmValidation>("/theory/validate/rhythm", { musicxml }),

  /* --------------------- transposition (Pillar 2) -------------------- */
  transposeRegion: (req: TransposeRegionRequest) =>
    post<TransposeRegionResult>("/theory/transpose-region", req),

  /* --------------------- score generator (Pillar 4) ----------------- */
  generateScore: (
    prompt: string,
    constraints?: {
      key?: string;
      time?: string;
      bars?: number;
      style?: string;
      texture?: string;
      tempo_bpm?: number;
      parts?: string;
    },
  ) =>
    post<{ musicxml: string; script: string; description: string }>(
      "/generate/score",
      { prompt, constraints: constraints ?? {} },
    ),

  /* --------------------- orchestration (Pillar 6) -------------------- */
  listProfiles: () =>
    get<Array<{ name: string; display_name: string }>>("/orchestration/profiles"),

  applyProfile: (
    musicxml: string,
    profile: string,
  ) =>
    post<{
      musicxml: string;
      profile: { name: string; display_name: string; slots: Array<{ name: string; instrument_key: string }> };
      assignment: Array<{ slot_index: number; slot_name: string; source_part_index: number | null; source_part_name: string | null }>;
      warnings: Array<{ slot_index: number; slot_name: string; kind: string; pitch: string; midi: number; measure: number }>;
    }>("/orchestration/apply", { musicxml, profile }),

  /* --------------------- audio import (Pillar 11) -------------------- */
  audioCapabilities: () =>
    get<{ stem_separation: boolean; transcription: boolean; requires_modal: boolean; note: string }>(
      "/audio/capabilities",
    ),

  audioImport: (filename: string) =>
    post<{ status: string; reason: string; stems: unknown[]; musicxml: string | null; project_id: string | null }>(
      "/audio/import",
      { filename },
    ),

  /* --------------------- production exports (Pillar 12) -------------- */
  exportClickTrack: (musicxml: string, tempo_bpm?: number, beats_per_bar?: number) =>
    post<{ wav_b64: string; tempo_bpm: number; beats_per_bar: number; duration_sec: number }>(
      "/export/click-track",
      { musicxml, tempo_bpm, beats_per_bar },
    ),

  exportMinusOne: (musicxml: string, omit_part_index: number) =>
    post<{ status: string; reason: string; omit_part_name: string }>(
      "/export/minus-one",
      { musicxml, omit_part_index },
    ),

  exportStems: (musicxml: string) =>
    post<{ status: string; reason: string; parts: Array<{ index: number; name: string }> }>(
      "/export/stems",
      { musicxml },
    ),

  /* --------------------- multi-agent panel (Pillar 7 P3) ------------- */
  consultPanel: (
    message: string,
    score_musicxml?: string | null,
  ) =>
    post<{
      summary: string;
      contributions: Array<{ agent: string; role: string; reply: string; tool_calls: unknown[] }>;
      diffs: unknown[];
      tool_calls: unknown[];
    }>("/agent/panel", { message, score_musicxml: score_musicxml ?? null }),

  /* --------------------- practice coach (Pillar 10) ------------------ */
  practiceCompare: (target_musicxml: string, performance_musicxml: string) =>
    post<{
      total_measures: number;
      total_errors: number;
      errors_by_measure: Array<{ measure: number; missing: number; extra: number; timing_errors: number; total: number }>;
      heat_map: Array<{ measure: number; error_count: number; severity: "low" | "medium" | "high" }>;
      practice_plan: Array<{ priority: number; measure: number; error_count: number; focus: string }>;
    }>("/practice/compare", { target_musicxml, performance_musicxml }),

  practicePlan: (target_musicxml: string, performance_musicxml: string) =>
    post<{ practice_plan: Array<{ priority: number; measure: number; error_count: number; focus: string }> }>(
      "/practice/plan",
      { target_musicxml, performance_musicxml },
    ),

  /* --------------------- composer style (Pillar 1) ------------------- */
  listComposers: () =>
    get<Array<{ id: string; display_name: string; status: string; note: string }>>("/style/composers"),

  applyStyle: (musicxml: string, composer_id: string, intensity = 0.4) =>
    post<{ status: string; reason: string; composer_id: string; intensity: number; musicxml: string }>(
      "/style/apply",
      { musicxml, composer_id, intensity },
    ),

  /* --------------------- theory tutor (Pillar 8) --------------------- */
  explain: (musicxml: string, measure_start: number, measure_end: number) =>
    post<{
      key: { tonic: string; mode: string };
      chords: Array<{
        measure: number;
        beat: number;
        pitches: string[];
        roman: string;
        symbol: string;
      }>;
      cadences: Array<{
        kind: "authentic" | "plagal" | "half" | "deceptive";
        measure: number;
        beat: number;
        roman_progression: [string, string];
      }>;
      voice_leading: Array<{
        voices: [string, string];
        intervals: Array<{
          measure: number;
          beat: number;
          interval: string;
          midi: [number, number];
        }>;
      }>;
      region: { measure_start: number; measure_end: number };
    }>("/theory/explain", { musicxml, measure_start, measure_end }),
};

export { ApiError };
