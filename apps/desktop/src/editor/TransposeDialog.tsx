/**
 * Modal for Pillar-2 transposition.
 *
 * Two modes:
 *  - Whole score → target key (calls `engine.transpose`).
 *  - Measure range, optional part filter → calls `engine.transposeRegion`.
 *
 * Form is intentionally minimal: this exists so the maintainer can drive
 * the new theory engine before the agent owns the diff overlay (M1.4).
 */

import { useState } from "react";

import { useScoreEngine } from "../lib/ScoreEngine";

const ENHARMONIC_KEYS = [
  "C",
  "G",
  "D",
  "A",
  "E",
  "B",
  "F#",
  "C#",
  "F",
  "Bb",
  "Eb",
  "Ab",
  "Db",
  "Gb",
  "Cb",
];

const MODES = ["major", "minor"] as const;

interface TransposeDialogProps {
  open: boolean;
  onClose: () => void;
}

export function TransposeDialog({ open, onClose }: TransposeDialogProps): React.ReactElement | null {
  const engine = useScoreEngine();
  const [mode, setMode] = useState<"whole" | "region">("whole");
  const [tonic, setTonic] = useState("C");
  const [modeKey, setModeKey] = useState<(typeof MODES)[number]>("major");
  const [intervalName, setIntervalName] = useState("M2");
  const [useInterval, setUseInterval] = useState(false);
  const [measureStart, setMeasureStart] = useState(1);
  const [measureEnd, setMeasureEnd] = useState(4);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  if (!open) return null;

  const submit = async () => {
    setSubmitting(true);
    setFeedback(null);
    try {
      if (mode === "whole") {
        await engine.transpose(`${tonic} ${modeKey}`);
        setFeedback(`Transposed to ${tonic} ${modeKey}.`);
      } else {
        const target = useInterval
          ? { interval_name: intervalName }
          : { target_key: `${tonic} ${modeKey}` };
        const result = await engine.transposeRegion(target, {
          measure_start: measureStart,
          measure_end: measureEnd,
        });
        if (result) {
          setFeedback(
            result.warnings > 0
              ? `Region transposed — ${result.warnings} range warning(s).`
              : `Region transposed cleanly.`,
          );
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[420px] rounded-lg border border-neutral-800 bg-neutral-950 p-6 text-neutral-100 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-medium">Transpose</h2>

        <div className="mb-4 flex gap-2">
          <button
            type="button"
            className={`flex-1 rounded border px-3 py-1.5 text-sm transition ${
              mode === "whole"
                ? "border-violet-500 bg-violet-500/15 text-violet-100"
                : "border-neutral-800 text-neutral-400 hover:border-neutral-700"
            }`}
            onClick={() => setMode("whole")}
          >
            Whole score
          </button>
          <button
            type="button"
            className={`flex-1 rounded border px-3 py-1.5 text-sm transition ${
              mode === "region"
                ? "border-violet-500 bg-violet-500/15 text-violet-100"
                : "border-neutral-800 text-neutral-400 hover:border-neutral-700"
            }`}
            onClick={() => setMode("region")}
          >
            Measure range
          </button>
        </div>

        {mode === "region" && (
          <>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={useInterval}
                onChange={(e) => setUseInterval(e.target.checked)}
              />
              Use raw interval (e.g. <code>M2</code>, <code>-P5</code>)
            </label>
            {useInterval && (
              <div className="mt-2">
                <label className="block text-xs uppercase tracking-wide text-neutral-400">
                  Interval
                </label>
                <input
                  type="text"
                  value={intervalName}
                  onChange={(e) => setIntervalName(e.target.value)}
                  className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm"
                />
              </div>
            )}
          </>
        )}

        {!(mode === "region" && useInterval) && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs uppercase tracking-wide text-neutral-400">
                Tonic
              </label>
              <select
                value={tonic}
                onChange={(e) => setTonic(e.target.value)}
                className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm"
              >
                {ENHARMONIC_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wide text-neutral-400">Mode</label>
              <select
                value={modeKey}
                onChange={(e) => setModeKey(e.target.value as (typeof MODES)[number])}
                className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm"
              >
                {MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {mode === "region" && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs uppercase tracking-wide text-neutral-400">
                From measure
              </label>
              <input
                type="number"
                min={1}
                value={measureStart}
                onChange={(e) => setMeasureStart(Number(e.target.value))}
                className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wide text-neutral-400">
                To measure
              </label>
              <input
                type="number"
                min={1}
                value={measureEnd}
                onChange={(e) => setMeasureEnd(Number(e.target.value))}
                className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm"
              />
            </div>
          </div>
        )}

        {feedback && (
          <p className="mt-3 rounded border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-sm text-violet-100">
            {feedback}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-neutral-800 px-3 py-1.5 text-sm text-neutral-400 hover:text-neutral-200"
          >
            Close
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || !engine.score}
            className="rounded border border-violet-500 bg-violet-500/20 px-3 py-1.5 text-sm text-violet-50 transition hover:bg-violet-500/30 disabled:opacity-50"
          >
            {submitting ? "Transposing…" : "Apply"}
          </button>
        </div>
      </div>
    </div>
  );
}
