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

  /* --------------------- theory analyzers (M1.3) --------------------- */
  progression: (musicxml: string) =>
    post<ProgressionAnalysis>("/theory/progression", { musicxml }),
  voiceLeading: (musicxml: string) =>
    post<VoiceLeadingAnalysis>("/theory/voice-leading", { musicxml }),
  range: (musicxml: string) => post<RangeAnalysis>("/theory/range", { musicxml }),
  cadences: (musicxml: string) => post<CadenceAnalysis>("/theory/cadences", { musicxml }),
  motifs: (musicxml: string, n = 4, min_occurrences = 2) =>
    post<MotifAnalysis>("/theory/motifs", { musicxml, n, min_occurrences }),

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
