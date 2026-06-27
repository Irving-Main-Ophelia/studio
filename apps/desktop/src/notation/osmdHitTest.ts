/**
 * Map pointer coordinates on the OSMD SVG to score positions.
 *
 * OSMD is a renderer, not an editor — we walk its internal graphic tree at
 * runtime and match click points to note bounding boxes.
 */

import type { OpenSheetMusicDisplay } from "opensheetmusicdisplay";

import type { SelectedNote } from "../editor/SelectionState";

export interface NoteBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** OSMD internal graphic types (not exported in 1.9.9 public API). */
interface GraphicNoteLike {
  sourceNote?: {
    isRest?: () => boolean;
    Pitch?: { ToString?: () => string };
    Length?: { RealValue?: number };
  };
  parentVoiceEntry?: {
    parentStaffEntry?: {
      absInMeasureTimestamp?: { RealValue?: number };
      parentMeasure?: { MeasureNumber?: number };
    };
  };
  parentStaffLine?: {
    parentStaff?: {
      parentInstrument?: { Name?: string; Id?: string };
    };
  };
  getSVGGElement?: () => SVGElement | null;
  PositionAndShape?: {
    AbsolutePosition?: { x: number; y: number };
    Size?: { width: number; height: number };
  };
}

interface GraphicMeasureLike {
  MeasureNumber?: number;
  staffEntries?: Array<{
    graphicalVoiceEntries?: Array<{ notes?: GraphicNoteLike[] }>;
  }>;
}

interface OsmdGraphic {
  measureList?: GraphicMeasureLike[];
}

type OsmdWithGraphic = {
  graphic?: OsmdGraphic;
  Sheet?: {
    Instruments?: Array<{ Id?: string | number; Name?: string }>;
  };
};

function instrumentIndex(osmd: OsmdWithGraphic, instrumentId: string | undefined): number {
  const list = osmd.Sheet?.Instruments ?? [];
  if (!instrumentId) return 0;
  const idx = list.findIndex((inst) => String(inst.Id) === String(instrumentId));
  return idx >= 0 ? idx : 0;
}

function bboxFromGraphicNote(
  gNote: GraphicNoteLike,
  container: HTMLElement,
): NoteBoundingBox | null {
  const el = gNote.getSVGGElement?.();
  if (el) {
    const noteRect = el.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    return {
      x: noteRect.left - containerRect.left + container.scrollLeft,
      y: noteRect.top - containerRect.top + container.scrollTop,
      width: noteRect.width,
      height: noteRect.height,
    };
  }
  const pos = gNote.PositionAndShape?.AbsolutePosition;
  if (!pos) return null;
  const size = gNote.PositionAndShape?.Size ?? { width: 1, height: 1 };
  const scale = 10;
  return {
    x: pos.x * scale,
    y: pos.y * scale,
    width: Math.max(8, size.width * scale),
    height: Math.max(8, size.height * scale),
  };
}

function pointInBox(px: number, py: number, box: NoteBoundingBox, pad = 6): boolean {
  return (
    px >= box.x - pad &&
    px <= box.x + box.width + pad &&
    py >= box.y - pad &&
    py <= box.y + box.height + pad
  );
}

function graphicNoteToSelection(
  osmd: OsmdWithGraphic,
  gNote: GraphicNoteLike,
  quartersPerMeasure = 4,
): SelectedNote | null {
  const src = gNote.sourceNote;
  if (!src || src.isRest?.()) return null;

  const pitch = src.Pitch?.ToString?.() ?? null;
  if (!pitch) return null;

  const staffEntry = gNote.parentVoiceEntry?.parentStaffEntry;
  const measureNumber = staffEntry?.parentMeasure?.MeasureNumber ?? 1;
  const osmdBeat = staffEntry?.absInMeasureTimestamp?.RealValue ?? 0;
  const beatOffset = osmdBeat * quartersPerMeasure;
  const duration = (src.Length?.RealValue ?? 1) * quartersPerMeasure;

  const instrument = gNote.parentStaffLine?.parentStaff?.parentInstrument;
  const partIndex = instrumentIndex(osmd, instrument?.Id);
  const partName = instrument?.Name ?? `Part ${partIndex + 1}`;

  return {
    part_index: partIndex,
    measure_number: measureNumber,
    beat_offset: beatOffset,
    voice: null,
    pitch,
    duration_quarters: duration,
    part_name: partName,
    midi: null,
  };
}

export interface GraphicNoteHit {
  note: SelectedNote;
  box: NoteBoundingBox;
  element: SVGElement | null;
}

export function collectGraphicNotes(
  osmd: OpenSheetMusicDisplay,
  container: HTMLElement,
  quartersPerMeasure = 4,
): GraphicNoteHit[] {
  const internal = osmd as unknown as OsmdWithGraphic;
  const measureList = internal.graphic?.measureList;
  if (!measureList?.length) return [];

  const hits: GraphicNoteHit[] = [];

  for (const measure of measureList) {
    for (const staffEntry of measure.staffEntries ?? []) {
      for (const gve of staffEntry.graphicalVoiceEntries ?? []) {
        for (const gNote of gve.notes ?? []) {
          const box = bboxFromGraphicNote(gNote, container);
          if (!box) continue;
          const note = graphicNoteToSelection(internal, gNote, quartersPerMeasure);
          if (note) {
            hits.push({ note, box, element: gNote.getSVGGElement?.() ?? null });
          }
        }
      }
    }
  }

  return hits;
}

export function hitTestNote(
  osmd: OpenSheetMusicDisplay,
  container: HTMLElement,
  clientX: number,
  clientY: number,
  quartersPerMeasure = 4,
): { note: SelectedNote; box: NoteBoundingBox } | null {
  const rect = container.getBoundingClientRect();
  const px = clientX - rect.left + container.scrollLeft;
  const py = clientY - rect.top + container.scrollTop;

  const candidates = collectGraphicNotes(osmd, container, quartersPerMeasure);
  for (const hit of candidates) {
    if (pointInBox(px, py, hit.box)) return hit;
  }

  let best: { hit: (typeof candidates)[number]; dist: number } | null = null;
  for (const hit of candidates) {
    const cx = hit.box.x + hit.box.width / 2;
    const cy = hit.box.y + hit.box.height / 2;
    const dist = Math.hypot(px - cx, py - cy);
    if (dist <= 24 && (!best || dist < best.dist)) {
      best = { hit, dist };
    }
  }
  return best?.hit ?? null;
}
