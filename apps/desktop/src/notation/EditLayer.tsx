/**
 * Interactive pointer layer on the scrollable score container.
 */

import type { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { useEffect, useRef, useState } from "react";

import type { MeasureRange, SelectedNote } from "../editor/SelectionState";
import type { Articulation, Dynamic } from "../lib/api";
import type { ListedNoteRow } from "../lib/api";
import { hitTestAnnotatedNote } from "./osmdAnnotate";
import { NoteEditMenu } from "./NoteEditMenu";
import { hitTestNote } from "./osmdHitTest";
import { quartersPerMeasure, resolveNoteForEdit } from "./noteResolve";
import {
  chordTopMidi,
  PITCH_DRAG_THRESHOLD_PX,
  previewPitchFromDrag,
  semitonesFromDrag,
} from "./pitchDrag";

export interface EditLayerProps {
  osmd: OpenSheetMusicDisplay | null;
  /** Scrollable wrapper — pointer events and overlay coordinates. */
  scrollContainer: HTMLElement | null;
  /** DOM node OSMD renders into (must not host React children). */
  scoreRoot: HTMLElement | null;
  noteIndex: ListedNoteRow[];
  timeSignature?: string;
  enabled: boolean;
  selectedNote: SelectedNote | null;
  measureRange: MeasureRange | null;
  captureMode: boolean;
  onSelectNote: (note: SelectedNote | null) => void;
  onMeasureRange: (range: MeasureRange | null) => void;
  onDuration: (note: SelectedNote, quarters: number) => void;
  onArticulation: (note: SelectedNote, articulation: Articulation) => void;
  onDynamic: (note: SelectedNote, dynamic: Dynamic) => void;
  onRespell: (note: SelectedNote) => void;
  onPitch: (note: SelectedNote, pitch: string) => void;
  onTranspose: (note: SelectedNote, semitones: number) => void;
  onRemove: (note: SelectedNote) => void;
  editorError?: string | null;
  busy?: boolean;
}

interface PitchDragPreview {
  note: SelectedNote;
  deltaSemitones: number;
  previewPitch: string;
  x: number;
  y: number;
}

interface PitchDragSession {
  note: SelectedNote;
  startX: number;
  startY: number;
  startMidi: number;
  pointerId: number;
  moved: boolean;
}

export function EditLayer({
  osmd,
  scrollContainer,
  scoreRoot,
  noteIndex,
  timeSignature = "4/4",
  enabled,
  selectedNote,
  measureRange,
  captureMode,
  onSelectNote,
  onMeasureRange,
  onDuration,
  onArticulation,
  onDynamic,
  onRespell,
  onPitch,
  onTranspose,
  onRemove,
  editorError = null,
  busy = false,
}: EditLayerProps) {
  const [menu, setMenu] = useState<{ note: SelectedNote; x: number; y: number } | null>(null);
  const [highlightBox, setHighlightBox] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [pitchPreview, setPitchPreview] = useState<PitchDragPreview | null>(null);

  const measureDragRef = useRef<{ measure: number; part: number } | null>(null);
  const pitchDragRef = useRef<PitchDragSession | null>(null);
  const suppressClickRef = useRef(false);

  const callbacksRef = useRef({
    onSelectNote,
    onMeasureRange,
    onTranspose,
  });
  callbacksRef.current = { onSelectNote, onMeasureRange, onTranspose };

  useEffect(() => {
    setMenu((m) => {
      if (!m || !selectedNote) return m;
      if (
        m.note.part_index === selectedNote.part_index &&
        m.note.measure_number === selectedNote.measure_number &&
        Math.abs(m.note.beat_offset - selectedNote.beat_offset) < 1e-2
      ) {
        return { ...m, note: selectedNote };
      }
      return m;
    });
  }, [selectedNote]);

  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    if (!enabled || !scrollContainer || !scoreRoot) return;

    const resolveHit = (clientX: number, clientY: number) => {
      const qpm = quartersPerMeasure(timeSignature);
      let raw: { note: SelectedNote; box: { x: number; y: number; width: number; height: number } } | null =
        null;

      if (osmd) {
        raw = hitTestNote(osmd, scrollContainer, clientX, clientY, qpm);
      }
      if (!raw && noteIndex.length > 0) {
        raw = hitTestAnnotatedNote(scoreRoot, scrollContainer, noteIndex, clientX, clientY);
      }
      if (!raw) return null;

      const note =
        noteIndex.length > 0 ? resolveNoteForEdit(raw.note, noteIndex) : raw.note;
      return { note, box: raw.box };
    };

    const onClick = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest("[data-note-edit-menu]")) return;
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }
      const hit = resolveHit(e.clientX, e.clientY);
      if (!hit) {
        callbacksRef.current.onSelectNote(null);
        setMenu(null);
        setHighlightBox(null);
        return;
      }
      callbacksRef.current.onSelectNote(hit.note);
      setHighlightBox(hit.box);
    };

    const onDblClick = (e: MouseEvent) => {
      if (pitchDragRef.current?.moved) return;
      const hit = resolveHit(e.clientX, e.clientY);
      if (!hit) return;
      e.preventDefault();
      callbacksRef.current.onSelectNote(hit.note);
      setHighlightBox(hit.box);
      setMenu({ note: hit.note, x: e.clientX, y: e.clientY });
    };

    const onContext = (e: MouseEvent) => {
      const hit = resolveHit(e.clientX, e.clientY);
      if (!hit) return;
      e.preventDefault();
      callbacksRef.current.onSelectNote(hit.note);
      setHighlightBox(hit.box);
      setMenu({ note: hit.note, x: e.clientX, y: e.clientY });
    };

    const onPointerDown = (e: PointerEvent) => {
      if (busyRef.current) return;
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).closest("[data-note-edit-menu]")) return;

      const hit = resolveHit(e.clientX, e.clientY);

      if (e.shiftKey && hit) {
        measureDragRef.current = {
          measure: hit.note.measure_number,
          part: hit.note.part_index,
        };
        callbacksRef.current.onMeasureRange({
          measure_start: hit.note.measure_number,
          measure_end: hit.note.measure_number,
          part_index: hit.note.part_index,
        });
        return;
      }

      if (!hit || captureMode) return;

      const startMidi = hit.note.midi ?? chordTopMidi(hit.note.pitch);
      if (startMidi == null) return;

      pitchDragRef.current = {
        note: hit.note,
        startX: e.clientX,
        startY: e.clientY,
        startMidi,
        pointerId: e.pointerId,
        moved: false,
      };
      scrollContainer.setPointerCapture(e.pointerId);
      callbacksRef.current.onSelectNote(hit.note);
      setHighlightBox(hit.box);
      setMenu(null);
      e.preventDefault();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (measureDragRef.current) {
        const hit = resolveHit(e.clientX, e.clientY);
        if (!hit) return;
        const start = measureDragRef.current;
        const mStart = Math.min(start.measure, hit.note.measure_number);
        const mEnd = Math.max(start.measure, hit.note.measure_number);
        callbacksRef.current.onMeasureRange({
          measure_start: mStart,
          measure_end: mEnd,
          part_index: hit.note.part_index,
        });
        return;
      }

      const drag = pitchDragRef.current;
      if (!drag || e.pointerId !== drag.pointerId) return;

      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) < PITCH_DRAG_THRESHOLD_PX) return;

      drag.moved = true;
      const delta = semitonesFromDrag(drag.startY, e.clientY);
      const previewPitch = previewPitchFromDrag(drag.startMidi, delta);
      setPitchPreview({
        note: drag.note,
        deltaSemitones: delta,
        previewPitch,
        x: e.clientX,
        y: e.clientY,
      });
    };

    const onPointerUp = (e: PointerEvent) => {
      if (measureDragRef.current) {
        measureDragRef.current = null;
        return;
      }

      const drag = pitchDragRef.current;
      if (!drag || e.pointerId !== drag.pointerId) return;

      if (scrollContainer.hasPointerCapture(e.pointerId)) {
        scrollContainer.releasePointerCapture(e.pointerId);
      }

      pitchDragRef.current = null;
      setPitchPreview(null);

      if (drag.moved) {
        const delta = semitonesFromDrag(drag.startY, e.clientY);
        suppressClickRef.current = true;
        if (delta !== 0) {
          void callbacksRef.current.onTranspose(drag.note, delta);
        }
      }
    };

    const onPointerCancel = (e: PointerEvent) => {
      if (pitchDragRef.current?.pointerId === e.pointerId) {
        pitchDragRef.current = null;
        setPitchPreview(null);
      }
      measureDragRef.current = null;
    };

    scrollContainer.style.cursor = captureMode ? "crosshair" : "default";
    scrollContainer.addEventListener("click", onClick);
    scrollContainer.addEventListener("dblclick", onDblClick);
    scrollContainer.addEventListener("contextmenu", onContext);
    scrollContainer.addEventListener("pointerdown", onPointerDown, { capture: true });
    scrollContainer.addEventListener("pointermove", onPointerMove, { capture: true });
    scrollContainer.addEventListener("pointerup", onPointerUp, { capture: true });
    scrollContainer.addEventListener("pointercancel", onPointerCancel, { capture: true });

    return () => {
      scrollContainer.style.cursor = "";
      scrollContainer.removeEventListener("click", onClick);
      scrollContainer.removeEventListener("dblclick", onDblClick);
      scrollContainer.removeEventListener("contextmenu", onContext);
      scrollContainer.removeEventListener("pointerdown", onPointerDown, { capture: true });
      scrollContainer.removeEventListener("pointermove", onPointerMove, { capture: true });
      scrollContainer.removeEventListener("pointerup", onPointerUp, { capture: true });
      scrollContainer.removeEventListener("pointercancel", onPointerCancel, { capture: true });
    };
  }, [enabled, scrollContainer, scoreRoot, osmd, noteIndex, timeSignature, captureMode]);

  if (!enabled || !scrollContainer || !scoreRoot) return null;

  const dragLabel = pitchPreview
    ? pitchPreview.deltaSemitones === 0
      ? pitchPreview.note.pitch
      : `${pitchPreview.note.pitch} → ${pitchPreview.previewPitch} (${pitchPreview.deltaSemitones > 0 ? "+" : ""}${pitchPreview.deltaSemitones})`
    : null;

  return (
    <>
      <div className="pointer-events-none absolute inset-0 z-[15]">
        {highlightBox && (
          <div
            aria-hidden
            className={[
              "pointer-events-none absolute z-[15] rounded-sm border-2 bg-neon-cyan/10",
              pitchPreview ? "border-neon-magenta/90 bg-neon-magenta/15" : "border-neon-cyan/80",
            ].join(" ")}
            style={{
              left: highlightBox.x,
              top: highlightBox.y,
              width: highlightBox.width,
              height: highlightBox.height,
            }}
          />
        )}

        {dragLabel && pitchPreview && (
          <div
            aria-live="polite"
            className="pointer-events-none fixed z-[190] rounded-md border border-neon-magenta/50 bg-obsidian-900/95 px-2 py-1 text-[11px] font-medium text-neon-magenta shadow-lg"
            style={{
              left: Math.min(pitchPreview.x + 12, window.innerWidth - 200),
              top: Math.max(12, pitchPreview.y - 36),
            }}
          >
            {dragLabel}
          </div>
        )}

        {measureRange && (
          <div className="pointer-events-none sticky left-3 top-3 z-[25] float-left rounded-md border border-neon-violet/40 bg-obsidian-900/80 px-2 py-1 text-[10px] text-neon-violet">
            Measures {measureRange.measure_start}–{measureRange.measure_end}
            {captureMode && " · Capture armed"}
          </div>
        )}
      </div>

      {menu && (
        <NoteEditMenu
          note={menu.note}
          x={menu.x}
          y={menu.y}
          busy={busy}
          error={editorError}
          onClose={() => setMenu(null)}
          onDuration={(q) => onDuration(menu.note, q)}
          onArticulation={(a) => onArticulation(menu.note, a)}
          onDynamic={(d) => onDynamic(menu.note, d)}
          onRespell={() => onRespell(menu.note)}
          onPitch={(p) => onPitch(menu.note, p)}
          onTranspose={(st) => onTranspose(menu.note, st)}
          onRemove={() => {
            onRemove(menu.note);
            setMenu(null);
          }}
        />
      )}
    </>
  );
}
