/**
 * Fret math mirror of the backend `app/tools/fretboard.py` (Track A, A4).
 *
 * Lets the fretboard viewer place a selected note without a round-trip. The
 * lowest-position heuristic matches the backend so the dot lands where the tab
 * view would draw it.
 */

const STEP_SEMITONES: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

/** MIDI number of a scientific pitch name like "E4", "C#3", "Bb2" (60 = C4). */
export function pitchToMidi(name: string): number | null {
  const m = name.trim().match(/^([A-Ga-g])([#b♯♭x]*)(-?\d+)$/);
  if (!m) return null;
  const letter = m[1].toUpperCase();
  let alter = 0;
  for (const ch of m[2]) {
    if (ch === "#" || ch === "♯") alter += 1;
    else if (ch === "b" || ch === "♭") alter -= 1;
    else if (ch === "x") alter += 2;
  }
  const octave = Number(m[3]);
  return (octave + 1) * 12 + STEP_SEMITONES[letter] + alter;
}

export interface FretSpot {
  string: number; // 1-based
  fret: number;
}

/** Lowest-position (string, fret) for a concert-pitch MIDI value, or null. */
export function assignFret(
  midi: number,
  tuning: string[],
  capo = 0,
  maxFret = 24,
): FretSpot | null {
  for (let i = 0; i < tuning.length; i++) {
    const open = pitchToMidi(tuning[i]);
    if (open == null) continue;
    const fret = midi - (open + capo);
    if (fret >= 0 && fret <= maxFret) return { string: i + 1, fret };
  }
  return null;
}
