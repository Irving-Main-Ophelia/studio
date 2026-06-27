/**
 * Small footer strip under the score that shows the editor cursor state.
 * Inspired by ProTools' edit-mode strip, but pared down for notation:
 * cursor position, active duration, octave, and any pending tie.
 *
 *   measure 3 ▸ beat 2.0   ♩  oct 4  •  shift+letter = sharp
 */

import { Hash, Pencil } from "lucide-react";

import { useScoreEngine } from "../lib/ScoreEngine";

const DURATION_GLYPHS: Array<{ value: number; glyph: string; name: string }> = [
  { value: 4, glyph: "𝅝", name: "whole" },
  { value: 2, glyph: "𝅗𝅥", name: "half" },
  { value: 1, glyph: "♩", name: "quarter" },
  { value: 0.5, glyph: "♪", name: "eighth" },
  { value: 0.25, glyph: "𝅘𝅥𝅯", name: "sixteenth" },
];

function durationLabel(q: number): { glyph: string; name: string } {
  const match = DURATION_GLYPHS.find((d) => Math.abs(d.value - q) < 1e-3);
  if (match) return match;
  return { glyph: "♩", name: `${q}q` };
}

export function EditorStatusBar() {
  const engine = useScoreEngine();
  if (!engine.project) return null;
  const e = engine.editor;
  const sel = engine.selection.note;
  const label = durationLabel(e.duration_quarters);

  return (
    <div className="flex items-center justify-between border-t border-obsidian-700 bg-obsidian-900/60 px-3 py-1 text-[10px] text-zinc-400">
      <div className="flex items-center gap-2">
        <Pencil size={10} className="text-neon-cyan/80" />
        {sel ? (
          <span className="num text-neon-cyan">
            <span className="text-zinc-500">selected</span> {sel.pitch}{" "}
            <span className="text-zinc-600">·</span> {sel.part_name}{" "}
            <span className="text-zinc-600">·</span> m.{sel.measure_number}
          </span>
        ) : (
          <span className="num">
            <span className="text-zinc-500">part</span>{" "}
            <span className="text-zinc-200">{e.cursor.part_index + 1}</span>
            <span className="text-zinc-600"> · </span>
            <span className="text-zinc-500">m.</span>{" "}
            <span className="text-zinc-200">{e.cursor.measure_number}</span>
            <span className="text-zinc-600"> · </span>
            <span className="text-zinc-500">beat</span>{" "}
            <span className="text-zinc-200">{e.cursor.beat_offset.toFixed(2)}</span>
          </span>
        )}
        <span className="text-zinc-600">·</span>
        <span title={`${label.name} note`} className="flex items-center gap-1">
          <span className="text-base leading-none text-neon-cyan/80">{label.glyph}</span>
          {e.dot && <span className="text-neon-cyan/80">.</span>}
          {e.triplet && <span className="text-[9px] text-neon-violet">3</span>}
        </span>
        <span className="text-zinc-600">·</span>
        <span className="num flex items-center gap-1">
          <Hash size={9} className="text-zinc-600" />
          <span className="text-zinc-500">oct</span>{" "}
          <span className="text-zinc-200">{e.octave}</span>
        </span>
        {e.pending_tie && (
          <>
            <span className="text-zinc-600">·</span>
            <span className="text-neon-amber">tying next</span>
          </>
        )}
        {engine.editorBusy && (
          <>
            <span className="text-zinc-600">·</span>
            <span className="text-neon-cyan">writing…</span>
          </>
        )}
      </div>
      <div className="flex items-center gap-3 text-[9px] text-zinc-500">
        <span>
          <kbd className="num">a–g</kbd> note,{" "}
          <kbd className="num">⇧letter</kbd> ♯,{" "}
          <kbd className="num">⌥letter</kbd> ♭
        </span>
        <span>
          <kbd className="num">1 2 4 8 6</kbd> duration,{" "}
          <kbd className="num">.</kbd> dot,{" "}
          <kbd className="num">3</kbd> triplet
        </span>
        <span>
          <kbd className="num">dbl-click</kbd> edit note · <kbd className="num">⇧drag</kbd> select
          measures
        </span>
        {engine.captureMode && (
          <span className="text-neon-magenta">Capture mode — play to replace selection</span>
        )}
        {engine.editorError && <span className="text-danger">{engine.editorError}</span>}
      </div>
    </div>
  );
}
