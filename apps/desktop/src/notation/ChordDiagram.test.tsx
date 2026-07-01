/**
 * Unit tests for ChordDiagram (Track A, A5 §4.7 Q2).
 *
 * The diagram is presentational SVG; we assert it draws the right number of strings,
 * labels the chord, and marks open vs. muted strings from the per-string `frets`
 * array (string 1 first; -1 = muted, 0 = open).
 */

import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";

import { ChordDiagram } from "./ChordDiagram";

describe("ChordDiagram", () => {
  // Open C major: e0 B1 G0 D2 A3 Ex  (string 1..6)
  const cMajor = { chord: "C", base_fret: 0, frets: [0, 1, 0, 2, 3, -1] };

  it("labels the chord", () => {
    const { getByText } = render(<ChordDiagram data={cMajor} />);
    expect(getByText("C")).toBeTruthy();
  });

  it("draws one string line per string plus the accessible label", () => {
    const { container } = render(<ChordDiagram data={cMajor} />);
    expect(container.querySelector('svg[aria-label="C chord diagram"]')).toBeTruthy();
    // Six vertical string lines are drawn (x1 === x2).
    const verticals = [...container.querySelectorAll("line")].filter(
      (l) => l.getAttribute("x1") === l.getAttribute("x2"),
    );
    expect(verticals.length).toBe(6);
  });

  it("marks the muted string with × and open strings with a ring", () => {
    const { container } = render(<ChordDiagram data={cMajor} />);
    const muteMarks = [...container.querySelectorAll("text")].filter((t) => t.textContent === "×");
    expect(muteMarks.length).toBe(1); // the low E is muted
    // Two open strings (e, G) → two open-ring circles near the nut (cy < top of grid).
    const openRings = [...container.querySelectorAll("circle")].filter(
      (c) => c.getAttribute("fill") === "none",
    );
    expect(openRings.length).toBe(2);
  });

  it("shows a base-fret label for a movable shape", () => {
    // A barre shape starting at fret 5 (no open strings).
    const fMajorBarre = { chord: "F", base_fret: 5, frets: [5, 6, 7, 7, 8, 8] };
    const { getByText } = render(<ChordDiagram data={fMajorBarre} />);
    expect(getByText("5")).toBeTruthy();
  });
});
