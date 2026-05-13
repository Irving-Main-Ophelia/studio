/**
 * Computer-keyboard note-entry grammar (PHASE_1.md §1.4-B).
 *
 * Musical analogy: think of this as a tiny score-writing dialect — like the
 * shorthand jazz pianists use to scribble a tune ("Cmaj7 in 4/4, dotted
 * quarters in the head") — interpreted live as the maintainer types.
 *
 *   ┌─ Pitches (case-insensitive) ──────────────────────────┐
 *   │  A B C D E F G — letter writes a note at current      │
 *   │                  octave; defaults to octave 4 (treble │
 *   │                  staff) or 3 (bass staff).            │
 *   │  Shift+letter  — sharp (#)                            │
 *   │  Alt+letter    — flat (♭)                             │
 *   │  Up / Down     — bump current octave ±1               │
 *   ├─ Durations (sticky — apply to next note) ─────────────┤
 *   │  1 — whole       (4 quarters)                          │
 *   │  2 — half        (2 quarters)                          │
 *   │  4 — quarter     (1 quarter)                           │
 *   │  8 — eighth      (½ quarter)                           │
 *   │  6 — sixteenth   (¼ quarter)                           │
 *   │  3 — triplet     (multiplies current duration × 2/3)   │
 *   │  .  — augmentation dot                                 │
 *   ├─ Other ───────────────────────────────────────────────┤
 *   │  R / r        — rest at current duration               │
 *   │  T / t        — tie current note to next               │
 *   │  S            — staccato on last note                  │
 *   │  >            — accent on last note                    │
 *   │  ^            — marcato on last note                   │
 *   │  -            — tenuto on last note                    │
 *   │  ;            — fermata on last note (F is taken by    │
 *   │                  the F-pitch letter)                   │
 *   │  Backspace    — remove last note (becomes rest)        │
 *   │  Enter        — next measure                           │
 *   │  ←  →         — cursor: prev/next slot                 │
 *   └────────────────────────────────────────────────────────┘
 *
 * This module is pure: it maps a keyboard event into a typed "intent" that
 * the editor reducer then executes. That keeps logic testable in vitest
 * without simulating a DOM.
 */

export type NoteLetter = "A" | "B" | "C" | "D" | "E" | "F" | "G";
export type Accidental = "natural" | "sharp" | "flat";

export type EditorIntent =
  | { kind: "insert_note"; letter: NoteLetter; accidental: Accidental }
  | { kind: "insert_rest" }
  | { kind: "set_duration"; duration_quarters: number; dot: boolean; triplet: boolean }
  | { kind: "toggle_duration_dot" }
  | { kind: "octave_up" }
  | { kind: "octave_down" }
  | { kind: "cursor_prev" }
  | { kind: "cursor_next" }
  | { kind: "cursor_next_measure" }
  | { kind: "remove_last" }
  | { kind: "tie_to_next" }
  | { kind: "toggle_articulation"; articulation: "staccato" | "accent" | "marcato" | "tenuto" | "fermata" }
  | { kind: "set_dynamic"; dynamic: "pp" | "p" | "mp" | "mf" | "f" | "ff" };

export interface ParseContext {
  /** True when a modal/input is focused — we yield to it. */
  inTypableTarget: boolean;
}

const PITCH_KEYS = new Set(["a", "b", "c", "d", "e", "f", "g"]);

/**
 * Translate a `keydown` event into an `EditorIntent`, or `null` to ignore.
 */
export function parseKey(event: KeyboardEvent, ctx: ParseContext): EditorIntent | null {
  if (ctx.inTypableTarget) return null;
  if (event.metaKey || event.ctrlKey) return null; // reserved for shortcuts

  const key = event.key;
  const lower = key.toLowerCase();

  // Pitch letters
  if (PITCH_KEYS.has(lower)) {
    const letter = lower.toUpperCase() as NoteLetter;
    const accidental: Accidental = event.shiftKey
      ? "sharp"
      : event.altKey
        ? "flat"
        : "natural";
    return { kind: "insert_note", letter, accidental };
  }

  // Durations
  switch (key) {
    case "1":
      return { kind: "set_duration", duration_quarters: 4, dot: false, triplet: false };
    case "2":
      return { kind: "set_duration", duration_quarters: 2, dot: false, triplet: false };
    case "4":
      return { kind: "set_duration", duration_quarters: 1, dot: false, triplet: false };
    case "8":
      return { kind: "set_duration", duration_quarters: 0.5, dot: false, triplet: false };
    case "6":
      return { kind: "set_duration", duration_quarters: 0.25, dot: false, triplet: false };
    case "3":
      // 3 toggles triplet on current duration; intent is "make the next note
      // a triplet at the current duration". The reducer multiplies × 2/3.
      return { kind: "set_duration", duration_quarters: 1, dot: false, triplet: true };
    case ".":
      return { kind: "toggle_duration_dot" };
  }

  if (key === "ArrowUp") return { kind: "octave_up" };
  if (key === "ArrowDown") return { kind: "octave_down" };
  if (key === "ArrowLeft") return { kind: "cursor_prev" };
  if (key === "ArrowRight") return { kind: "cursor_next" };
  if (key === "Enter") return { kind: "cursor_next_measure" };

  if (lower === "r") return { kind: "insert_rest" };
  if (lower === "t") return { kind: "tie_to_next" };
  if (lower === "s") return { kind: "toggle_articulation", articulation: "staccato" };
  if (key === ">") return { kind: "toggle_articulation", articulation: "accent" };
  if (key === "^") return { kind: "toggle_articulation", articulation: "marcato" };
  if (key === "-") return { kind: "toggle_articulation", articulation: "tenuto" };
  if (key === ";") return { kind: "toggle_articulation", articulation: "fermata" };

  if (key === "Backspace") return { kind: "remove_last" };

  return null;
}

/**
 * Build the scientific pitch name a backend insert call expects.
 *
 * Examples:
 *   midiToSciPitch("C", "natural", 4)  → "C4"
 *   midiToSciPitch("F", "sharp",   5)  → "F#5"
 *   midiToSciPitch("B", "flat",    3)  → "B-3"   (music21 uses '-' for flat)
 */
export function buildSciPitch(
  letter: NoteLetter,
  accidental: Accidental,
  octave: number,
): string {
  const acc =
    accidental === "sharp" ? "#" : accidental === "flat" ? "-" : "";
  return `${letter}${acc}${octave}`;
}

export interface DurationState {
  duration_quarters: number;
  dot: boolean;
  triplet: boolean;
}

/** Resolve the actual quarter-length to send to the backend. */
export function resolveDuration(state: DurationState): number {
  let q = state.duration_quarters;
  if (state.dot) q *= 1.5;
  if (state.triplet) q *= 2 / 3;
  return q;
}
