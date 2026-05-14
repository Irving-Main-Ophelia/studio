/**
 * Theory Tutor Panel — Pillar 8.
 *
 * The maintainer picks a measure range and presses Explain; the tutor
 * shows Roman-numeral analysis, cadences, and voice-leading intervals
 * for that region. Backed by the /theory/explain route which composes
 * the new analyzers (M1.3).
 *
 * This is a self-contained panel that lives in the right rail next to
 * the Agent Panel. We deliberately keep the layout flat — the goal is
 * a glance-friendly digest, not a full theory textbook.
 */

import { GraduationCap, RefreshCw } from "lucide-react";
import { useState } from "react";

import { api } from "../lib/api";
import { useScoreEngine } from "../lib/ScoreEngine";

type ExplainResult = Awaited<ReturnType<typeof api.explain>>;

export function TheoryTutor(): React.ReactElement {
  const engine = useScoreEngine();
  const [measureStart, setMeasureStart] = useState(1);
  const [measureEnd, setMeasureEnd] = useState(4);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ExplainResult | null>(null);

  const run = async () => {
    if (!engine.score) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.explain(engine.score.musicxml, measureStart, measureEnd);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex h-full flex-col border-l border-obsidian-700 bg-obsidian-900/70 text-zinc-200">
      <header className="flex items-center gap-2 border-b border-obsidian-700 px-3 py-2">
        <GraduationCap size={14} className="text-neon-cyan" />
        <h3 className="text-xs font-medium uppercase tracking-widest text-zinc-300">
          Theory Tutor
        </h3>
      </header>

      <div className="space-y-2 px-3 py-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-zinc-500">Bars</span>
          <input
            type="number"
            min={1}
            value={measureStart}
            onChange={(e) => setMeasureStart(Math.max(1, Number(e.target.value)))}
            className="w-14 rounded border border-obsidian-600 bg-obsidian-800 px-1 py-0.5 text-zinc-100"
          />
          <span className="text-zinc-500">–</span>
          <input
            type="number"
            min={1}
            value={measureEnd}
            onChange={(e) => setMeasureEnd(Math.max(1, Number(e.target.value)))}
            className="w-14 rounded border border-obsidian-600 bg-obsidian-800 px-1 py-0.5 text-zinc-100"
          />
          <button
            type="button"
            onClick={run}
            disabled={busy || !engine.score}
            className="ml-auto inline-flex items-center gap-1 rounded border border-neon-cyan/40 bg-neon-cyan/10 px-2 py-1 text-[11px] text-neon-cyan hover:bg-neon-cyan/20 disabled:opacity-40"
          >
            <RefreshCw size={11} className={busy ? "animate-spin" : ""} />
            Explain
          </button>
        </div>

        {error && (
          <p className="rounded border border-danger/40 bg-danger/10 p-2 text-danger">{error}</p>
        )}

        {data && <TutorBody data={data} />}
        {!data && !error && (
          <p className="text-[11px] text-zinc-500">
            Pick a measure range and press Explain. The tutor shows the
            Roman-numeral progression, any cadences, and the voice-leading
            intervals between adjacent voices.
          </p>
        )}
      </div>
    </section>
  );
}

function TutorBody({ data }: { data: ExplainResult }) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-[10px] uppercase tracking-widest text-zinc-500">Key</p>
        <p className="text-sm text-zinc-100">
          {data.key.tonic} {data.key.mode}
        </p>
      </div>

      {data.chords.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">Chords</p>
          <ul className="num space-y-0.5 text-[11px]">
            {data.chords.map((c, i) => (
              <li key={i} className="flex gap-2">
                <span className="w-12 text-zinc-500">
                  m{c.measure}.{c.beat.toFixed(1)}
                </span>
                <span className="w-12 text-neon-violet">{c.roman}</span>
                <span className="text-zinc-300">{c.symbol}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.cadences.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">Cadences</p>
          <ul className="space-y-0.5 text-[11px]">
            {data.cadences.map((c, i) => (
              <li key={i} className="flex gap-2 text-neon-amber">
                <span className="w-12 num text-zinc-500">
                  m{c.measure}.{c.beat.toFixed(1)}
                </span>
                <span className="capitalize">{c.kind}</span>
                <span className="text-zinc-400">
                  {c.roman_progression[0]} → {c.roman_progression[1]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.voice_leading.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">Voice leading</p>
          {data.voice_leading.map((pair, i) => (
            <details key={i} className="text-[11px]">
              <summary className="cursor-pointer text-zinc-400 hover:text-zinc-200">
                {pair.voices[0]} ↔ {pair.voices[1]} ({pair.intervals.length})
              </summary>
              <ul className="num ml-3 mt-1 space-y-0.5 text-zinc-500">
                {pair.intervals.slice(0, 8).map((iv, j) => (
                  <li key={j}>
                    m{iv.measure}.{iv.beat.toFixed(1)}: {iv.interval}
                  </li>
                ))}
                {pair.intervals.length > 8 && (
                  <li className="text-[10px] text-zinc-600">
                    + {pair.intervals.length - 8} more
                  </li>
                )}
              </ul>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
