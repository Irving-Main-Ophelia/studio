/**
 * Phase-2 Pillar 9 — Harmony Panel (read-only visualizations).
 *
 * Three tabs:
 *   1. Chord Progression  — horizontal timeline, one block per chord,
 *      colour-coded by harmonic function (tonic / subdominant / dominant).
 *   2. Form Diagram       — horizontal section map (A / B / A′) derived
 *      from cadence-based phrase detection.
 *   3. Motif Map          — list of recurring interval-shape motifs with
 *      occurrence counts and measure positions.
 *
 * All data comes from the existing theory-analysis HTTP endpoints; nothing
 * here requires the agent or a streaming connection.
 */

import { BarChart3, Grid, Music2 } from "lucide-react";
import { useEffect, useState } from "react";

import { api } from "../lib/api";
import { useScoreEngine } from "../lib/ScoreEngine";
import type { ProgressionAnalysis, MotifAnalysis } from "@stockhausen/theory-types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FormResult = Awaited<ReturnType<typeof api.formAnalysis>>;
type HarmonyTab = "progression" | "form" | "motifs";

// ---------------------------------------------------------------------------
// Harmonic function colour palette
// ---------------------------------------------------------------------------

function chordColor(roman: string): string {
  const r = roman.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  // Dominant function
  if (r.startsWith("V") || r.startsWith("VII")) return "#f97316"; // orange
  // Subdominant function
  if (r === "IV" || r === "II" || r === "IIo") return "#22c55e"; // green
  // Tonic function (I, III, VI)
  if (r.startsWith("I") || r.startsWith("VI") || r.startsWith("III")) return "#818cf8"; // violet
  return "#6b7280"; // gray — chromatic/secondary
}

// ---------------------------------------------------------------------------
// Chord Progression Timeline
// ---------------------------------------------------------------------------

function ProgressionChart({ progression }: { progression: ProgressionAnalysis }) {
  const chords = progression.chords;
  if (!chords.length) return <Empty>No chords found.</Empty>;

  const total = chords.length;

  return (
    <div className="overflow-x-auto pb-2">
      <p className="mb-2 text-[11px] text-zinc-500">
        {progression.key.tonic} {progression.key.mode} · {chords.length} chords
      </p>
      {/* SVG timeline */}
      <svg
        viewBox={`0 0 ${Math.max(total * 44, 300)} 60`}
        className="w-full overflow-visible"
        style={{ minWidth: total * 44 }}
      >
        {chords.map((ch, i) => {
          const x = i * 44;
          const color = chordColor(ch.roman);
          return (
            <g key={i} transform={`translate(${x}, 0)`}>
              <rect
                x={2}
                y={4}
                width={40}
                height={32}
                rx={4}
                fill={color}
                fillOpacity={0.2}
                stroke={color}
                strokeWidth={1}
              />
              <text
                x={22}
                y={25}
                textAnchor="middle"
                fill={color}
                fontSize={11}
                fontWeight="600"
                fontFamily="monospace"
              >
                {ch.roman}
              </text>
              <text
                x={22}
                y={52}
                textAnchor="middle"
                fill="#6b7280"
                fontSize={8}
                fontFamily="monospace"
              >
                m{ch.measure}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="mt-3 text-[11px] text-zinc-600 italic">{progression.summary}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form Diagram
// ---------------------------------------------------------------------------

const SECTION_COLORS = [
  "#818cf8", // A — violet
  "#f97316", // B — orange
  "#34d399", // C — emerald
  "#fb7185", // D — rose
  "#fbbf24", // E — amber
];

function getSectionColor(_name: string, idx: number): string {
  return SECTION_COLORS[idx % SECTION_COLORS.length];
}

function FormDiagram({ form }: { form: FormResult }) {
  const { sections, phrases, total_measures, key } = form;
  if (!total_measures) return <Empty>No measures found.</Empty>;

  const svgW = 500;
  const barH = 28;
  const phraseH = 12;

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-zinc-500">
        {key.tonic} {key.mode} · {total_measures} measures · {sections.length} section(s) ·{" "}
        {phrases.length} phrase(s)
      </p>

      <svg viewBox={`0 0 ${svgW} ${barH + phraseH + 28}`} className="w-full">
        {/* Section blocks */}
        {sections.map((sec, i) => {
          const x = ((sec.measure_start - 1) / total_measures) * svgW;
          const secW = ((sec.measure_end - sec.measure_start + 1) / total_measures) * svgW;
          const color = getSectionColor(sec.name, i);
          return (
            <g key={i}>
              <rect x={x} y={0} width={secW} height={barH} rx={3} fill={color} fillOpacity={0.25} stroke={color} strokeWidth={1} />
              <text x={x + secW / 2} y={barH / 2 + 4} textAnchor="middle" fill={color} fontSize={12} fontWeight="700">
                {sec.name}
              </text>
            </g>
          );
        })}

        {/* Phrase tick marks */}
        {phrases.map((ph, i) => {
          const x = ((ph.measure_start - 1) / total_measures) * svgW;
          const cad = ph.cadence_kind;
          const cadColor =
            cad === "authentic" ? "#4ade80" :
            cad === "half" ? "#facc15" :
            cad === "plagal" ? "#60a5fa" :
            "#6b7280";
          return (
            <g key={i}>
              <line x1={x} y1={barH} x2={x} y2={barH + phraseH} stroke="#374151" strokeWidth={0.5} />
              {cad && (
                <circle cx={((ph.measure_end - 1) / total_measures) * svgW} cy={barH + phraseH / 2} r={3} fill={cadColor} />
              )}
            </g>
          );
        })}

        {/* Measure ruler */}
        {Array.from({ length: total_measures + 1 }, (_, i) => {
          const x = (i / total_measures) * svgW;
          const showLabel = i === 0 || i === total_measures || i % Math.max(1, Math.floor(total_measures / 8)) === 0;
          return (
            <g key={i}>
              <line x1={x} y1={barH + phraseH + 2} x2={x} y2={barH + phraseH + 6} stroke="#374151" strokeWidth={0.5} />
              {showLabel && (
                <text x={x} y={barH + phraseH + 16} textAnchor="middle" fill="#6b7280" fontSize={7}>
                  {i + 1}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 text-[10px]">
        <span className="text-zinc-500">Cadences:</span>
        {[
          { color: "#4ade80", label: "Authentic" },
          { color: "#facc15", label: "Half" },
          { color: "#60a5fa", label: "Plagal" },
        ].map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1">
            <span style={{ background: color }} className="inline-block h-2 w-2 rounded-full" />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Motif Map
// ---------------------------------------------------------------------------

function MotifMap({ motifs }: { motifs: MotifAnalysis }) {
  if (!motifs.motifs.length) return <Empty>No recurring motifs found.</Empty>;

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-zinc-500">
        {motifs.motifs.length} motif(s) · minimum {motifs.n} notes
      </p>
      <div className="space-y-2">
        {motifs.motifs.map((m, i) => {
          const intervals = m.intervals.map((iv) => (iv > 0 ? `+${iv}` : `${iv}`)).join(" ");
          const positions = m.occurrences.map((o) => `p${o.part_index}m${o.measure}`).join(", ");
          return (
            <div key={i} className="rounded-lg border border-obsidian-600 bg-obsidian-800/60 p-2.5">
              <div className="flex items-center justify-between">
                <span className="num text-xs text-neon-violet font-mono">{intervals}</span>
                <span className="text-[10px] text-zinc-500">{m.occurrences.length}×</span>
              </div>
              <p className="mt-0.5 text-[10px] text-zinc-600">{positions}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-[11px] text-zinc-600">{children}</p>;
}

export function HarmonyPanel(): React.ReactElement {
  const engine = useScoreEngine();
  const musicxml = engine.score?.musicxml ?? null;

  const [tab, setTab] = useState<HarmonyTab>("progression");
  const [progression, setProgression] = useState<ProgressionAnalysis | null>(null);
  const [form, setForm] = useState<FormResult | null>(null);
  const [motifs, setMotifs] = useState<MotifAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!musicxml) {
      setProgression(null);
      setForm(null);
      setMotifs(null);
      return;
    }
    setLoading(true);
    setError(null);
    Promise.all([
      api.progression(musicxml),
      api.formAnalysis(musicxml),
      api.motifs(musicxml),
    ])
      .then(([prog, f, mot]) => {
        setProgression(prog);
        setForm(f);
        setMotifs(mot);
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [musicxml]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Tab bar */}
      <div className="flex shrink-0 border-b border-obsidian-700 text-[11px]">
        <HTab active={tab === "progression"} onClick={() => setTab("progression")} icon={<BarChart3 size={11} />} label="Chords" />
        <HTab active={tab === "form"} onClick={() => setTab("form")} icon={<Grid size={11} />} label="Form" />
        <HTab active={tab === "motifs"} onClick={() => setTab("motifs")} icon={<Music2 size={11} />} label="Motifs" />
      </div>

      <div className="flex-1 overflow-y-auto p-3 text-xs">
        {!musicxml && <Empty>Load a score to analyse it.</Empty>}
        {musicxml && loading && <Empty>Analysing…</Empty>}
        {error && <p className="text-[11px] text-danger">{error}</p>}

        {!loading && !error && musicxml && (
          <>
            {tab === "progression" && progression && <ProgressionChart progression={progression} />}
            {tab === "form" && form && <FormDiagram form={form} />}
            {tab === "motifs" && motifs && <MotifMap motifs={motifs} />}
          </>
        )}
      </div>
    </div>
  );
}

function HTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex flex-1 items-center justify-center gap-1 border-b-2 px-2 py-1.5 text-[10px] uppercase tracking-wider transition-colors",
        active
          ? "border-neon-violet text-zinc-100"
          : "border-transparent text-zinc-500 hover:text-zinc-300",
      ].join(" ")}
    >
      {icon}
      {label}
    </button>
  );
}
