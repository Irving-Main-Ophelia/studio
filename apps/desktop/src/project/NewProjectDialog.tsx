/**
 * Modal that gathers the metadata for a fresh project — title, composer,
 * tempo, time signature, key signature — and asks `ScoreEngine` to create it.
 *
 * The dialog deliberately stays minimal: instrumentation in M1.0 is locked
 * to "Piano (grand staff)" so the maintainer can start writing immediately.
 * M1.1 will introduce part-management UI.
 */

import { useEffect, useId, useState } from "react";
import { Sparkles, X } from "lucide-react";

import { useScoreEngine } from "../lib/ScoreEngine";
import { buildScoreInitOp } from "./OperationLog";
import {
  COMMON_TIME_SIGNATURES,
  SUPPORTED_KEYS,
  buildBlankPianoScore,
} from "./scoreTemplate";
import type { NewProjectSpec } from "./types";

interface NewProjectDialogProps {
  open: boolean;
  onClose: () => void;
}

export function NewProjectDialog({ open, onClose }: NewProjectDialogProps) {
  const engine = useScoreEngine();
  const titleId = useId();
  const composerId = useId();
  const tempoId = useId();
  const tsId = useId();
  const keyId = useId();

  const [title, setTitle] = useState("Untitled");
  const [composer, setComposer] = useState("");
  const [tempo, setTempo] = useState(90);
  const [timeSig, setTimeSig] = useState("4/4");
  const [keySig, setKeySig] = useState("C major");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state every time the dialog opens.
  useEffect(() => {
    if (open) {
      setTitle("Untitled");
      setComposer("");
      setTempo(90);
      setTimeSig("4/4");
      setKeySig("C major");
      setError(null);
    }
  }, [open]);

  // Honour the Escape key.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const musicxml = buildBlankPianoScore({
        title,
        composer,
        tempo_bpm: tempo,
        time_signature: timeSig,
        key_signature: keySig,
        bars: 4,
      });
      const initialOp = buildScoreInitOp({
        musicxml,
        title,
        composer,
        tempo_bpm: tempo,
        time_signature: timeSig,
        key_signature: keySig,
      });
      const spec: NewProjectSpec = {
        title,
        composer,
        tempo_bpm: tempo,
        time_signature: timeSig,
        key_signature: keySig,
        instrumentation: [
          { id: "piano", instrument: "piano", channel: 0 },
        ],
        initial_musicxml: musicxml,
        initial_operation: initialOp,
      };
      await engine.newProject(spec);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-obsidian-900/80 px-4">
      <form
        onSubmit={onSubmit}
        className="glass-panel w-[28rem] max-w-full rounded-xl p-6 text-sm"
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-neon-magenta" />
            <h2 className="font-medium tracking-wide text-zinc-100">New Project</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-zinc-500 transition-colors hover:bg-obsidian-700 hover:text-zinc-200"
          >
            <X size={14} />
          </button>
        </div>

        <div className="space-y-3">
          <Field label="Title" htmlFor={titleId}>
            <input
              id={titleId}
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputClass}
              required
            />
          </Field>
          <Field label="Composer" htmlFor={composerId}>
            <input
              id={composerId}
              value={composer}
              onChange={(e) => setComposer(e.target.value)}
              placeholder="(optional)"
              className={inputClass}
            />
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Tempo" htmlFor={tempoId} compact>
              <div className="flex items-center gap-1">
                <input
                  id={tempoId}
                  type="number"
                  min={20}
                  max={300}
                  value={tempo}
                  onChange={(e) => setTempo(Number(e.target.value))}
                  className={`${inputClass} num text-right`}
                />
                <span className="num text-[10px] uppercase tracking-widest text-zinc-500">
                  bpm
                </span>
              </div>
            </Field>
            <Field label="Time" htmlFor={tsId} compact>
              <select
                id={tsId}
                value={timeSig}
                onChange={(e) => setTimeSig(e.target.value)}
                className={`${inputClass} num`}
              >
                {COMMON_TIME_SIGNATURES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Key" htmlFor={keyId} compact>
              <select
                id={keyId}
                value={keySig}
                onChange={(e) => setKeySig(e.target.value)}
                className={inputClass}
              >
                {SUPPORTED_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <p className="text-[10px] text-zinc-500">
            Phase 1 starts with a 4-bar empty grand-staff piano. The notation
            editor in M1.1 will let you add bars and parts.
          </p>
        </div>

        {error && (
          <div className="mt-4 rounded border border-danger/40 bg-danger/10 p-2 text-[11px] text-danger">
            {error}
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:bg-obsidian-700 hover:text-zinc-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-neon-magenta/20 px-3 py-1.5 text-xs font-medium text-neon-magenta ring-1 ring-neon-magenta/40 transition-colors hover:bg-neon-magenta/30 disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-obsidian-700 bg-obsidian-900 px-2 py-1.5 text-zinc-100 placeholder:text-zinc-600 focus:border-neon-cyan/60 focus:outline-none focus:ring-1 focus:ring-neon-cyan/40";

function Field({
  label,
  htmlFor,
  children,
  compact,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <label htmlFor={htmlFor} className="block">
      <span
        className={`num mb-1 block uppercase tracking-widest text-zinc-500 ${
          compact ? "text-[9px]" : "text-[10px]"
        }`}
      >
        {label}
      </span>
      {children}
    </label>
  );
}
