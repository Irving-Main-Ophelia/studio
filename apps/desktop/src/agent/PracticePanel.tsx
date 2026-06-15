/**
 * Pillar-10 Practice Coach Panel.
 *
 * Compares the user's performance against the target score and renders:
 *   - An empty state with instructions when no data is loaded
 *   - A heat-map visualization: measure cells colored green/yellow/red by
 *     error severity (low / medium / high)
 *   - A practice plan list ordered worst-first
 *
 * Data flow:
 *   api.practiceCompare(targetXml, performanceXml) → CompareResult
 * The api call is typed here but NOT added to api.ts.
 */

import { Piano } from "lucide-react";
import { useState } from "react";

// ---------------------------------------------------------------------------
// Types (mirrors the backend compare_performance response)
// ---------------------------------------------------------------------------

interface MeasureError {
  measure: number;
  missing: number;
  extra: number;
  timing_errors: number;
  total: number;
}

interface HeatMapCell {
  measure: number;
  error_count: number;
  severity: "low" | "medium" | "high";
}

interface PracticeItem {
  priority: number;
  measure: number;
  error_count: number;
  focus: string;
}

interface CompareResult {
  total_measures: number;
  total_errors: number;
  errors_by_measure: MeasureError[];
  heat_map: HeatMapCell[];
  practice_plan: PracticeItem[];
}

// Expected api shape — NOT modifying api.ts; consumer must wire this up.
// eslint-disable-next-line @typescript-eslint/no-namespace
declare namespace api {
  function practiceCompare(
    targetXml: string,
    performanceXml: string
  ): Promise<CompareResult>;
}

// ---------------------------------------------------------------------------
// Severity colour mapping (obsidian dark theme)
// ---------------------------------------------------------------------------

function severityColor(severity: "low" | "medium" | "high"): string {
  switch (severity) {
    case "low":
      return "#22c55e"; // green-500
    case "medium":
      return "#eab308"; // yellow-500
    case "high":
      return "#ef4444"; // red-500
  }
}

// ---------------------------------------------------------------------------
// Heat Map
// ---------------------------------------------------------------------------

function HeatMap({ cells }: { cells: HeatMapCell[] }) {
  if (!cells.length) {
    return (
      <p className="py-3 text-center text-[11px] text-zinc-600">
        No measure data available.
      </p>
    );
  }

  const cellW = 20;
  const cellH = 28;
  const gap = 2;
  const svgW = cells.length * (cellW + gap);

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${svgW} ${cellH + 18}`}
        className="w-full"
        style={{ minWidth: Math.min(svgW, 300) }}
        aria-label="Practice heat map"
      >
        {cells.map((cell, i) => {
          const x = i * (cellW + gap);
          const color = severityColor(cell.severity);
          return (
            <g key={cell.measure} transform={`translate(${x}, 0)`}>
              <rect
                x={0}
                y={0}
                width={cellW}
                height={cellH}
                rx={3}
                fill={color}
                fillOpacity={cell.error_count === 0 ? 0.15 : 0.55}
                stroke={color}
                strokeWidth={0.5}
              />
              {cell.error_count > 0 && (
                <text
                  x={cellW / 2}
                  y={cellH / 2 + 4}
                  textAnchor="middle"
                  fill={color}
                  fontSize={9}
                  fontWeight="700"
                  fontFamily="monospace"
                >
                  {cell.error_count}
                </text>
              )}
              {(cell.measure === 1 ||
                cell.measure % Math.max(1, Math.floor(cells.length / 8)) ===
                  0) && (
                <text
                  x={cellW / 2}
                  y={cellH + 13}
                  textAnchor="middle"
                  fill="#6b7280"
                  fontSize={7}
                >
                  {cell.measure}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="mt-2 flex gap-3 text-[10px] text-zinc-500">
        {(["low", "medium", "high"] as const).map((sev) => (
          <span key={sev} className="flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-sm"
              style={{ background: severityColor(sev), opacity: 0.7 }}
            />
            {sev.charAt(0).toUpperCase() + sev.slice(1)}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Practice Plan List
// ---------------------------------------------------------------------------

function PracticePlan({ items }: { items: PracticeItem[] }) {
  if (!items.length) {
    return (
      <p className="py-2 text-[11px] text-zinc-600">
        No measures need focused practice. Well done!
      </p>
    );
  }
  return (
    <ol className="space-y-1.5">
      {items.map((item) => (
        <li
          key={item.measure}
          className="flex items-center justify-between rounded-md border border-obsidian-600 bg-obsidian-800/60 px-3 py-2"
        >
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-neon-violet/20 text-[10px] font-bold text-neon-violet">
              {item.priority}
            </span>
            <span className="text-[11px] text-zinc-200">
              Measure {item.measure}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-zinc-500">
            <span className="text-zinc-400">{item.focus}</span>
            <span className="rounded bg-obsidian-700 px-1 py-0.5 font-mono text-danger">
              {item.error_count} err
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center">
      <Piano size={32} className="text-zinc-600" />
      <div className="space-y-1">
        <p className="text-[12px] font-medium text-zinc-400">
          No performance loaded yet
        </p>
        <p className="text-[11px] text-zinc-600">
          Connect your instrument and play the score.
          <br />
          The coach will analyze your performance.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function PracticePanel(): React.ReactElement {
  const [result, setResult] = useState<CompareResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Placeholder handler — wired up by the parent when real performance XML
  // becomes available from the MIDI capture pipeline.
  function handleCompare(targetXml: string, performanceXml: string) {
    setLoading(true);
    setError(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (api as any)
      .practiceCompare(targetXml, performanceXml)
      .then((res: CompareResult) => setResult(res))
      .catch((err: unknown) => setError(String(err)))
      .finally(() => setLoading(false));
  }

  // Suppress unused-variable warning for the handler that the parent calls.
  void handleCompare;

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4 text-xs">
      {/* Header */}
      <div className="space-y-0.5">
        <h2 className="text-[13px] font-semibold text-zinc-100">
          Practice Coach
        </h2>
        <p className="text-[11px] text-zinc-500">
          Practice Coach compares your performance against the target score.
        </p>
      </div>

      {/* Instruction banner */}
      <div className="rounded-lg border border-obsidian-600 bg-obsidian-800/40 px-3 py-2.5 text-[11px] text-zinc-400">
        Connect your instrument and play the score. The coach will analyze your
        performance.
      </div>

      {/* Status / content */}
      {loading && (
        <p className="py-6 text-center text-[11px] text-zinc-500">
          Analyzing performance…
        </p>
      )}

      {error && (
        <p className="rounded border border-danger/30 bg-danger/10 px-3 py-2 text-[11px] text-danger">
          {error}
        </p>
      )}

      {!loading && !error && !result && <EmptyState />}

      {!loading && !error && result && (
        <div className="space-y-5">
          {/* Summary */}
          <div className="flex gap-4 text-[11px]">
            <span className="text-zinc-500">
              Measures:{" "}
              <span className="text-zinc-200">{result.total_measures}</span>
            </span>
            <span className="text-zinc-500">
              Total errors:{" "}
              <span
                className={
                  result.total_errors === 0 ? "text-green-400" : "text-danger"
                }
              >
                {result.total_errors}
              </span>
            </span>
          </div>

          {/* Heat map */}
          <section>
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Heat Map
            </h3>
            <HeatMap cells={result.heat_map} />
          </section>

          {/* Practice plan */}
          <section>
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Practice Plan
            </h3>
            <PracticePlan items={result.practice_plan} />
          </section>
        </div>
      )}
    </div>
  );
}
