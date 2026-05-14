// TypeScript mirrors of the public surface of stockhausen-theory.
// These are intentionally hand-maintained (no codegen) because the surface
// changes rarely and we want the frontend to be able to import them
// without spinning up a Python toolchain.
//
// Always keep these in sync with packages/theory/python/stockhausen_theory.

export interface KeyAnalysis {
  tonic: string;
  mode: string;
  confidence: number;
  alternatives: Array<{ tonic: string; mode: string; confidence: number }>;
}

export interface ProgressionChord {
  measure: number;
  beat: number;
  pitches: string[];
  roman: string;
  symbol: string;
}

export interface ProgressionAnalysis {
  key: { tonic: string; mode: string };
  chords: ProgressionChord[];
  summary: string;
}

export interface VoiceLeadingPair {
  voices: [string, string];
  intervals: Array<{
    measure: number;
    beat: number;
    interval: string;
    midi: [number, number];
  }>;
}

export interface VoiceLeadingAnalysis {
  pairs: VoiceLeadingPair[];
}

export interface RangeWarning {
  part_index: number;
  part_name: string;
  measure: number;
  beat: number;
  pitch: string;
  midi: number;
  direction: "below" | "above";
}

export interface RangeAnalysis {
  parts: Array<{
    part_index: number;
    part_name: string;
    lowest: string | null;
    highest: string | null;
    range_low: string;
    range_high: string;
    warnings: RangeWarning[];
  }>;
}

export type CadenceKind = "authentic" | "plagal" | "half" | "deceptive";

export interface Cadence {
  kind: CadenceKind;
  measure: number;
  beat: number;
  roman_progression: [string, string];
}

export interface CadenceAnalysis {
  key: { tonic: string; mode: string };
  cadences: Cadence[];
}

export interface Motif {
  intervals: number[];
  occurrences: Array<{ part_index: number; measure: number; beat: number }>;
}

export interface MotifAnalysis {
  motifs: Motif[];
  n: number;
}

export type VoiceLeadingViolationKind = "parallel_fifths" | "parallel_octaves";

export interface VoiceLeadingViolation {
  kind: VoiceLeadingViolationKind;
  voices: [string, string];
  from_measure: number;
  to_measure: number;
}

export interface VoiceLeadingValidation {
  violations: VoiceLeadingViolation[];
}

export interface VoicingWarning {
  kind: "voicing_too_wide";
  voices: [string, string];
  measure: number;
  beat: number;
  semitones: number;
}

export interface VoicingValidation {
  warnings: VoicingWarning[];
}

export interface RhythmWarning {
  kind: "measure_duration_mismatch";
  part_index: number;
  measure: number;
  expected_quarters: number;
  actual_quarters: number;
}

export interface RhythmValidation {
  warnings: RhythmWarning[];
}

export interface TransposeResult {
  musicxml: string;
  source_key: string;
  target_key: string;
  interval: string;
  warnings: RangeWarning[];
}

export interface TransposeRegionRequest {
  musicxml: string;
  target_key?: string;
  interval_name?: string;
  measure_start: number;
  measure_end: number;
  part_indices?: number[];
}
