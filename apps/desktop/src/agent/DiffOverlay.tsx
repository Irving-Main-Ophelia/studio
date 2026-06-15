/**
 * Diff Overlay — agent's proposed score change in --neon-violet.
 *
 * The agent never mutates the score directly (PHASE_1.md §1.7). When a
 * tool call returns a ScoreDiff, it lands here as `engine.pendingDiff`.
 * The maintainer then Accepts (apply + record in operation log), Rejects
 * (discard), or Refines (sends a follow-up chat message).
 */

import { AlertTriangle, CheckCircle2, RotateCcw, X } from "lucide-react";
import { useState } from "react";

import type { DiffWarning, ScoreDiff } from "../lib/api";
import { useScoreEngine } from "../lib/ScoreEngine";

function operationTitle(diff: ScoreDiff): string {
  switch (diff.tool) {
    case "score.transpose":
      return "Transpose";
    case "score.modulate":
      return "Modulate";
    case "score.reharmonize":
      return "Reharmonize";
    case "score.add_section":
      return "Add section";
    case "score.replace_bars":
      return "Replace bars";
    default:
      return diff.tool;
  }
}

export function DiffOverlay(): React.ReactElement | null {
  const engine = useScoreEngine();
  const [busy, setBusy] = useState(false);
  const [refinement, setRefinement] = useState("");
  const [showRefine, setShowRefine] = useState(false);

  const diff = engine.pendingDiff;
  if (!diff) return null;

  const accept = async () => {
    setBusy(true);
    try {
      await engine.acceptPendingDiff();
      // Auto-play so you hear the change immediately — no separate click needed.
      if (engine.score) engine.play();
    } finally {
      setBusy(false);
    }
  };

  const reject = () => {
    engine.rejectPendingDiff();
  };

  const submitRefinement = async () => {
    if (!refinement.trim()) return;
    setBusy(true);
    try {
      await engine.sendChat(refinement.trim());
      setRefinement("");
      setShowRefine(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-40 z-40 flex justify-center">
      <div className="pointer-events-auto w-[560px] max-w-[90vw] rounded-lg border border-neon-violet/40 bg-obsidian-900/95 p-4 text-zinc-100 shadow-[0_0_40px_-10px_rgba(168,85,247,0.6)] backdrop-blur">
        <div className="mb-3 flex items-center gap-2">
          <span className="rounded bg-neon-violet/20 px-2 py-0.5 text-[10px] uppercase tracking-widest text-neon-violet">
            Agent proposal
          </span>
          <span className="text-sm font-medium">{operationTitle(diff)}</span>
          <button
            type="button"
            onClick={reject}
            className="ml-auto text-zinc-500 hover:text-zinc-100"
            aria-label="Reject"
          >
            <X size={16} />
          </button>
        </div>

        <p className="mb-3 text-sm text-zinc-300">{diff.description}</p>

        {diff.warnings.length > 0 && <DiffWarnings warnings={diff.warnings} />}

        {showRefine ? (
          <div className="mt-3 flex gap-2">
            <input
              autoFocus
              value={refinement}
              onChange={(e) => setRefinement(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submitRefinement();
                if (e.key === "Escape") setShowRefine(false);
              }}
              placeholder="What should the agent change?"
              className="flex-1 rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm"
            />
            <button
              type="button"
              onClick={submitRefinement}
              disabled={busy || !refinement.trim()}
              className="rounded border border-neon-violet/40 bg-neon-violet/20 px-3 py-1.5 text-xs text-neon-violet hover:bg-neon-violet/30 disabled:opacity-50"
            >
              Send
            </button>
          </div>
        ) : (
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={reject}
              disabled={busy}
              className="rounded border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-100"
            >
              Reject
            </button>
            <button
              type="button"
              onClick={() => setShowRefine(true)}
              disabled={busy}
              className="rounded border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
            >
              <span className="inline-flex items-center gap-1">
                <RotateCcw size={12} /> Refine
              </span>
            </button>
            <button
              type="button"
              onClick={accept}
              disabled={busy}
              className="rounded border border-neon-violet/40 bg-neon-violet/20 px-3 py-1.5 text-xs text-neon-violet hover:bg-neon-violet/30 disabled:opacity-50"
            >
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 size={12} /> Accept
              </span>
            </button>
          </div>
        )}

        <p className="mt-3 text-[10px] text-zinc-500">
          diff <span className="num">{diff.diff_id.slice(0, 8)}</span> · base{" "}
          <span className="num">{diff.base_score_hash}</span>
        </p>
      </div>
    </div>
  );
}

function DiffWarnings({ warnings }: { warnings: DiffWarning[] }) {
  return (
    <ul className="mb-3 space-y-1 rounded border border-neon-amber/30 bg-neon-amber/5 p-2">
      {warnings.slice(0, 4).map((w, i) => (
        <li key={i} className="flex gap-2 text-[12px] text-neon-amber">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>
            <span className="font-medium">{w.kind.replace(/_/g, " ")}</span> — {w.detail}
            {w.measure !== null && (
              <span className="ml-1 text-neon-amber/70">
                (m. {w.measure}
                {w.beat !== null ? `, beat ${w.beat}` : ""})
              </span>
            )}
          </span>
        </li>
      ))}
      {warnings.length > 4 && (
        <li className="text-[10px] text-neon-amber/70">
          + {warnings.length - 4} more warning{warnings.length - 4 === 1 ? "" : "s"}
        </li>
      )}
    </ul>
  );
}
