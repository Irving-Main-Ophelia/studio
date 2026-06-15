import { describe, expect, it } from "vitest";

import { midiNoteToSciPitch } from "./useMidiRecorder";

describe("midiNoteToSciPitch", () => {
  it("maps MIDI 60 to C4 (middle C)", () => {
    expect(midiNoteToSciPitch(60)).toBe("C4");
  });

  it("maps MIDI 69 to A4 (concert A)", () => {
    expect(midiNoteToSciPitch(69)).toBe("A4");
  });

  it("maps MIDI 21 to A0 (lowest piano key)", () => {
    expect(midiNoteToSciPitch(21)).toBe("A0");
  });

  it("maps MIDI 108 to C8 (highest piano key)", () => {
    expect(midiNoteToSciPitch(108)).toBe("C8");
  });

  it("maps MIDI 61 to C#4", () => {
    expect(midiNoteToSciPitch(61)).toBe("C#4");
  });

  it("maps MIDI 70 to A#4", () => {
    expect(midiNoteToSciPitch(70)).toBe("A#4");
  });

  it("maps MIDI 48 to C3", () => {
    expect(midiNoteToSciPitch(48)).toBe("C3");
  });

  it("maps MIDI 72 to C5", () => {
    expect(midiNoteToSciPitch(72)).toBe("C5");
  });

  it("maps MIDI 0 to C-1", () => {
    expect(midiNoteToSciPitch(0)).toBe("C-1");
  });
});
