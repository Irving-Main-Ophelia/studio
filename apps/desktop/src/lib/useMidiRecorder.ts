/**
 * MIDI step-time recording.
 *
 * When `engine.recordMode` is true and a project is open, every MIDI
 * note-on event translates into a note insertion at the current editor
 * cursor using the current sticky duration — exactly like pressing a
 * piano-key letter on the keyboard.
 *
 * Step-time (not real-time): note timing on the page comes from the
 * cursor position and sticky duration, not from when you physically
 * pressed the key.
 */

import { useEffect, useRef } from "react";

import { useMidi } from "./useMidi";
import { useScoreEngine } from "./ScoreEngine";

const PITCH_CLASSES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

/**
 * Convert a MIDI note number (0–127) to scientific pitch notation.
 * Middle C (MIDI 60) → "C4".
 */
export function midiNoteToSciPitch(note: number): string {
  const octave = Math.floor(note / 12) - 1;
  const cls = PITCH_CLASSES[note % 12];
  return `${cls}${octave}`;
}

export function useMidiRecorder(): void {
  const midi = useMidi();
  const engine = useScoreEngine();
  const lastTimestampRef = useRef<number>(-1);

  useEffect(() => {
    if (!engine.recordMode || !engine.project) return;

    const latest = midi.recent[0];
    if (!latest) return;
    if (latest.timestamp <= lastTimestampRef.current) return;
    lastTimestampRef.current = latest.timestamp;

    // 0x9n = note-on on channel n; velocity > 0 distinguishes from note-off
    const isNoteOn = (latest.status & 0xf0) === 0x90 && latest.data2 > 0;
    if (!isNoteOn) return;

    const pitch = midiNoteToSciPitch(latest.data1);
    void engine.insertNoteAtCursor(pitch, engine.editor.duration_quarters);
  }, [midi.recent, engine.recordMode, engine.project, engine]);
}
