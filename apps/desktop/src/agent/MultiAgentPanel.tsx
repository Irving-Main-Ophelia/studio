/**
 * Phase-3 Pillar 7 — Multi-Agent Composition Panel.
 *
 * Presents a brief textarea and a "Consult Panel" button. On submit,
 * fires POST /agent/panel and shows the four specialist agent cards
 * (Planner, Harmonist, Counterpoint, Orchestrator) plus the final
 * orchestrator synthesis.
 *
 * Wired via api.consultPanel(message, musicxml) — the method must be
 * present in api.ts (added separately per task spec).
 */

import { Loader2, Users } from "lucide-react";
import { useState } from "react";

import { api } from "../lib/api";
import { useScoreEngine } from "../lib/ScoreEngine";

// ---------------------------------------------------------------------------
// Types — mirror the backend PanelResponse shape
// ---------------------------------------------------------------------------

interface AgentContribution {
  agent: string;
  role: string;
  reply: string;
  tool_calls: unknown[];
}

interface PanelResult {
  summary: string;
  contributions: AgentContribution[];
  diffs: unknown[];
  tool_calls: unknown[];
}

// ---------------------------------------------------------------------------
// Agent card metadata
// ---------------------------------------------------------------------------

const AGENT_META: Record<string, { emoji: string; accent: string }> = {
  planner: { emoji: "🗺", accent: "#818cf8" },        // violet
  harmonist: { emoji: "🎵", accent: "#f97316" },       // orange
  counterpoint: { emoji: "✍️", accent: "#34d399" },    // emerald
  orchestrator: { emoji: "🎼", accent: "#fbbf24" },    // amber
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function AgentCard({ contribution }: { contribution: AgentContribution }) {
  const meta = AGENT_META[contribution.agent] ?? { emoji: "🤖", accent: "#6b7280" };
  return (
    <div
      className="rounded-lg border bg-obsidian-800/60 p-3 text-xs"
      style={{ borderColor: `${meta.accent}40` }}
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="text-sm leading-none">{meta.emoji}</span>
        <span className="font-semibold" style={{ color: meta.accent }}>
          {contribution.role}
        </span>
        <span className="ml-auto text-[10px] text-zinc-600 font-mono uppercase">
          {contribution.agent}
        </span>
      </div>
      <p className="leading-relaxed text-zinc-300 whitespace-pre-wrap">{contribution.reply}</p>
    </div>
  );
}

function Spinner() {
  return (
    <span className="flex items-center gap-1.5 text-zinc-400 text-[11px]">
      <Loader2 size={13} className="animate-spin" />
      Panel thinking…
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function MultiAgentPanel(): React.ReactElement {
  const engine = useScoreEngine();
  const musicxml = engine.score?.musicxml ?? null;

  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PanelResult | null>(null);

  const handleConsult = async () => {
    if (!brief.trim()) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await (api as any).consultPanel(brief.trim(), musicxml);
      setResult(data as PanelResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex h-full flex-col border-l border-obsidian-700 bg-obsidian-900/70 text-zinc-200">
      {/* Header */}
      <header className="flex shrink-0 items-center gap-2 border-b border-obsidian-700 px-3 py-2">
        <Users size={14} className="text-neon-violet" />
        <h3 className="text-xs font-medium uppercase tracking-widest text-zinc-300">
          Composition Panel
        </h3>
      </header>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
        {/* Brief input */}
        <div className="flex flex-col gap-2">
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="Describe what you want to compose or revise…"
            rows={3}
            disabled={busy}
            className="w-full resize-none rounded border border-obsidian-600 bg-obsidian-800 px-2.5 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-neon-violet/60 focus:outline-none disabled:opacity-50"
          />
          <button
            type="button"
            onClick={handleConsult}
            disabled={busy || !brief.trim()}
            className="self-end inline-flex items-center gap-1.5 rounded border border-neon-violet/40 bg-neon-violet/10 px-3 py-1.5 text-[11px] text-neon-violet hover:bg-neon-violet/20 disabled:opacity-40 transition-colors"
          >
            {busy ? <Loader2 size={11} className="animate-spin" /> : <Users size={11} />}
            Consult Panel
          </button>
        </div>

        {/* Loading state */}
        {busy && (
          <div className="flex justify-center py-4">
            <Spinner />
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="rounded border border-danger/40 bg-danger/10 p-2.5 text-[11px] text-danger">
            {error}
          </div>
        )}

        {/* Results */}
        {result && !busy && (
          <div className="flex flex-col gap-3">
            {/* Specialist agent cards */}
            <div className="flex flex-col gap-2">
              {result.contributions.map((c) => (
                <AgentCard key={c.agent} contribution={c} />
              ))}
            </div>

            {/* Orchestrator synthesis */}
            <div className="rounded-lg border border-neon-violet/30 bg-neon-violet/5 p-3">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-neon-violet">
                Synthesis
              </p>
              <p className="text-xs leading-relaxed text-zinc-200 whitespace-pre-wrap">
                {result.summary}
              </p>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!result && !busy && !error && (
          <p className="text-center text-[11px] text-zinc-600 py-4">
            Describe a composition goal and the panel will give you a multi-perspective plan.
          </p>
        )}
      </div>
    </section>
  );
}
