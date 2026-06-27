import { describe, expect, it } from "vitest";

import {
  chordTopMidi,
  midiToPitch,
  pitchToMidi,
  previewPitchFromDrag,
  semitonesFromDrag,
} from "./pitchDrag";

describe("pitchDrag", () => {
  it("parses common pitch spellings", () => {
    expect(pitchToMidi("G4")).toBe(67);
    expect(pitchToMidi("F#4")).toBe(66);
    expect(pitchToMidi("B-4")).toBe(70);
  });

  it("uses top chord tone for midi", () => {
    expect(chordTopMidi("B4-D2")).toBe(71);
  });

  it("snaps vertical drag to semitones", () => {
    expect(semitonesFromDrag(100, 94)).toBe(1);
    expect(semitonesFromDrag(100, 106)).toBe(-1);
  });

  it("previews transposed pitch", () => {
    expect(previewPitchFromDrag(67, 2)).toBe(midiToPitch(69));
  });
});
