/**
 * Score selection model for the EditLayer overlay.
 *
 * A selected note is the atomic unit for the note context menu. Measure
 * ranges power capture mode, regional AI prompts, and fragment preview.
 */

import type { EditCursor } from "../lib/api";

export interface SelectedNote extends EditCursor {
  pitch: string;
  duration_quarters: number;
  part_name: string;
  midi: number | null;
}

export interface MeasureRange {
  measure_start: number;
  measure_end: number;
  part_index: number;
}

export interface SelectionState {
  note: SelectedNote | null;
  measureRange: MeasureRange | null;
}

export function initialSelectionState(): SelectionState {
  return { note: null, measureRange: null };
}
