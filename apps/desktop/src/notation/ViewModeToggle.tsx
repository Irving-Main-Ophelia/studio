/**
 * Per-part notation view toggle — staff / tab / both (Track A, A1).
 *
 * Switches what OSMD renders for the guitar part: standard staff, tablature, or
 * both. The canonical score stays standard notation (ADR-0015); the tab view is a
 * read-only projection, so editing is only offered in `staff` view.
 */

import type { ViewMode } from "../project/types";

const MODES: { value: ViewMode; label: string }[] = [
  { value: "staff", label: "Staff" },
  { value: "tab", label: "Tab" },
  { value: "both", label: "Both" },
  { value: "lead", label: "Lead" },
];

interface ViewModeToggleProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
  busy?: boolean;
  disabled?: boolean;
}

export function ViewModeToggle({ value, onChange, busy = false, disabled = false }: ViewModeToggleProps) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Notation view">
      <span className="text-zinc-500">View:</span>
      <div className="flex overflow-hidden rounded border border-obsidian-600">
        {MODES.map((mode) => {
          const active = mode.value === value;
          return (
            <button
              key={mode.value}
              type="button"
              disabled={disabled}
              aria-pressed={active}
              onClick={() => onChange(mode.value)}
              className={[
                "px-2 py-0.5 font-medium transition-colors",
                active
                  ? "bg-neon-cyan/20 text-neon-cyan"
                  : "bg-obsidian-900 text-zinc-400 hover:bg-obsidian-700",
                disabled ? "cursor-not-allowed opacity-50" : "",
              ].join(" ")}
            >
              {mode.label}
            </button>
          );
        })}
      </div>
      {busy && <span className="text-zinc-500">rendering…</span>}
    </div>
  );
}
