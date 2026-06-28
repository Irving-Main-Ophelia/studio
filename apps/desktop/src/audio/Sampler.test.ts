import { describe, expect, it } from "vitest";

import { resolveInstrument } from "./Sampler";

describe("resolveInstrument", () => {
  it("maps common orchestral instrument names to General-MIDI keys", () => {
    expect(resolveInstrument("Violin").gm).toBe("violin");
    expect(resolveInstrument("Viola").gm).toBe("viola");
    expect(resolveInstrument("Violoncello").gm).toBe("cello");
    expect(resolveInstrument("Cello").gm).toBe("cello");
    expect(resolveInstrument("Flute").gm).toBe("flute");
    expect(resolveInstrument("Bb Clarinet").gm).toBe("clarinet");
    expect(resolveInstrument("Trumpet in C").gm).toBe("trumpet");
  });

  it("resolves cello before violin so 'Violoncello' is not mis-detected", () => {
    // 'violoncello' contains 'cello'; the cello rule must win over the violin rule.
    expect(resolveInstrument("Violoncello").displayName).toBe("Cello");
  });

  it("routes the piano to the high-fidelity SplendidGrandPiano fallback (gm: null)", () => {
    expect(resolveInstrument("Piano").gm).toBeNull();
    expect(resolveInstrument("Grand Piano").gm).toBeNull();
  });

  it("falls back to piano for empty or unknown instruments", () => {
    expect(resolveInstrument("").gm).toBeNull();
    expect(resolveInstrument(null).gm).toBeNull();
    expect(resolveInstrument(undefined).gm).toBeNull();
    const unknown = resolveInstrument("Theremin");
    expect(unknown.gm).toBeNull();
    expect(unknown.displayName).toBe("Theremin"); // keeps the original label
  });

  it("maps a classical/nylon guitar to the nylon soundfont", () => {
    expect(resolveInstrument("Classical Guitar").gm).toBe("acoustic_guitar_nylon");
    expect(resolveInstrument("Guitarra").gm).toBe("acoustic_guitar_nylon");
  });
});
