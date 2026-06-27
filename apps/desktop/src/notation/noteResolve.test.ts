import { describe, expect, it } from "vitest";

import type { ListedNoteRow } from "../lib/api";
import type { SelectedNote } from "../editor/SelectionState";
import {
  beatHintDistance,
  findBestListRow,
  osmdTimestampToBeatQuarters,
  quartersPerMeasure,
} from "./noteResolve";

describe("noteResolve", () => {
  it("converts 4/4 measure timestamps", () => {
    expect(quartersPerMeasure("4/4")).toBe(4);
    expect(osmdTimestampToBeatQuarters(0.8125, "4/4")).toBeCloseTo(3.25, 5);
    expect(osmdTimestampToBeatQuarters(0.25, "4/4")).toBeCloseTo(1, 5);
  });

  it("converts 6/8 measure timestamps", () => {
    expect(quartersPerMeasure("6/8")).toBe(3);
  });

  it("matches by measure and pitch when part index differs", () => {
    const notes: ListedNoteRow[] = [
      {
        part_index: 0,
        measure_number: 2,
        beat_offset: 1.0,
        voice: null,
        part_name: "Piano",
        pitch: "E4",
        midi: 64,
        duration_quarters: 1,
      },
    ];
    const hit: SelectedNote = {
      part_index: 3,
      measure_number: 2,
      beat_offset: 0.25,
      voice: null,
      pitch: "E4",
      duration_quarters: 1,
      part_name: "Staff 4",
      midi: null,
    };
    expect(findBestListRow(notes, hit)?.beat_offset).toBe(1.0);
    expect(beatHintDistance(1.0, 0.25)).toBe(0);
  });
});
