/**
 * Vitest unit tests for the OperationLog reducer + undo/redo cursor.
 *
 * The disk journal lives in Rust; here we only verify the in-memory replay
 * invariants the UI depends on.
 */

import { describe, expect, it } from "vitest";

import {
  OperationLogState,
  applyOperation,
  buildScoreInitOp,
  buildScoreReplaceOp,
  buildScoreTransposeOp,
  replayOperations,
} from "./OperationLog";

const initial = (musicxml = "<blank/>") => ({ musicxml });

describe("applyOperation", () => {
  it("score_init replaces state", () => {
    const op = buildScoreInitOp({
      musicxml: "<score-init/>",
      title: "t",
      composer: "c",
      tempo_bpm: 120,
      time_signature: "4/4",
      key_signature: "C major",
    });
    const out = applyOperation(initial(), op);
    expect(out.musicxml).toBe("<score-init/>");
  });

  it("score_replace replaces state", () => {
    const op = buildScoreReplaceOp(
      {
        previousMusicXml: "<a/>",
        nextMusicXml: "<b/>",
        reason: "edit",
        description: "Edited",
      },
      1,
    );
    const out = applyOperation(initial("<a/>"), op);
    expect(out.musicxml).toBe("<b/>");
  });

  it("score_transpose replaces state with the transposed musicxml", () => {
    const op = buildScoreTransposeOp(
      {
        previousMusicXml: "<a/>",
        nextMusicXml: "<b transposed/>",
        fromKey: "F# minor",
        toKey: "G minor",
        interval: "Minor Second",
      },
      1,
    );
    const out = applyOperation(initial("<a/>"), op);
    expect(out.musicxml).toBe("<b transposed/>");
  });

  it("unknown kinds leave state unchanged", () => {
    const out = applyOperation(initial("<a/>"), {
      id: "op-1",
      kind: "made_up_kind",
      timestamp: "1970",
      index: 1,
      data: {},
    });
    expect(out.musicxml).toBe("<a/>");
  });
});

describe("replayOperations", () => {
  it("rebuilds state from init through ten edits", () => {
    const init = buildScoreInitOp(
      {
        musicxml: "<blank/>",
        title: "t",
        composer: "c",
        tempo_bpm: 120,
        time_signature: "4/4",
        key_signature: "C major",
      },
      0,
    );
    let prev = "<blank/>";
    const ops = [init];
    for (let i = 1; i <= 10; i += 1) {
      const next = `<score n=${i}/>`;
      ops.push(
        buildScoreReplaceOp(
          {
            previousMusicXml: prev,
            nextMusicXml: next,
            reason: "edit",
            description: `Edit #${i}`,
          },
          i,
        ),
      );
      prev = next;
    }
    const out = replayOperations({ musicxml: "" }, ops);
    expect(out.musicxml).toBe("<score n=10/>");
  });
});

describe("OperationLogState undo/redo", () => {
  const initOp = buildScoreInitOp(
    {
      musicxml: "<blank/>",
      title: "t",
      composer: "c",
      tempo_bpm: 120,
      time_signature: "4/4",
      key_signature: "C major",
    },
    0,
  );

  const editOp = (i: number, from: string, to: string) =>
    buildScoreReplaceOp(
      {
        previousMusicXml: from,
        nextMusicXml: to,
        reason: "edit",
        description: `Edit #${i}`,
      },
      i,
    );

  it("never lets the user undo past the score_init op", () => {
    const log = new OperationLogState([initOp]);
    expect(log.canUndo()).toBe(false);
    expect(log.undo()).toBeNull();
  });

  it("supports undo then redo", () => {
    const ops = [
      initOp,
      editOp(1, "<blank/>", "<a/>"),
      editOp(2, "<a/>", "<b/>"),
    ];
    const log = new OperationLogState(ops);
    expect(log.appliedCount).toBe(3);
    expect(log.replay({ musicxml: "" }).musicxml).toBe("<b/>");

    expect(log.canUndo()).toBe(true);
    log.undo();
    expect(log.appliedCount).toBe(2);
    expect(log.replay({ musicxml: "" }).musicxml).toBe("<a/>");

    expect(log.canRedo()).toBe(true);
    log.redo();
    expect(log.appliedCount).toBe(3);
    expect(log.replay({ musicxml: "" }).musicxml).toBe("<b/>");
  });

  it("appending after an undo drops the redo future", () => {
    const ops = [
      initOp,
      editOp(1, "<blank/>", "<a/>"),
      editOp(2, "<a/>", "<b/>"),
    ];
    const log = new OperationLogState(ops);
    log.undo(); // we are now back at <a/>
    expect(log.canRedo()).toBe(true);

    const newBranch = editOp(2, "<a/>", "<c/>");
    log.append(newBranch);
    expect(log.canRedo()).toBe(false);
    expect(log.replay({ musicxml: "" }).musicxml).toBe("<c/>");
  });

  it("nextIndex is monotonic across appends", () => {
    const log = new OperationLogState([initOp]);
    expect(log.nextIndex).toBe(1);
    log.append(editOp(1, "<blank/>", "<a/>"));
    expect(log.nextIndex).toBe(2);
    log.append(editOp(2, "<a/>", "<b/>"));
    expect(log.nextIndex).toBe(3);
  });
});
