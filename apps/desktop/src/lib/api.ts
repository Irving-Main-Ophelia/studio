/**
 * Backend agent client. The agent lives on 127.0.0.1:8000.
 *
 * Every request is fail-closed: if the backend is unreachable we surface
 * the error to the caller so the UI can show a banner.
 */

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

export interface ChatResult {
  reply: string;
  tool_calls: ToolCallRecord[];
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
};

export { ApiError };
