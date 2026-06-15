/**
 * Pillar-6 Orchestration Dialog.
 *
 * Lets the user pick an orchestration profile and applies it to the current
 * score. Shows part-assignment mapping and any range warnings before
 * committing the result.
 */

import { AlertTriangle, Check, ChevronDown, Music2 } from "lucide-react";
import { useEffect, useState } from "react";

import { api } from "../lib/api";
import { useScoreEngine } from "../lib/ScoreEngine";

type Profile = { name: string; display_name: string };
type ApplyResult = Awaited<ReturnType<typeof api.applyProfile>>;

interface OrchestrationDialogProps {
  open: boolean;
  onClose: () => void;
}

export function OrchestrationDialog({ open, onClose }: OrchestrationDialogProps): React.ReactElement | null {
  const engine = useScoreEngine();

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [preview, setPreview] = useState<ApplyResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  // Load profile list on mount
  useEffect(() => {
    api.listProfiles().then((ps) => {
      setProfiles(ps);
      if (ps.length > 0 && !selected) setSelected(ps[0].name);
    }).catch(() => undefined);
  }, []);

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      setPreview(null);
      setError(null);
      setApplied(false);
    }
  }, [open]);

  if (!open) return null;

  async function handlePreview() {
    if (!engine.score || !selected) return;
    setLoading(true);
    setError(null);
    setPreview(null);
    try {
      const result = await api.applyProfile(engine.score.musicxml, selected);
      setPreview(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleApply() {
    if (!preview || !engine.score) return;
    const filename = engine.score.filename ?? "score.musicxml";
    await engine.loadFromXml(filename, preview.musicxml);
    setApplied(true);
    setTimeout(onClose, 800);
  }

  const warningCount = preview?.warnings.length ?? 0;
  const currentProfile = profiles.find((p) => p.name === selected);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[520px] max-w-[90vw] rounded-xl border border-obsidian-600 bg-obsidian-900 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-obsidian-700 px-5 py-4">
          <Music2 size={16} className="text-neon-violet" />
          <h2 className="text-sm font-semibold text-zinc-100">Orchestration Profile</h2>
        </div>

        <div className="space-y-4 p-5">
          {/* Profile selector */}
          <div>
            <label className="mb-1.5 block text-xs text-zinc-400">Profile</label>
            <div className="relative">
              <select
                value={selected}
                onChange={(e) => { setSelected(e.target.value); setPreview(null); }}
                className="w-full appearance-none rounded-lg border border-obsidian-600 bg-obsidian-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-neon-violet"
              >
                {profiles.map((p) => (
                  <option key={p.name} value={p.name}>{p.display_name}</option>
                ))}
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            </div>
          </div>

          {/* Preview button */}
          {!preview && (
            <button
              type="button"
              disabled={loading || !engine.score}
              onClick={handlePreview}
              className="w-full rounded-lg bg-neon-violet/20 px-4 py-2 text-sm font-medium text-neon-violet transition hover:bg-neon-violet/30 disabled:opacity-40"
            >
              {loading ? "Analysing…" : `Preview "${currentProfile?.display_name ?? ""}" assignment`}
            </button>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}

          {/* Preview result */}
          {preview && (
            <div className="space-y-3">
              <p className="text-xs font-medium text-zinc-400">Part assignment</p>
              <div className="space-y-1">
                {preview.assignment.map((a) => (
                  <div key={a.slot_index} className="flex items-center gap-2 rounded-lg bg-obsidian-800 px-3 py-1.5 text-xs">
                    <span className="w-28 font-medium text-zinc-100">{a.slot_name}</span>
                    <span className="text-zinc-500">←</span>
                    <span className="text-zinc-400">
                      {a.source_part_name ?? <span className="italic text-zinc-600">empty</span>}
                    </span>
                  </div>
                ))}
              </div>

              {warningCount > 0 && (
                <div className="rounded-lg border border-yellow-800/50 bg-yellow-900/20 px-3 py-2">
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-yellow-400">
                    <AlertTriangle size={12} />
                    {warningCount} range warning{warningCount !== 1 ? "s" : ""}
                  </div>
                  <div className="max-h-28 space-y-0.5 overflow-y-auto">
                    {preview.warnings.slice(0, 8).map((w, i) => (
                      <p key={i} className="text-[10px] text-yellow-500/80">
                        {w.slot_name} m{w.measure}: {w.pitch} {w.kind === "above_range" ? "too high" : "too low"}
                      </p>
                    ))}
                    {warningCount > 8 && (
                      <p className="text-[10px] text-yellow-600">…and {warningCount - 8} more</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-obsidian-700 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-1.5 text-sm text-zinc-400 transition hover:text-zinc-200"
          >
            Cancel
          </button>
          {preview && !applied && (
            <button
              type="button"
              onClick={handleApply}
              className="flex items-center gap-1.5 rounded-lg bg-neon-violet px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-neon-violet/90"
            >
              Apply
            </button>
          )}
          {applied && (
            <span className="flex items-center gap-1 text-sm text-green-400">
              <Check size={14} /> Applied
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
