/**
 * Unit tests for HarmonyPanel.
 *
 * Strategy: mock `api` and `useScoreEngine`; render the component and assert
 * on what's visible in each sub-tab.  We test the three primary states:
 *   1. No score loaded  → placeholder text
 *   2. Data resolved    → SVG / text content from mock payloads
 *   3. API error        → error message displayed
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";

import type { ProgressionAnalysis, MotifAnalysis } from "@stockhausen/theory-types";

// ---------------------------------------------------------------------------
// Mocks must be declared BEFORE the import of the module under test
// ---------------------------------------------------------------------------

vi.mock("../lib/ScoreEngine", () => ({
  useScoreEngine: vi.fn(),
}));

vi.mock("../lib/api", () => ({
  api: {
    progression: vi.fn(),
    formAnalysis: vi.fn(),
    motifs: vi.fn(),
  },
}));

import { HarmonyPanel } from "./HarmonyPanel";
import { useScoreEngine } from "../lib/ScoreEngine";
import { api } from "../lib/api";

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

const PROGRESSION: ProgressionAnalysis = {
  key: { tonic: "C", mode: "major" },
  chords: [
    { measure: 1, beat: 1, pitches: ["C4", "E4", "G4"], roman: "I", symbol: "C" },
    { measure: 2, beat: 1, pitches: ["G3", "B3", "D4"], roman: "V", symbol: "G" },
    { measure: 3, beat: 1, pitches: ["F3", "A3", "C4"], roman: "IV", symbol: "F" },
  ],
  summary: "A simple I–V–IV progression in C major.",
};

const FORM = {
  key: { tonic: "C", mode: "major", confidence: 0.9 },
  total_measures: 8,
  phrases: [
    { measure_start: 1, measure_end: 4, cadence_kind: "half", cadence_roman: ["I", "V"] as [string, string] },
    { measure_start: 5, measure_end: 8, cadence_kind: "authentic", cadence_roman: ["V", "I"] as [string, string] },
  ],
  sections: [
    { name: "A", measure_start: 1, measure_end: 4, phrase_count: 1, closes_with: "half" },
    { name: "B", measure_start: 5, measure_end: 8, phrase_count: 1, closes_with: "authentic" },
  ],
};

const MOTIFS: MotifAnalysis = {
  motifs: [
    {
      intervals: [2, -1, 4],
      occurrences: [
        { part_index: 0, measure: 1, beat: 1 },
        { part_index: 0, measure: 3, beat: 1 },
      ],
    },
  ],
  n: 4,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockEngine(musicxml: string | null) {
  (useScoreEngine as ReturnType<typeof vi.fn>).mockReturnValue({
    score: musicxml ? { musicxml } : null,
  });
}

function mockApis() {
  (api.progression as ReturnType<typeof vi.fn>).mockResolvedValue(PROGRESSION);
  (api.formAnalysis as ReturnType<typeof vi.fn>).mockResolvedValue(FORM);
  (api.motifs as ReturnType<typeof vi.fn>).mockResolvedValue(MOTIFS);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("HarmonyPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows placeholder when no score is loaded", () => {
    mockEngine(null);
    render(<HarmonyPanel />);
    expect(screen.getByText("Load a score to analyse it.")).toBeTruthy();
  });

  it("fetches all three APIs when a score is provided", async () => {
    mockEngine("<xml/>");
    mockApis();
    render(<HarmonyPanel />);
    await waitFor(() => {
      expect(api.progression).toHaveBeenCalledWith("<xml/>");
      expect(api.formAnalysis).toHaveBeenCalledWith("<xml/>");
      expect(api.motifs).toHaveBeenCalledWith("<xml/>");
    });
  });

  it("renders chord progression tab by default with key info", async () => {
    mockEngine("<xml/>");
    mockApis();
    render(<HarmonyPanel />);
    await waitFor(() => {
      const summaries = screen.getAllByText(/C major/);
      expect(summaries.length).toBeGreaterThan(0);
    });
    expect(screen.getByText(/3 chords/)).toBeTruthy();
  });

  it("renders roman numeral labels in SVG", async () => {
    mockEngine("<xml/>");
    mockApis();
    render(<HarmonyPanel />);
    await waitFor(() => expect(screen.getByText("I")).toBeTruthy());
    expect(screen.getByText("V")).toBeTruthy();
    expect(screen.getByText("IV")).toBeTruthy();
  });

  it("renders the progression summary text", async () => {
    mockEngine("<xml/>");
    mockApis();
    render(<HarmonyPanel />);
    await waitFor(() =>
      expect(screen.getByText("A simple I–V–IV progression in C major.")).toBeTruthy()
    );
  });

  it("switches to Form tab and shows section names", async () => {
    mockEngine("<xml/>");
    mockApis();
    render(<HarmonyPanel />);
    await waitFor(() => expect(api.formAnalysis).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: /form/i }));
    await waitFor(() => {
      // Section labels from FormDiagram SVG
      const els = screen.getAllByText((content) => content === "A" || content === "B");
      expect(els.length).toBeGreaterThanOrEqual(2);
    });
    expect(screen.getByText(/8 measures/)).toBeTruthy();
  });

  it("switches to Motifs tab and shows interval shapes", async () => {
    mockEngine("<xml/>");
    mockApis();
    render(<HarmonyPanel />);
    await waitFor(() => expect(api.motifs).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: /motifs/i }));
    await waitFor(() => {
      expect(screen.getByText(/\+2/)).toBeTruthy();
    });
    expect(screen.getByText(/2×/)).toBeTruthy();
  });

  it("shows error message when API rejects", async () => {
    mockEngine("<xml/>");
    (api.progression as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Network error"));
    (api.formAnalysis as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Network error"));
    (api.motifs as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Network error"));
    render(<HarmonyPanel />);
    await waitFor(() => expect(screen.getByText(/Network error/)).toBeTruthy());
  });

  it("clears data when score is removed", async () => {
    const engineMock = vi.fn();
    (useScoreEngine as ReturnType<typeof vi.fn>).mockImplementation(engineMock);
    engineMock.mockReturnValue({ score: { musicxml: "<xml/>" } });
    mockApis();

    const { rerender } = render(<HarmonyPanel />);
    await waitFor(() => expect(api.progression).toHaveBeenCalled());

    engineMock.mockReturnValue({ score: null });
    rerender(<HarmonyPanel />);
    expect(screen.getByText("Load a score to analyse it.")).toBeTruthy();
  });
});
