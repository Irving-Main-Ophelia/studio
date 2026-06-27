/**
 * Context menu for a selected note — double-click or right-click on the staff.
 */

import { ArrowDown, ArrowUp, Music2, Trash2, Type } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { SelectedNote } from "../editor/SelectionState";
import type { Articulation, Dynamic } from "../lib/api";
import { useViewportMenuPosition } from "./useViewportMenuPosition";

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"] as const;

const DURATIONS: Array<{ label: string; quarters: number }> = [
  { label: "Whole", quarters: 4 },
  { label: "Half", quarters: 2 },
  { label: "Quarter", quarters: 1 },
  { label: "Eighth", quarters: 0.5 },
  { label: "16th", quarters: 0.25 },
];

const ARTICULATIONS: Articulation[] = ["staccato", "accent", "marcato", "tenuto", "fermata"];
const DYNAMICS: Dynamic[] = ["ppp", "pp", "p", "mp", "mf", "f", "ff", "fff"];

function parseOctave(pitch: string): number {
  const m = pitch.match(/(\d+)\s*$/);
  return m ? Number(m[1]) : 4;
}

function isChord(pitch: string): boolean {
  return pitch.includes("-");
}

export interface NoteEditMenuProps {
  note: SelectedNote;
  x: number;
  y: number;
  error?: string | null;
  onClose: () => void;
  onDuration: (quarters: number) => void;
  onArticulation: (articulation: Articulation) => void;
  onDynamic: (dynamic: Dynamic) => void;
  onRespell: () => void;
  onPitch: (pitch: string) => void;
  onTranspose: (semitones: number) => void;
  onRemove: () => void;
  busy?: boolean;
}

export function NoteEditMenu({
  note,
  x,
  y,
  error,
  onClose,
  onDuration,
  onArticulation,
  onDynamic,
  onRespell,
  onPitch,
  onTranspose,
  onRemove,
  busy = false,
}: NoteEditMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [accidental, setAccidental] = useState<"" | "#" | "-">("");
  const { left, top, maxHeight, ready } = useViewportMenuPosition(ref, x, y);
  const octave = parseOctave(note.pitch.split("-")[0] ?? note.pitch);
  const chord = isChord(note.pitch);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const buildPitch = (letter: string) => {
    const acc = accidental === "#" ? "#" : accidental === "-" ? "-" : "";
    return `${letter}${acc}${octave}`;
  };

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Edit note"
      data-note-edit-menu=""
      className={[
        "fixed z-[200] flex w-[min(20rem,calc(100vw-1.5rem))] flex-col rounded-lg border border-obsidian-600",
        "bg-obsidian-900/95 text-xs text-zinc-200 shadow-2xl backdrop-blur-md",
        ready ? "opacity-100" : "pointer-events-none opacity-0",
      ].join(" ")}
      style={{ left, top, maxHeight }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="shrink-0 border-b border-obsidian-700 px-3 pb-2 pt-3">
        <div className="flex items-center gap-2 font-medium text-neon-cyan">
          <Music2 size={14} />
          <span>{note.pitch}</span>
        </div>
        <p className="mt-1 text-[10px] text-zinc-500">
          {note.part_name} · m.{note.measure_number} · beat {note.beat_offset.toFixed(2)}
        </p>
        {chord && (
          <p className="mt-1 text-[10px] text-neon-amber">
            Chord — pitch change keeps the top note as a single pitch.
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2">
        <Section title="Pitch (height)">
          <div className="mb-1 flex gap-1">
            <button
              type="button"
              disabled={busy}
              onClick={() => onTranspose(-1)}
              className="flex flex-1 items-center justify-center gap-1 rounded bg-obsidian-800 py-1 hover:bg-obsidian-700"
            >
              <ArrowDown size={12} /> −1 st
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onTranspose(1)}
              className="flex flex-1 items-center justify-center gap-1 rounded bg-obsidian-800 py-1 hover:bg-obsidian-700"
            >
              <ArrowUp size={12} /> +1 st
            </button>
          </div>
          <div className="mb-1 flex gap-1">
            {(["", "#", "-"] as const).map((a) => (
              <button
                key={a || "nat"}
                type="button"
                disabled={busy}
                onClick={() => setAccidental(a)}
                className={[
                  "flex-1 rounded py-0.5",
                  accidental === a ? "bg-neon-violet/25 text-neon-violet" : "bg-obsidian-800",
                ].join(" ")}
              >
                {a === "" ? "♮" : a === "#" ? "♯" : "♭"}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {LETTERS.map((l) => (
              <button
                key={l}
                type="button"
                disabled={busy}
                onClick={() => onPitch(buildPitch(l))}
                className="w-8 rounded bg-obsidian-800 py-1 font-medium hover:bg-neon-cyan/20 hover:text-neon-cyan"
              >
                {l}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Duration">
          <div className="flex flex-wrap gap-1">
            {DURATIONS.map((d) => (
              <button
                key={d.quarters}
                type="button"
                disabled={busy}
                onClick={() => onDuration(d.quarters)}
                className={[
                  "rounded px-2 py-1 transition",
                  Math.abs(note.duration_quarters - d.quarters) < 1e-3
                    ? "bg-neon-violet/25 text-neon-violet"
                    : "bg-obsidian-800 hover:bg-obsidian-700",
                ].join(" ")}
              >
                {d.label}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Articulation">
          <div className="flex flex-wrap gap-1">
            {ARTICULATIONS.map((a) => (
              <button
                key={a}
                type="button"
                disabled={busy}
                onClick={() => onArticulation(a)}
                className="rounded bg-obsidian-800 px-2 py-1 capitalize hover:bg-obsidian-700"
              >
                {a}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Dynamic">
          <div className="flex flex-wrap gap-1">
            {DYNAMICS.map((d) => (
              <button
                key={d}
                type="button"
                disabled={busy}
                onClick={() => onDynamic(d)}
                className="rounded bg-obsidian-800 px-2 py-1 font-mono hover:bg-obsidian-700"
              >
                {d}
              </button>
            ))}
          </div>
        </Section>
      </div>

      <div className="shrink-0 border-t border-obsidian-700 px-3 py-2">
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy || chord}
            onClick={onRespell}
            className="flex flex-1 items-center justify-center gap-1 rounded border border-obsidian-600 py-1.5 hover:border-neon-cyan/50 disabled:opacity-40"
          >
            <Type size={12} />
            Respell
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onRemove}
            className="flex items-center gap-1 rounded border border-danger/40 px-3 py-1.5 text-danger hover:bg-danger/10"
          >
            <Trash2 size={12} />
            Remove
          </button>
        </div>

        {busy && (
          <p className="mt-2 text-[10px] text-neon-cyan">
            Applying… (large scores may take a few seconds)
          </p>
        )}
        {error && <p className="mt-2 text-[10px] text-danger">{error}</p>}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <p className="mb-1 text-[9px] uppercase tracking-wider text-zinc-500">{title}</p>
      {children}
    </div>
  );
}
