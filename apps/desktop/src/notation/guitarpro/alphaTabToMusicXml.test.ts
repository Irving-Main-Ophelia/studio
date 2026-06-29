import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { importAlphaTex, importGuitarProBytes } from "./importGuitarPro";

/**
 * A1/A7 conversion-boundary tests. We drive the converter through alphaTex (a text
 * tab format alphaTab parses the same way it parses `.gp` bytes), so the model →
 * MusicXML mapping is exercised without binary fixtures.
 */

const TEX =
  '\\title "Test Tab" . \\tuning e5 b4 g4 d4 a3 e3 . ' +
  "0.1.4 3.1.4 r.4 5.1.4 | 0.2.2 2.2.2";

function parse(xml: string): Document {
  return new DOMParser().parseFromString(xml, "application/xml");
}

describe("alphaTabScoreToMusicXml", () => {
  it("converts parts, measures, and divisions", async () => {
    const { musicxml } = await importAlphaTex(TEX);
    const doc = parse(musicxml);
    expect(doc.getElementsByTagName("parsererror").length).toBe(0);
    expect(doc.getElementsByTagName("part").length).toBe(1);
    expect(doc.getElementsByTagName("measure").length).toBe(2);
    expect(doc.querySelector("divisions")?.textContent).toBe("960");
  });

  it("maps pitch, string and fret (string 1 = highest)", async () => {
    const { musicxml } = await importAlphaTex(TEX);
    const doc = parse(musicxml);
    const firstNote = doc.querySelector("measure note");
    expect(firstNote?.querySelector("pitch step")?.textContent).toBe("E");
    expect(firstNote?.querySelector("pitch octave")?.textContent).toBe("5");
    expect(firstNote?.querySelector("technical string")?.textContent).toBe("1");
    expect(firstNote?.querySelector("technical fret")?.textContent).toBe("0");
  });

  it("preserves rests", async () => {
    const { musicxml } = await importAlphaTex(TEX);
    const doc = parse(musicxml);
    const rests = doc.querySelectorAll("note rest");
    expect(rests.length).toBeGreaterThanOrEqual(1);
  });

  it("reports the file tuning, highest string first", async () => {
    const { tunings } = await importAlphaTex(TEX);
    expect(tunings).toHaveLength(1);
    expect(tunings[0].tuning).toEqual(["E5", "B4", "G4", "D4", "A3", "E3"]);
    expect(tunings[0].capo).toBe(0);
  });

  it("emits a half-note type for the second measure's beats", async () => {
    const { musicxml } = await importAlphaTex(TEX);
    const doc = parse(musicxml);
    const measures = doc.getElementsByTagName("measure");
    const secondMeasureNote = measures[1].querySelector("note type");
    expect(secondMeasureNote?.textContent).toBe("half");
  });
});

describe("importGuitarProBytes (real .gp binary path)", () => {
  // Exercises alphaTab's ScoreLoader.loadScoreFromBytes on an actual Guitar Pro 7
  // binary (self-minted fixture — see __fixtures__/generate.mjs), closing the gap
  // that the alphaTex path alone left open.
  // Resolved from the vitest root (apps/desktop), which is process.cwd().
  const bytes = new Uint8Array(
    readFileSync("src/notation/guitarpro/__fixtures__/sample.gp"),
  );

  it("parses the binary and converts to MusicXML", async () => {
    const { musicxml, tunings } = await importGuitarProBytes(bytes);
    const doc = parse(musicxml);
    expect(doc.getElementsByTagName("parsererror").length).toBe(0);
    expect(doc.getElementsByTagName("part").length).toBe(1);
    expect(doc.getElementsByTagName("measure").length).toBe(2);
    const firstNote = doc.querySelector("measure note");
    expect(firstNote?.querySelector("technical fret")?.textContent).toBe("0");
    expect(tunings[0].tuning).toEqual(["E5", "B4", "G4", "D4", "A3", "E3"]);
  });
});
