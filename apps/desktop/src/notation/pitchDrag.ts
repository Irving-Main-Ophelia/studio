/**
 * Pitch helpers for vertical note drag in EditLayer.
 */

const CHROMATIC = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

/** Vertical pixels per semitone — tuned for OSMD default staff spacing. */
export const PIXELS_PER_SEMITONE = 6;

export const PITCH_DRAG_THRESHOLD_PX = 5;

export function pitchToMidi(pitch: string): number | null {
  const normalized = pitch.trim().replace("♯", "#").replace("♭", "-");
  const m = normalized.match(/^([A-Ga-g])([#-b]?)(\d+)$/);
  if (!m) return null;
  const letter = m[1].toUpperCase();
  const acc = m[2];
  const octave = Number(m[3]);
  const base: Record<string, number> = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11,
  };
  let semitone = base[letter];
  if (semitone == null) return null;
  if (acc === "#") semitone += 1;
  if (acc === "-" || acc === "b") semitone -= 1;
  return (octave + 1) * 12 + semitone;
}

/** Highest pitch when ``pitch`` encodes a chord (e.g. ``B4-D2``). */
export function chordTopMidi(pitch: string): number | null {
  const parts = pitch.split("-").map((p) => pitchToMidi(p.trim()));
  const valid = parts.filter((m): m is number => m != null);
  if (valid.length === 0) return null;
  return Math.max(...valid);
}

export function midiToPitch(midi: number): string {
  const clamped = Math.max(0, Math.min(127, midi));
  const octave = Math.floor(clamped / 12) - 1;
  return `${CHROMATIC[clamped % 12]}${octave}`;
}

export function semitonesFromDrag(startY: number, currentY: number): number {
  // Up on screen = higher pitch.
  return Math.round((startY - currentY) / PIXELS_PER_SEMITONE);
}

export function previewPitchFromDrag(startMidi: number, deltaSemitones: number): string {
  return midiToPitch(startMidi + deltaSemitones);
}
