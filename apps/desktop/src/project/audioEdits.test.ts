import { describe, expect, it } from "vitest";

import {
  applyAudioEdit,
  buildAudioClipAddOp,
  buildAudioClipRemoveOp,
  buildAudioClipSetGainOp,
  buildMarkerAddOp,
  buildMarkerMoveOp,
  buildMarkerRemoveOp,
  clipFromTake,
  countInSeconds,
  isAudioEditKind,
  makeMarker,
} from "./audioEdits";
import type { ProjectMeta } from "./types";

function emptyMeta(): ProjectMeta {
  return {
    schema_version: 4,
    id: "p",
    title: "T",
    composer: "",
    created_at: "2026-06-30T00:00:00Z",
    updated_at: "2026-06-30T00:00:00Z",
    tempo_bpm: 120,
    time_signature: "4/4",
    key_signature: "C major",
    instrumentation: [],
    mixer: { tracks: [], master: { gain_db: 0 } },
    agent_state: { last_seen_message_count: 0, pinned_explanations: [] },
    composition_brief: null,
    audio_clips: [],
    markers: [],
    last_op_index: 0,
  };
}

describe("clipFromTake", () => {
  it("creates a full-length, unity-gain, fade-less clip referencing the take", () => {
    const clip = clipFromTake({ take_id: "take-1", duration_secs: 4.5 }, 2);
    expect(clip.take_id).toBe("take-1");
    expect(clip.offset).toBe(2);
    expect(clip.length).toBe(4.5);
    expect(clip.gain_db).toBe(0);
    expect(clip.fades).toEqual({ fade_in: 0, fade_out: 0 });
    expect(clip.id).toBeTruthy();
  });

  it("defaults the timeline offset to 0", () => {
    expect(clipFromTake({ take_id: "t", duration_secs: 1 }).offset).toBe(0);
  });
});

describe("audio clip operations", () => {
  it("add places the clip in meta and the inverse removes it (round-trip)", () => {
    const clip = clipFromTake({ take_id: "take-1", duration_secs: 3 });
    const op = buildAudioClipAddOp(clip, 1);
    expect(op.kind).toBe("audio_clip_add");
    expect(isAudioEditKind(op.kind)).toBe(true);

    const added = applyAudioEdit(emptyMeta(), op);
    expect(added.audio_clips).toHaveLength(1);
    expect(added.audio_clips?.[0]).toEqual(clip);

    // Undo via the paired inverse returns to the empty list.
    const undone = applyAudioEdit(added, op.inverse!);
    expect(undone.audio_clips).toHaveLength(0);
  });

  it("add is idempotent on a duplicate clip id", () => {
    const clip = clipFromTake({ take_id: "take-1", duration_secs: 3 });
    const op = buildAudioClipAddOp(clip, 1);
    const once = applyAudioEdit(emptyMeta(), op);
    const twice = applyAudioEdit(once, op);
    expect(twice.audio_clips).toHaveLength(1);
  });

  it("remove drops the clip and its inverse restores it", () => {
    const clip = clipFromTake({ take_id: "take-1", duration_secs: 3 });
    const start = applyAudioEdit(emptyMeta(), buildAudioClipAddOp(clip, 1));

    const rm = buildAudioClipRemoveOp(clip, 2);
    const removed = applyAudioEdit(start, rm);
    expect(removed.audio_clips).toHaveLength(0);

    const restored = applyAudioEdit(removed, rm.inverse!);
    expect(restored.audio_clips?.[0]).toEqual(clip);
  });

  it("set-gain updates only the target clip and the inverse restores the old gain", () => {
    const clip = clipFromTake({ take_id: "take-1", duration_secs: 3 });
    const start = applyAudioEdit(emptyMeta(), buildAudioClipAddOp(clip, 1));

    const op = buildAudioClipSetGainOp(clip.id, 0, -6, 2);
    const louder = applyAudioEdit(start, op);
    expect(louder.audio_clips?.[0].gain_db).toBe(-6);

    const back = applyAudioEdit(louder, op.inverse!);
    expect(back.audio_clips?.[0].gain_db).toBe(0);
  });
});

describe("marker operations", () => {
  it("add inserts the marker sorted by position; inverse removes it", () => {
    const late = makeMarker("Chorus", 8);
    const early = makeMarker("Intro", 0);
    let meta = applyAudioEdit(emptyMeta(), buildMarkerAddOp(late, 1));
    meta = applyAudioEdit(meta, buildMarkerAddOp(early, 2));

    expect(meta.markers?.map((m) => m.name)).toEqual(["Intro", "Chorus"]);

    const undo = applyAudioEdit(meta, buildMarkerAddOp(early, 2).inverse!);
    expect(undo.markers?.map((m) => m.name)).toEqual(["Chorus"]);
  });

  it("move updates the position and re-sorts; inverse restores it", () => {
    const a = makeMarker("A", 1);
    const b = makeMarker("B", 2);
    let meta = applyAudioEdit(emptyMeta(), buildMarkerAddOp(a, 1));
    meta = applyAudioEdit(meta, buildMarkerAddOp(b, 2));

    const op = buildMarkerMoveOp(a.id, 1, 5, 3);
    const moved = applyAudioEdit(meta, op);
    expect(moved.markers?.map((m) => m.name)).toEqual(["B", "A"]);
    expect(moved.markers?.find((m) => m.id === a.id)?.position).toBe(5);

    const back = applyAudioEdit(moved, op.inverse!);
    expect(back.markers?.map((m) => m.name)).toEqual(["A", "B"]);
  });

  it("remove drops the marker and its inverse restores it", () => {
    const m = makeMarker("Bridge", 12);
    const start = applyAudioEdit(emptyMeta(), buildMarkerAddOp(m, 1));
    const rm = buildMarkerRemoveOp(m, 2);
    const removed = applyAudioEdit(start, rm);
    expect(removed.markers).toHaveLength(0);
    expect(applyAudioEdit(removed, rm.inverse!).markers?.[0]).toEqual(m);
  });
});

describe("countInSeconds", () => {
  it("converts bars to seconds using tempo + time signature", () => {
    expect(countInSeconds(2, 120, "4/4")).toBe(4); // 2 bars * 4 beats * 0.5 s
    expect(countInSeconds(1, 60, "3/4")).toBe(3); // 1 bar * 3 beats * 1 s
    expect(countInSeconds(1, 120, "6/8")).toBeCloseTo(3); // numerator=6 beats * 0.5 s
  });

  it("returns 0 for a non-positive count-in or tempo", () => {
    expect(countInSeconds(0, 120, "4/4")).toBe(0);
    expect(countInSeconds(2, 0, "4/4")).toBe(0);
  });
});

describe("applyAudioEdit", () => {
  it("passes unknown operation kinds through unchanged", () => {
    const meta = emptyMeta();
    const out = applyAudioEdit(meta, {
      id: "x",
      kind: "score_replace",
      timestamp: "",
      index: 1,
      data: {},
    });
    expect(out).toBe(meta);
  });

  it("tolerates meta with undefined clip/marker arrays", () => {
    const meta = { ...emptyMeta(), audio_clips: undefined, markers: undefined };
    const clip = clipFromTake({ take_id: "t", duration_secs: 1 });
    const out = applyAudioEdit(meta, buildAudioClipAddOp(clip, 1));
    expect(out.audio_clips).toHaveLength(1);
  });
});
