/**
 * Phase 3 Pillar 12 — Production Exports Panel.
 *
 * Three production export options:
 *   1. Click Track  — generates + downloads a stereo WAV metronome click
 *   2. Stems        — per-track WAVs (stub; requires Pillar 5 full render)
 *   3. Minus-One    — score with one part omitted (stub; requires Pillar 5)
 *
 * Import shape: `{ open, onClose }` — same pattern as ExportDialog.
 */

import { AlertCircle, ChevronDown, Download, Lock, Music2 } from "lucide-react";
import { useEffect, useState } from "react";

import { BACKEND_URL } from "../lib/api";
import { useScoreEngine } from "../lib/ScoreEngine";

// ---------------------------------------------------------------------------
// Types mirroring backend responses
// ---------------------------------------------------------------------------

interface ClickTrackResponse {
  wav_b64: string;
  tempo_bpm: number;
  beats_per_bar: number;
  duration_sec: number;
}

interface Part {
  index: number;
  name: string;
}

interface StemsResponse {
  status: "stub";
  reason: string;
  parts: Part[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function postJson<T>(path: string, body: unknown): Promise<T> {
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
      // non-JSON body
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

function b64ToBlob(b64: string, mime: string): Blob {
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ProductionExportPanelProps {
  open: boolean;
  onClose: () => void;
}

type BusyKey = "click-track" | "stems" | "minus-one";

export function ProductionExportPanel({
  open,
  onClose,
}: ProductionExportPanelProps): React.ReactElement | null {
  const engine = useScoreEngine();

  const [busy, setBusy] = useState<BusyKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Stems state
  const [parts, setParts] = useState<Part[]>([]);
  const [stemsLoaded, setStemsLoaded] = useState(false);

  // Minus-one state — which part index to omit
  const [omitIndex, setOmitIndex] = useState<number>(0);

  const score = engine.score;

  // Fetch parts list whenever dialog opens with a score
  useEffect(() => {
    if (!open || !score) {
      setStemsLoaded(false);
      setParts([]);
      return;
    }
    postJson<StemsResponse>("/export/stems", { musicxml: score.musicxml })
      .then((r) => {
        setParts(r.parts);
        setStemsLoaded(true);
      })
      .catch(() => {
        setStemsLoaded(true); // still mark loaded so we show the stub badge
      });
  }, [open, score]);

  if (!open) return null;

  const ready = Boolean(score);

  // ------- Click Track -------
  async function handleClickTrack() {
    if (!score) return;
    setBusy("click-track");
    setError(null);
    try {
      const res = await postJson<ClickTrackResponse>("/export/click-track", {
        musicxml: score.musicxml,
      });
      const blob = b64ToBlob(res.wav_b64, "audio/wav");
      const stem = (score.filename ?? "score").replace(/\.[^.]+$/, "");
      triggerDownload(blob, `${stem}-click-track.wav`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[500px] max-w-[92vw] rounded-xl border border-obsidian-600 bg-obsidian-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-obsidian-700 px-5 py-4">
          <Music2 size={16} className="text-neon-violet" />
          <h2 className="text-sm font-semibold text-zinc-100">Production Exports</h2>
        </div>

        <div className="space-y-3 p-5">
          {!ready && (
            <p className="rounded-lg border border-obsidian-700 bg-obsidian-800 px-3 py-3 text-sm text-zinc-400">
              Open a project and load a score to enable production exports.
            </p>
          )}

          {ready && (
            <>
              {/* --- 1. Click Track --- */}
              <section className="rounded-lg border border-obsidian-700 bg-obsidian-800 p-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-100">Click Track</span>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={handleClickTrack}
                    className="flex items-center gap-1.5 rounded-lg bg-neon-violet/20 px-3 py-1 text-xs font-medium text-neon-violet transition hover:bg-neon-violet/30 disabled:opacity-40"
                  >
                    <Download size={11} />
                    {busy === "click-track" ? "Generating…" : "Download"}
                  </button>
                </div>
                <p className="text-[10px] text-zinc-500">
                  Stereo 44.1 kHz WAV. Beat 1 accented at 1000 Hz; remaining beats at 800 Hz.
                </p>
              </section>

              {/* --- 2. Stems --- */}
              <section className="rounded-lg border border-obsidian-700 bg-obsidian-800 p-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-100">Stems</span>
                  <span className="flex items-center gap-1 rounded-full border border-obsidian-500 bg-obsidian-700 px-2 py-0.5 text-[9px] font-medium text-zinc-400">
                    <Lock size={9} />
                    Coming Soon
                  </span>
                </div>
                <p className="mb-2 text-[10px] text-zinc-500">
                  Per-track WAV export. Requires sfizz.wasm full render (Pillar 5).
                </p>
                {stemsLoaded && parts.length > 0 && (
                  <ul className="space-y-1">
                    {parts.map((p) => (
                      <li
                        key={p.index}
                        className="flex items-center justify-between rounded bg-obsidian-700/60 px-2 py-1"
                      >
                        <span className="text-[10px] text-zinc-300">{p.name}</span>
                        <span className="flex items-center gap-0.5 text-[9px] text-zinc-600">
                          <Lock size={8} />
                          Locked
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* --- 3. Minus-One --- */}
              <section className="rounded-lg border border-obsidian-700 bg-obsidian-800 p-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-100">Minus-One</span>
                  <span className="flex items-center gap-1 rounded-full border border-obsidian-500 bg-obsidian-700 px-2 py-0.5 text-[9px] font-medium text-zinc-400">
                    <Lock size={9} />
                    Coming Soon
                  </span>
                </div>
                <p className="mb-2 text-[10px] text-zinc-500">
                  Score rendered with one part omitted. Requires sfizz.wasm full render (Pillar 5).
                </p>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <select
                      disabled
                      value={omitIndex}
                      onChange={(e) => setOmitIndex(Number(e.target.value))}
                      className="w-full appearance-none rounded border border-obsidian-600 bg-obsidian-700 px-2 py-1 text-xs text-zinc-400 outline-none opacity-50 cursor-not-allowed"
                    >
                      {parts.length > 0 ? (
                        parts.map((p) => (
                          <option key={p.index} value={p.index}>
                            {p.name}
                          </option>
                        ))
                      ) : (
                        <option value={0}>Part 0</option>
                      )}
                    </select>
                    <ChevronDown
                      size={10}
                      className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-zinc-600"
                    />
                  </div>
                  <button
                    type="button"
                    disabled
                    className="flex items-center gap-1 rounded-lg bg-obsidian-700 px-3 py-1 text-xs text-zinc-600 cursor-not-allowed"
                  >
                    <Lock size={10} />
                    Export
                  </button>
                </div>
              </section>
            </>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-2">
              <AlertCircle size={13} className="mt-0.5 shrink-0 text-red-400" />
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-obsidian-700 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-1.5 text-sm text-zinc-400 transition hover:text-zinc-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
