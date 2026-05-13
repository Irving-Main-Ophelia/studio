import { describe, expect, it } from "vitest";

import { buildSciPitch, parseKey, resolveDuration } from "./noteGrammar";

const ctx = { inTypableTarget: false };

function ev(init: Partial<KeyboardEventInit> & { key: string }): KeyboardEvent {
  return new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
}

describe("parseKey — pitches", () => {
  it("lowercase letter inserts a natural", () => {
    const r = parseKey(ev({ key: "c" }), ctx);
    expect(r).toEqual({ kind: "insert_note", letter: "C", accidental: "natural" });
  });

  it("Shift+letter inserts a sharp", () => {
    const r = parseKey(ev({ key: "F", shiftKey: true }), ctx);
    expect(r).toEqual({ kind: "insert_note", letter: "F", accidental: "sharp" });
  });

  it("Alt+letter inserts a flat", () => {
    const r = parseKey(ev({ key: "b", altKey: true }), ctx);
    expect(r).toEqual({ kind: "insert_note", letter: "B", accidental: "flat" });
  });

  it("ignores meta+letter (reserved for shortcuts)", () => {
    expect(parseKey(ev({ key: "n", metaKey: true }), ctx)).toBeNull();
    expect(parseKey(ev({ key: "z", ctrlKey: true }), ctx)).toBeNull();
  });

  it("yields when the focus is in a typable target", () => {
    expect(parseKey(ev({ key: "c" }), { inTypableTarget: true })).toBeNull();
  });
});

describe("parseKey — durations", () => {
  it.each([
    ["1", 4],
    ["2", 2],
    ["4", 1],
    ["8", 0.5],
    ["6", 0.25],
  ])("digit %s sets duration to %s quarter-lengths", (key, q) => {
    const r = parseKey(ev({ key }), ctx);
    expect(r).toEqual({ kind: "set_duration", duration_quarters: q, dot: false, triplet: false });
  });

  it("digit 3 enables triplet mode", () => {
    const r = parseKey(ev({ key: "3" }), ctx);
    expect(r).toMatchObject({ triplet: true });
  });

  it(". toggles the dot", () => {
    expect(parseKey(ev({ key: "." }), ctx)).toEqual({ kind: "toggle_duration_dot" });
  });
});

describe("parseKey — non-pitch actions", () => {
  it("rest, tie, articulations", () => {
    expect(parseKey(ev({ key: "r" }), ctx)).toEqual({ kind: "insert_rest" });
    expect(parseKey(ev({ key: "t" }), ctx)).toEqual({ kind: "tie_to_next" });
    expect(parseKey(ev({ key: "s" }), ctx)).toEqual({
      kind: "toggle_articulation",
      articulation: "staccato",
    });
    expect(parseKey(ev({ key: ">" }), ctx)).toEqual({
      kind: "toggle_articulation",
      articulation: "accent",
    });
    expect(parseKey(ev({ key: "^" }), ctx)).toEqual({
      kind: "toggle_articulation",
      articulation: "marcato",
    });
    expect(parseKey(ev({ key: "-" }), ctx)).toEqual({
      kind: "toggle_articulation",
      articulation: "tenuto",
    });
    expect(parseKey(ev({ key: ";" }), ctx)).toEqual({
      kind: "toggle_articulation",
      articulation: "fermata",
    });
  });

  it("letter f still inserts an F pitch (no conflict with fermata)", () => {
    expect(parseKey(ev({ key: "f" }), ctx)).toEqual({
      kind: "insert_note",
      letter: "F",
      accidental: "natural",
    });
  });

  it("cursor and octave navigation", () => {
    expect(parseKey(ev({ key: "ArrowUp" }), ctx)).toEqual({ kind: "octave_up" });
    expect(parseKey(ev({ key: "ArrowDown" }), ctx)).toEqual({ kind: "octave_down" });
    expect(parseKey(ev({ key: "ArrowLeft" }), ctx)).toEqual({ kind: "cursor_prev" });
    expect(parseKey(ev({ key: "ArrowRight" }), ctx)).toEqual({ kind: "cursor_next" });
    expect(parseKey(ev({ key: "Enter" }), ctx)).toEqual({ kind: "cursor_next_measure" });
    expect(parseKey(ev({ key: "Backspace" }), ctx)).toEqual({ kind: "remove_last" });
  });
});

describe("buildSciPitch", () => {
  it("emits naturals, sharps, and flats music21-style", () => {
    expect(buildSciPitch("C", "natural", 4)).toBe("C4");
    expect(buildSciPitch("F", "sharp", 5)).toBe("F#5");
    expect(buildSciPitch("B", "flat", 3)).toBe("B-3");
  });
});

describe("resolveDuration", () => {
  it("plain duration", () => {
    expect(resolveDuration({ duration_quarters: 1, dot: false, triplet: false })).toBe(1);
  });
  it("dotted quarter = 1.5", () => {
    expect(resolveDuration({ duration_quarters: 1, dot: true, triplet: false })).toBe(1.5);
  });
  it("triplet eighth = 1/3", () => {
    expect(
      resolveDuration({ duration_quarters: 0.5, dot: false, triplet: true }),
    ).toBeCloseTo(1 / 3);
  });
});
