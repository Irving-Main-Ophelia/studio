import { describe, expect, it } from "vitest";

import { assignFret, pitchToMidi } from "./fret";

const STANDARD = ["E4", "B3", "G3", "D3", "A2", "E2"];

describe("pitchToMidi", () => {
  it("maps scientific pitch names to MIDI (60 = C4)", () => {
    expect(pitchToMidi("C4")).toBe(60);
    expect(pitchToMidi("A4")).toBe(69);
    expect(pitchToMidi("E2")).toBe(40);
    expect(pitchToMidi("Bb2")).toBe(46);
    expect(pitchToMidi("F#4")).toBe(66);
  });

  it("rejects junk", () => {
    expect(pitchToMidi("H9")).toBeNull();
    expect(pitchToMidi("")).toBeNull();
  });
});

describe("assignFret", () => {
  it("places open strings at fret 0", () => {
    expect(assignFret(pitchToMidi("E4")!, STANDARD)).toEqual({ string: 1, fret: 0 });
    // E2 is only reachable on the low string 6.
    expect(assignFret(pitchToMidi("E2")!, STANDARD)).toEqual({ string: 6, fret: 0 });
  });

  it("picks the lowest-fret position (highest reachable string)", () => {
    // G4 (67): string 1 (E4=64) fret 3 — the lowest fret.
    expect(assignFret(pitchToMidi("G4")!, STANDARD)).toEqual({ string: 1, fret: 3 });
  });

  it("honours the capo", () => {
    // With capo 2, string 1 open = F#4; E4 no longer fits string 1, drops to string 2.
    expect(assignFret(pitchToMidi("E4")!, STANDARD, 2)).toEqual({ string: 2, fret: 3 });
  });

  it("returns null for unplayable pitches", () => {
    expect(assignFret(pitchToMidi("C1")!, STANDARD)).toBeNull();
  });
});
