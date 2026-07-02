import { describe, expect, it } from "vitest";

import { dbToLinear, scheduleClips } from "./clipPlayback";
import type { AudioClip } from "../project/types";

function clip(partial: Partial<AudioClip> & { id: string; take_id: string }): AudioClip {
  return {
    offset: 0,
    length: 4,
    gain_db: 0,
    fades: { fade_in: 0, fade_out: 0 },
    ...partial,
  };
}

const CTX = { playStart: 10, offsetSec: 0, rate: 1 };

describe("scheduleClips", () => {
  it("schedules a clip at the cursor from the head of its take", () => {
    const [s] = scheduleClips([clip({ id: "c", take_id: "t", offset: 0, length: 4 })], CTX);
    expect(s.when).toBe(10);
    expect(s.sourceOffsetSec).toBe(0);
    expect(s.durationSec).toBe(4);
  });

  it("delays a later clip by its timeline offset", () => {
    const [s] = scheduleClips([clip({ id: "c", take_id: "t", offset: 2, length: 4 })], CTX);
    expect(s.when).toBe(12);
    expect(s.sourceOffsetSec).toBe(0);
  });

  it("scales the timeline gap by 1/rate", () => {
    const [s] = scheduleClips(
      [clip({ id: "c", take_id: "t", offset: 4, length: 4 })],
      { playStart: 10, offsetSec: 0, rate: 2 },
    );
    expect(s.when).toBe(12); // 10 + 4/2
  });

  it("joins a clip that straddles the cursor mid-take, with no fade-in", () => {
    const [s] = scheduleClips(
      [clip({ id: "c", take_id: "t", offset: 0, length: 4, fades: { fade_in: 1, fade_out: 0 } })],
      { playStart: 10, offsetSec: 1, rate: 1 },
    );
    expect(s.when).toBe(10);
    expect(s.sourceOffsetSec).toBe(1);
    expect(s.durationSec).toBe(3);
    expect(s.fadeInSec).toBe(0);
  });

  it("drops a clip that ends before the cursor", () => {
    const out = scheduleClips(
      [clip({ id: "c", take_id: "t", offset: 0, length: 4 })],
      { playStart: 10, offsetSec: 5, rate: 1 },
    );
    expect(out).toHaveLength(0);
  });

  it("drops a zero-length clip", () => {
    expect(scheduleClips([clip({ id: "c", take_id: "t", length: 0 })], CTX)).toHaveLength(0);
  });

  it("clamps fades to half the audible span", () => {
    const [s] = scheduleClips(
      [clip({ id: "c", take_id: "t", offset: 0, length: 4, fades: { fade_in: 3, fade_out: 3 } })],
      CTX,
    );
    expect(s.fadeInSec).toBe(2);
    expect(s.fadeOutSec).toBe(2);
  });

  it("carries the clip gain through", () => {
    const [s] = scheduleClips([clip({ id: "c", take_id: "t", gain_db: -6 })], CTX);
    expect(s.gainDb).toBe(-6);
  });

  it("schedules multiple clips independently", () => {
    const out = scheduleClips(
      [
        clip({ id: "a", take_id: "t1", offset: 0, length: 2 }),
        clip({ id: "b", take_id: "t2", offset: 3, length: 2 }),
      ],
      CTX,
    );
    expect(out.map((s) => s.clipId)).toEqual(["a", "b"]);
    expect(out[1].when).toBe(13);
  });
});

describe("dbToLinear", () => {
  it("maps 0 dB to unity and -6 dB to ~0.5", () => {
    expect(dbToLinear(0)).toBe(1);
    expect(dbToLinear(-6)).toBeCloseTo(0.501, 2);
  });
});
