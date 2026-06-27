/**
 * Always-visible note editor controls — works on imported scores like Chan Cil.
 */

import { Pencil } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { NoteEditMenu } from "../notation/NoteEditMenu";
import { api, type Articulation, type Dynamic } from "../lib/api";
import { useScoreEngine } from "../lib/ScoreEngine";
import type { SelectedNote } from "./SelectionState";

export function NoteEditToolbar() {
  const engine = useScoreEngine();
  const [menu, setMenu] = useState<{ note: SelectedNote; x: number; y: number } | null>(null);
  const [measure, setMeasure] = useState(1);
  const [beat, setBeat] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  const openAtCursor = useCallback(async () => {
    if (!engine.score) return;
    setErr(null);
    const c = engine.editor.cursor;
    try {
      const info = await api.getNoteInfo({
        musicxml: engine.score.musicxml,
        part_index: c.part_index,
        measure_number: measure,
        beat_offset: beat,
        voice: c.voice,
      });
      if (info.is_rest || !info.pitch) {
        setErr(`No note at m.${measure} beat ${beat} — try another position.`);
        return;
      }
      const note: SelectedNote = {
        part_index: info.part_index,
        measure_number: info.measure_number,
        beat_offset: info.beat_offset,
        voice: info.voice,
        pitch: info.pitch,
        duration_quarters: info.duration_quarters,
        part_name: info.part_name,
        midi: info.midi,
      };
      engine.selectNote(note);
      setMenu({ note, x: window.innerWidth / 2 - 140, y: 120 });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [engine, measure, beat]);

  useEffect(() => {
    setMenu((m) => {
      if (!m || !engine.selection.note) return m;
      const sel = engine.selection.note;
      if (
        m.note.part_index === sel.part_index &&
        m.note.measure_number === sel.measure_number &&
        Math.abs(m.note.beat_offset - sel.beat_offset) < 1e-2
      ) {
        return { ...m, note: sel };
      }
      return m;
    });
  }, [engine.selection.note]);

  useEffect(() => {
    if (!engine.project) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "e" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t instanceof HTMLElement) {
        const tag = t.tagName.toLowerCase();
        if (tag === "input" || tag === "textarea" || t.isContentEditable) return;
      }
      e.preventDefault();
      void openAtCursor();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [engine.project, openAtCursor]);

  if (!engine.project) return null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-obsidian-700 bg-obsidian-800/80 px-3 py-1.5 text-[10px] text-zinc-400">
        <Pencil size={11} className="text-neon-cyan" />
        <span className="font-medium text-zinc-300">The score is SVG — not Word yet.</span>
        <span className="text-zinc-500">Edit via:</span>
        <label className="flex items-center gap-1">
          <span>m.</span>
          <input
            type="number"
            min={1}
            value={measure}
            onChange={(e) => setMeasure(Number(e.target.value) || 1)}
            className="num w-14 rounded border border-obsidian-600 bg-obsidian-900 px-1 py-0.5 text-zinc-200"
          />
        </label>
        <label className="flex items-center gap-1">
          <span>beat</span>
          <input
            type="number"
            min={0}
            step={0.25}
            value={beat}
            onChange={(e) => setBeat(Number(e.target.value) || 0)}
            className="num w-16 rounded border border-obsidian-600 bg-obsidian-900 px-1 py-0.5 text-zinc-200"
          />
        </label>
        <button
          type="button"
          onClick={() => void openAtCursor()}
          className="rounded bg-neon-violet/20 px-2 py-0.5 font-medium text-neon-violet hover:bg-neon-violet/30"
        >
          Edit note (E)
        </button>
        <span className="text-zinc-600">· dbl-click · right-click · drag pitch</span>
        {err && <span className="text-danger">{err}</span>}
      </div>

      {menu && (
        <NoteEditMenu
          note={menu.note}
          x={menu.x}
          y={menu.y}
          busy={engine.editorBusy}
          error={engine.editorError ?? err}
          onClose={() => setMenu(null)}
          onDuration={(q) => void engine.editNoteDuration(menu.note, q)}
          onArticulation={(a: Articulation) => void engine.editNoteArticulation(menu.note, a)}
          onDynamic={(d: Dynamic) => void engine.editNoteDynamic(menu.note, d)}
          onRespell={() => void engine.editNoteRespell(menu.note)}
          onPitch={(p) => void engine.editNotePitch(menu.note, p)}
          onTranspose={(st) => void engine.transposeNote(menu.note, st)}
          onRemove={() => {
            void engine.removeNoteAt(menu.note);
            setMenu(null);
          }}
        />
      )}
    </>
  );
}
