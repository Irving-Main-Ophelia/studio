/**
 * Banner shown after a hard exit: the journal had N operations whose
 * materialised state was never folded into `score.musicxml`. The user
 * decides — recover or discard.
 *
 * In practice "recover" replays the pending ops and rewrites the snapshot.
 * "Discard" leaves the journal alone (we never truncate it) but bumps
 * `last_op_index` so the entries are no longer marked as pending.
 */

import { AlertTriangle, Check, X } from "lucide-react";

import { useScoreEngine } from "../lib/ScoreEngine";

export function RecoveryBanner() {
  const engine = useScoreEngine();
  const pending = engine.pendingRecovery;

  if (!pending || pending.length === 0) return null;

  return (
    <div className="border-b border-neon-amber/40 bg-neon-amber/10 px-4 py-2 text-xs text-neon-amber">
      <div className="mx-auto flex max-w-5xl items-center gap-3">
        <AlertTriangle size={14} />
        <div className="flex-1">
          <div className="font-medium">Recovered from unsaved work</div>
          <div className="text-[10px] text-neon-amber/80">
            {pending.length} operation{pending.length === 1 ? "" : "s"} were
            journalled but never written into the score snapshot. They are
            still on disk; choose what to do with them.
          </div>
        </div>
        <button
          onClick={() => void engine.acceptPendingRecovery()}
          className="flex items-center gap-1 rounded border border-neon-emerald/40 bg-neon-emerald/10 px-2 py-1 text-[11px] text-neon-emerald transition-colors hover:bg-neon-emerald/20"
        >
          <Check size={12} />
          Apply
        </button>
        <button
          onClick={() => engine.discardPendingRecovery()}
          className="flex items-center gap-1 rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-400 transition-colors hover:bg-obsidian-700"
        >
          <X size={12} />
          Ignore
        </button>
      </div>
    </div>
  );
}
