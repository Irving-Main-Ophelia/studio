/**
 * Editor cursor + sticky duration state.
 *
 * The cursor is the "music stand pencil tip": where the next note will land.
 * The sticky duration is the maintainer's last-set rhythmic value — pressing
 * `4 c d e f` writes four quarter-notes in a row without retyping 4 each
 * time.
 *
 * The reducer is pure so it can be exercised by vitest without React.
 */

import type { Articulation, EditCursor } from "../lib/api";

export interface EditorState {
  cursor: EditCursor;
  /** "Active" duration that gets applied to the next note. */
  duration_quarters: number;
  dot: boolean;
  triplet: boolean;
  /** Active octave for the current staff (defaults to 4 = treble register). */
  octave: number;
  /** Last note inserted — articulations key off of this. */
  last_inserted: EditCursor | null;
  /** Whether the next inserted note should start a tie. */
  pending_tie: boolean;
  /** Active articulations queued for next insertion (rare; mostly we toggle on the last note). */
  pending_articulations: Articulation[];
}

export function initialEditorState(part_index = 0): EditorState {
  return {
    cursor: {
      part_index,
      measure_number: 1,
      beat_offset: 0,
      voice: null,
    },
    duration_quarters: 1,
    dot: false,
    triplet: false,
    octave: 4,
    last_inserted: null,
    pending_tie: false,
    pending_articulations: [],
  };
}

export function setDuration(
  state: EditorState,
  duration_quarters: number,
  { triplet = false }: { triplet?: boolean } = {},
): EditorState {
  return { ...state, duration_quarters, dot: false, triplet };
}

export function toggleDot(state: EditorState): EditorState {
  return { ...state, dot: !state.dot };
}

export function bumpOctave(state: EditorState, delta: number): EditorState {
  return { ...state, octave: clamp(state.octave + delta, 0, 8) };
}

export function moveCursor(
  state: EditorState,
  delta_beats: number,
  { next_measure = false }: { next_measure?: boolean } = {},
): EditorState {
  if (next_measure) {
    return {
      ...state,
      cursor: {
        ...state.cursor,
        measure_number: state.cursor.measure_number + 1,
        beat_offset: 0,
      },
    };
  }
  return {
    ...state,
    cursor: {
      ...state.cursor,
      beat_offset: Math.max(0, state.cursor.beat_offset + delta_beats),
    },
  };
}

export function advanceCursor(state: EditorState, duration_quarters: number): EditorState {
  return {
    ...state,
    cursor: {
      ...state.cursor,
      beat_offset: state.cursor.beat_offset + duration_quarters,
    },
  };
}

export function markInserted(state: EditorState, at: EditCursor): EditorState {
  return { ...state, last_inserted: at };
}

export function clearPendingTie(state: EditorState): EditorState {
  return { ...state, pending_tie: false };
}

export function setPendingTie(state: EditorState): EditorState {
  return { ...state, pending_tie: true };
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
