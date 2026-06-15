/**
 * Phase-2 Pillar 4: Generate Score dialog.
 *
 * A focused modal where the composer describes a piece in natural language
 * and hits Generate. Claude emits a music21 script, the backend executes
 * it, and the resulting MusicXML is loaded into the editor.
 *
 * Constraints (key, time, bars, style) are optional power-user fields that
 * collapse into an "Advanced" accordion.
 */

import { Loader2, Music, Sparkles } from "lucide-react";
import { useState } from "react";

import { api } from "../lib/api";
import { useScoreEngine } from "../lib/ScoreEngine";

interface GenerateScoreDialogProps {
  open: boolean;
  onClose: () => void;
}

const EXAMPLE_PROMPTS = [
  "a 16-bar étude in D minor, lyrical, piano solo",
  "an 8-bar fanfare for brass quartet in C major",
  "a gentle waltz in G major, 12 bars, chamber trio",
  "a dramatic prelude in F# minor, 24 bars",
];

export function GenerateScoreDialog({ open, onClose }: GenerateScoreDialogProps) {
  const engine = useScoreEngine();
  const [prompt, setPrompt] = useState("");
  const [key, setKey] = useState("");
  const [time, setTime] = useState("");
  const [bars, setBars] = useState("");
  const [style, setStyle] = useState("");
  const [texture, setTexture] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const canGenerate = prompt.trim().length > 0 && !busy;

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setBusy(true);
    setError(null);
    try {
      const constraints: Record<string, unknown> = {};
      if (key.trim()) constraints.key = key.trim();
      if (time.trim()) constraints.time = time.trim();
      if (bars.trim()) constraints.bars = parseInt(bars, 10);
      if (style.trim()) constraints.style = style.trim();
      if (texture.trim()) constraints.texture = texture.trim();

      const result = await api.generateScore(prompt.trim(), constraints);
      await engine.loadFromXml(`generated-${Date.now()}.musicxml`, result.musicxml);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="glass-panel w-full max-w-lg rounded-xl p-6 text-sm shadow-2xl">
        {/* Header */}
        <div className="mb-5 flex items-center gap-2">
          <Sparkles size={16} className="text-neon-violet" />
          <h2 className="text-base font-semibold tracking-tight">Generate Score</h2>
          <span className="ml-auto text-[11px] text-zinc-500">Pillar 4 · Claude + music21</span>
        </div>

        {/* Prompt */}
        <label className="block">
          <span className="mb-1.5 block text-xs text-zinc-400 uppercase tracking-wider">
            Describe the piece
          </span>
          <textarea
            autoFocus
            rows={3}
            className="w-full rounded-lg border border-obsidian-600 bg-obsidian-800 px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-neon-violet/60 focus:ring-1 focus:ring-neon-violet/30 resize-none"
            placeholder="a 16-bar étude in D minor, lyrical, piano solo…"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void handleGenerate();
            }}
          />
        </label>

        {/* Example prompts */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {EXAMPLE_PROMPTS.map((ex) => (
            <button
              key={ex}
              className="rounded-full border border-obsidian-600 px-2 py-0.5 text-[10px] text-zinc-500 transition-colors hover:border-neon-violet/50 hover:text-zinc-300"
              onClick={() => setPrompt(ex)}
            >
              {ex}
            </button>
          ))}
        </div>

        {/* Advanced constraints */}
        <button
          className="mt-4 flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
          onClick={() => setShowAdvanced((v) => !v)}
        >
          <span className={`transition-transform ${showAdvanced ? "rotate-90" : ""}`}>▶</span>
          Advanced constraints
        </button>

        {showAdvanced && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <ConstraintField label="Key" placeholder="D minor" value={key} onChange={setKey} />
            <ConstraintField label="Time" placeholder="4/4" value={time} onChange={setTime} />
            <ConstraintField
              label="Bars"
              placeholder="16"
              type="number"
              value={bars}
              onChange={setBars}
            />
            <ConstraintField
              label="Tempo (BPM)"
              placeholder="80"
              type="number"
              value={style}
              onChange={setStyle}
            />
            <ConstraintField
              label="Style"
              placeholder="lyrical"
              value={style}
              onChange={setStyle}
              className="col-span-2"
            />
            <ConstraintField
              label="Instrumentation"
              placeholder="piano solo"
              value={texture}
              onChange={setTexture}
              className="col-span-2"
            />
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            className="rounded-lg px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-100 transition-colors"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            disabled={!canGenerate}
            onClick={() => void handleGenerate()}
            className="flex items-center gap-2 rounded-lg bg-neon-violet/20 px-4 py-1.5 text-xs text-neon-violet ring-1 ring-neon-violet/40 transition-all hover:bg-neon-violet/30 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Music size={12} />
                Generate  <span className="opacity-50">⌘↵</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConstraintField({
  label,
  placeholder,
  value,
  onChange,
  type = "text",
  className = "",
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-[11px] text-zinc-500 uppercase tracking-wider">{label}</span>
      <input
        type={type}
        className="w-full rounded-md border border-obsidian-600 bg-obsidian-800 px-2.5 py-1.5 text-xs text-zinc-100 placeholder-zinc-600 outline-none focus:border-neon-violet/60"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
