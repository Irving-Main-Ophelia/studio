/**
 * Auto chord-diagram strip above the staff, with a GP8-style density control
 * (Track A, A5 §4.7 Q2 — opt-in, off by default).
 *
 * The composer's work is contrapuntal classical, not chord charts, so this is off
 * unless asked for; the density control trades clutter for coverage:
 *   off     — hidden (no request is made)
 *   unique  — one diagram per distinct chord in the piece (a legend)
 *   changes — a diagram each time the chord changes
 *   all     — a diagram on every bar with an identifiable chord
 */

import { ChordDiagram, type ChordDiagramData } from "./ChordDiagram";

export type ChordDensity = "off" | "unique" | "changes" | "all";

const DENSITIES: { value: ChordDensity; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "unique", label: "Unique" },
  { value: "changes", label: "Changes" },
  { value: "all", label: "All" },
];

export interface DiagramRow extends ChordDiagramData {
  measure: number;
}

interface ChordDiagramStripProps {
  density: ChordDensity;
  onDensity: (density: ChordDensity) => void;
  diagrams: DiagramRow[];
  busy?: boolean;
  error?: string | null;
}

export function ChordDiagramStrip({
  density,
  onDensity,
  diagrams,
  busy = false,
  error = null,
}: ChordDiagramStripProps) {
  const showRow = density !== "off";
  return (
    <div className="flex items-start gap-3 border-b border-obsidian-700 bg-obsidian-800/40 px-3 py-1.5 text-[10px] text-zinc-400">
      <div className="flex shrink-0 items-center gap-1 pt-6" role="group" aria-label="Chord diagrams">
        <span className="text-zinc-500">Chords:</span>
        <div className="flex overflow-hidden rounded border border-obsidian-600">
          {DENSITIES.map((d) => {
            const active = d.value === density;
            return (
              <button
                key={d.value}
                type="button"
                aria-pressed={active}
                onClick={() => onDensity(d.value)}
                className={[
                  "px-2 py-0.5 font-medium transition-colors",
                  active
                    ? "bg-neon-cyan/20 text-neon-cyan"
                    : "bg-obsidian-900 text-zinc-400 hover:bg-obsidian-700",
                ].join(" ")}
              >
                {d.label}
              </button>
            );
          })}
        </div>
        {busy && <span className="text-zinc-500">…</span>}
      </div>
      {showRow && (
        <div className="flex min-w-0 flex-1 items-start gap-2 overflow-x-auto">
          {error ? (
            <span className="pt-6 text-danger">Chord diagrams failed: {error}</span>
          ) : diagrams.length === 0 && !busy ? (
            <span className="pt-6 text-zinc-500">No identifiable chords in this score.</span>
          ) : (
            diagrams.map((d) => (
              <div key={`${d.measure}-${d.chord}`} className="shrink-0" title={`Bar ${d.measure}`}>
                <ChordDiagram data={d} />
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
