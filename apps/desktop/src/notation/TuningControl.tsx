/**
 * Per-part tuning / capo control (Track A, A3 — M4.2).
 *
 * Presets (standard / drop D / DADGAD / bass) + a custom pitch array + a capo, all
 * persisted into `project.json` (schema v3). Changing the tuning re-projects the
 * read-only tab view; "Refret" rewrites the canonical score's fret positions to
 * follow the tuning (Pillar-2 respelling).
 */

import { useEffect, useState } from "react";

import { GUITAR_TUNING_PRESETS, tuningPresetId } from "../project/types";

const PRESET_LABELS: Record<string, string> = {
  standard: "Standard",
  drop_d: "Drop D",
  dadgad: "DADGAD",
  bass_standard: "Bass",
  custom: "Custom",
};

interface TuningControlProps {
  tuning: string[];
  capo: number;
  onTuning: (tuning: string[]) => void;
  onCapo: (capo: number) => void;
  onRefret: () => void;
  busy?: boolean;
}

export function TuningControl({
  tuning,
  capo,
  onTuning,
  onCapo,
  onRefret,
  busy = false,
}: TuningControlProps) {
  const presetId = tuningPresetId(tuning);
  const [customText, setCustomText] = useState(tuning.join(" "));

  // Keep the editable text in sync when the persisted tuning changes elsewhere.
  useEffect(() => {
    setCustomText(tuning.join(" "));
  }, [tuning]);

  const handlePreset = (id: string) => {
    if (id === "custom") return; // editing happens in the text field
    const preset = GUITAR_TUNING_PRESETS[id];
    if (preset) onTuning(preset);
  };

  const commitCustom = () => {
    const parsed = customText
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean);
    // String 1 (highest) first; require at least 4 strings. Reject obvious junk.
    const valid = parsed.length >= 4 && parsed.every((p) => /^[A-Ga-g][#b♯♭x]*\d$/.test(p));
    if (valid) onTuning(parsed);
    else setCustomText(tuning.join(" ")); // revert
  };

  return (
    <div className="flex items-center gap-1.5" role="group" aria-label="Tuning and capo">
      <span className="text-zinc-500">Tuning:</span>
      <select
        value={presetId}
        disabled={busy}
        onChange={(e) => handlePreset(e.target.value)}
        className="rounded border border-obsidian-600 bg-obsidian-900 px-1 py-0.5 text-zinc-300"
      >
        {Object.keys(PRESET_LABELS).map((id) => (
          <option key={id} value={id}>
            {PRESET_LABELS[id]}
          </option>
        ))}
      </select>
      <input
        aria-label="Custom tuning (string 1 first)"
        value={customText}
        disabled={busy}
        onChange={(e) => setCustomText(e.target.value)}
        onBlur={commitCustom}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className="num w-32 rounded border border-obsidian-600 bg-obsidian-900 px-1 py-0.5 font-mono text-zinc-300"
      />
      <label className="flex items-center gap-1">
        <span>Capo</span>
        <input
          type="number"
          min={0}
          max={24}
          value={capo}
          disabled={busy}
          onChange={(e) => onCapo(Math.max(0, Math.min(24, Number(e.target.value) || 0)))}
          className="num w-12 rounded border border-obsidian-600 bg-obsidian-900 px-1 py-0.5 text-zinc-300"
        />
      </label>
      <button
        type="button"
        disabled={busy}
        onClick={onRefret}
        title="Rewrite this part's fret positions to follow the tuning/capo"
        className="rounded bg-neon-violet/20 px-2 py-0.5 font-medium text-neon-violet hover:bg-neon-violet/30 disabled:opacity-40"
      >
        ↺ Refret
      </button>
    </div>
  );
}
