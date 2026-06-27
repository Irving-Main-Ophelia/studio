/**
 * After audio/MIDI import, offer to apply the detected key signature.
 */

import { KeyRound } from "lucide-react";

import type { KeyEstimate } from "../lib/api";

interface KeySuggestionDialogProps {
  open: boolean;
  estimate: KeyEstimate | null;
  currentKey: string | null;
  onApply: () => void;
  onSkip: () => void;
  busy?: boolean;
}

export function KeySuggestionDialog({
  open,
  estimate,
  currentKey,
  onApply,
  onSkip,
  busy = false,
}: KeySuggestionDialogProps): React.ReactElement | null {
  if (!open || !estimate) return null;

  const detected = `${estimate.key} ${estimate.mode}`.trim();
  const confidencePct = Math.round(estimate.confidence * 100);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-[380px] rounded-lg border border-neon-violet/30 bg-obsidian-900 p-6 shadow-2xl">
        <div className="mb-3 flex items-center gap-2 text-neon-violet">
          <KeyRound size={18} />
          <h2 className="text-base font-medium text-zinc-100">Key detected</h2>
        </div>
        <p className="text-sm text-zinc-300">
          Analysis suggests <strong className="text-neon-cyan">{detected}</strong> ({confidencePct}%
          confidence).
        </p>
        {currentKey && currentKey !== detected && (
          <p className="mt-2 text-xs text-zinc-500">
            Project key is currently <span className="text-zinc-400">{currentKey}</span>.
          </p>
        )}
        <p className="mt-3 text-xs text-zinc-500">
          Apply the key signature to the score? Accidentals and the key display will update. You can
          transpose later if needed.
        </p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onApply}
            className="flex-1 rounded-md bg-neon-violet/20 py-2 text-sm font-medium text-neon-violet hover:bg-neon-violet/30 disabled:opacity-50"
          >
            Apply {detected}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onSkip}
            className="flex-1 rounded-md border border-obsidian-600 py-2 text-sm text-zinc-400 hover:bg-obsidian-800"
          >
            Keep as-is
          </button>
        </div>
      </div>
    </div>
  );
}
