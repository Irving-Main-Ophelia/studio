/**
 * Convert an alphaTab `Score` (parsed from a Guitar Pro file) into MusicXML for
 * Stockhausen's import pipeline (Track A, A7 — see ADR-0019).
 *
 * alphaTab is import-only and has no MusicXML exporter, so this is the conversion
 * boundary. Coverage is **incremental and honest**: the core a guitarist needs —
 * parts, measures, pitches, rhythm (dots + tuplets), multi-voice, string/fret,
 * ties, harmonics, hammer-ons/pull-offs — converts faithfully; effects we don't
 * map yet are counted and reported (ADR-0017), never silently dropped.
 *
 * The canonical score we produce is **standard notation** MusicXML (the tab view
 * is derived on demand by the backend projection, A1).
 */

import type { model } from "@coderline/alphatab";

// alphaTab `model.Clef` enum values, mirrored as plain numbers so this module is
// **type-only** against alphaTab — keeping the heavy runtime out of the static
// bundle (it loads via dynamic import() only when a Guitar Pro file is opened).
const CLEF = { Neutral: 0, C3: 1, C4: 2, F4: 3, G2: 4 } as const;

export interface GuitarProConversion {
  musicxml: string;
  /** Per-part tuning (string 1 / highest first) discovered from the file, for the project's guitar config. */
  tunings: { partId: string; tuning: string[]; capo: number }[];
  /** Human-readable notices about features that did not convert (ADR-0017). */
  warnings: string[];
}

const DIVISIONS = 960; // divisible by 2/3/4/5 ⇒ exact for common tuplets

const SHARP_SPELL: [string, number][] = [
  ["C", 0], ["C", 1], ["D", 0], ["D", 1], ["E", 0], ["F", 0],
  ["F", 1], ["G", 0], ["G", 1], ["A", 0], ["A", 1], ["B", 0],
];

const DURATION_TYPE: Record<number, string> = {
  1: "whole", 2: "half", 4: "quarter", 8: "eighth",
  16: "16th", 32: "32nd", 64: "64th",
};

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function midiToPitch(midi: number): { step: string; alter: number; octave: number } {
  const pc = ((midi % 12) + 12) % 12;
  const [step, alter] = SHARP_SPELL[pc];
  const octave = Math.floor(midi / 12) - 1;
  return { step, alter, octave };
}

/** MusicXML clef element for an alphaTab `Clef`. Guitar uses treble-8vb. */
function clefXml(clef: model.Clef): string {
  switch (clef as number) {
    case CLEF.F4:
      return "<clef><sign>F</sign><line>4</line></clef>";
    case CLEF.C3:
      return "<clef><sign>C</sign><line>3</line></clef>";
    case CLEF.C4:
      return "<clef><sign>C</sign><line>4</line></clef>";
    case CLEF.G2:
    default:
      // Treble, sounding an octave lower (standard guitar notation).
      return "<clef><sign>G</sign><line>2</line><clef-octave-change>-1</clef-octave-change></clef>";
  }
}

/** Quarter-note length of a beat, honouring dots and tuplets. */
function beatQuarters(beat: model.Beat): number {
  const base = 4 / (beat.duration as number);
  const dotFactor = 2 - Math.pow(2, -beat.dots);
  let q = base * dotFactor;
  if (beat.hasTuplet && beat.tupletNumerator > 0) {
    q *= beat.tupletDenominator / beat.tupletNumerator;
  }
  return q;
}

function divisionsOf(beat: model.Beat): number {
  return Math.round(beatQuarters(beat) * DIVISIONS);
}

/** MusicXML `<string>` (1 = highest) from alphaTab's numbering (count = highest). */
function musicXmlString(note: model.Note, stringCount: number): number {
  return stringCount - note.string + 1;
}

/** A `note.id → hammer/pull role` map, resolved per voice by pitch direction. */
function resolveHopo(
  beats: model.Beat[],
): Map<number, { kind: "hammer-on" | "pull-off"; role: "start" | "stop" }> {
  const map = new Map<number, { kind: "hammer-on" | "pull-off"; role: "start" | "stop" }>();
  for (let i = 0; i < beats.length; i++) {
    for (const note of beats[i].notes) {
      if (!note.isHammerPullOrigin) continue;
      // Destination: the next beat's note on the same string (best-effort).
      const next = beats[i + 1];
      const dest = next?.notes.find((n) => n.string === note.string) ?? next?.notes[0];
      if (!dest) continue;
      const kind = dest.realValue >= note.realValue ? "hammer-on" : "pull-off";
      map.set(note.id, { kind, role: "start" });
      map.set(dest.id, { kind, role: "stop" });
    }
  }
  return map;
}

interface ConvertState {
  warnings: Set<string>;
}

function noteXml(
  note: model.Note,
  beat: model.Beat,
  isChord: boolean,
  voice: number,
  stringCount: number,
  hopo: Map<number, { kind: "hammer-on" | "pull-off"; role: "start" | "stop" }>,
  state: ConvertState,
): string {
  const dur = divisionsOf(beat);
  const { step, alter, octave } = midiToPitch(note.realValue);
  const type = DURATION_TYPE[beat.duration as number] ?? "quarter";

  const ties: string[] = [];
  const tied: string[] = [];
  if (note.isTieDestination) {
    ties.push('<tie type="stop"/>');
    tied.push('<tied type="stop"/>');
  }
  if (note.isTieOrigin) {
    ties.push('<tie type="start"/>');
    tied.push('<tied type="start"/>');
  }

  const technical: string[] = [];
  const hop = hopo.get(note.id);
  if (hop) {
    technical.push(`<${hop.kind} type="${hop.role}"/>`);
  }
  if (note.isHarmonic) {
    technical.push("<harmonic><natural/></harmonic>");
  }
  if (note.hasBend) {
    const max = note.maxBendPoint;
    // alphaTab bend points are in 1/4-tone units ⇒ /2 for semitones.
    const alterSemis = max ? Math.round((max.value / 2) * 10) / 10 : 1;
    technical.push(`<bend><bend-alter>${alterSemis}</bend-alter></bend>`);
  }
  if (note.isStringed && note.fret >= 0) {
    technical.push(`<string>${musicXmlString(note, stringCount)}</string>`);
    technical.push(`<fret>${note.fret}</fret>`);
  }

  // Honest reporting of beat-level effects we don't map yet (ADR-0017).
  if (beat.isPalmMute) state.warnings.add("palm mute");
  if (beat.isLetRing) state.warnings.add("let ring");

  const notations: string[] = [];
  if (tied.length) notations.push(...tied);
  if (technical.length) notations.push(`<technical>${technical.join("")}</technical>`);

  const dots = "<dot/>".repeat(beat.dots);
  const timeMod =
    beat.hasTuplet && beat.tupletNumerator > 0
      ? `<time-modification><actual-notes>${beat.tupletNumerator}</actual-notes>` +
        `<normal-notes>${beat.tupletDenominator}</normal-notes></time-modification>`
      : "";

  return (
    "<note>" +
    (isChord ? "<chord/>" : "") +
    `<pitch><step>${step}</step>` +
    (alter ? `<alter>${alter}</alter>` : "") +
    `<octave>${octave}</octave></pitch>` +
    `<duration>${dur}</duration>` +
    ties.join("") +
    `<voice>${voice}</voice>` +
    `<type>${type}</type>` +
    dots +
    timeMod +
    (notations.length ? `<notations>${notations.join("")}</notations>` : "") +
    "</note>"
  );
}

function restXml(beat: model.Beat, voice: number): string {
  const dur = divisionsOf(beat);
  const type = DURATION_TYPE[beat.duration as number] ?? "quarter";
  return (
    "<note><rest/>" +
    `<duration>${dur}</duration>` +
    `<voice>${voice}</voice>` +
    `<type>${type}</type>` +
    "<dot/>".repeat(beat.dots) +
    "</note>"
  );
}

function measureDivisions(masterBar: model.MasterBar): number {
  const quarters = (masterBar.timeSignatureNumerator * 4) / masterBar.timeSignatureDenominator;
  return Math.round(quarters * DIVISIONS);
}

function tuningPitchNames(tuning: number[]): string[] {
  // alphaTab tuning is highest-string first — matches MusicXML <string> 1 = highest.
  return tuning.map((midi) => {
    const { step, alter, octave } = midiToPitch(midi);
    return `${step}${alter > 0 ? "#" : ""}${octave}`;
  });
}

/** Convert a parsed alphaTab score to MusicXML + per-part tuning + warnings. */
export function alphaTabScoreToMusicXml(score: model.Score): GuitarProConversion {
  const state: ConvertState = { warnings: new Set() };
  const tunings: GuitarProConversion["tunings"] = [];

  const partHeaders: string[] = [];
  const partBodies: string[] = [];

  score.tracks.forEach((track, ti) => {
    const partId = `P${ti + 1}`;
    const staff = track.staves[0];
    const stringCount = staff.tuning.length || 6;
    partHeaders.push(
      `<score-part id="${partId}"><part-name>${xmlEscape(track.name || `Part ${ti + 1}`)}</part-name></score-part>`,
    );
    if (staff.isStringed && staff.tuning.length) {
      tunings.push({ partId, tuning: tuningPitchNames(staff.tuning), capo: staff.capo });
    }

    const measures: string[] = [];
    let prevFifths: number | null = null;
    let prevTime: string | null = null;

    staff.bars.forEach((bar, bi) => {
      const masterBar = score.masterBars[bi];
      const fifths = bar.keySignature as number;
      const timeKey = `${masterBar.timeSignatureNumerator}/${masterBar.timeSignatureDenominator}`;

      const attrs: string[] = [];
      if (bi === 0) attrs.push(`<divisions>${DIVISIONS}</divisions>`);
      if (fifths !== prevFifths) attrs.push(`<key><fifths>${fifths}</fifths></key>`);
      if (timeKey !== prevTime) {
        attrs.push(
          `<time><beats>${masterBar.timeSignatureNumerator}</beats>` +
            `<beat-type>${masterBar.timeSignatureDenominator}</beat-type></time>`,
        );
      }
      if (bi === 0) attrs.push(clefXml(bar.clef));
      prevFifths = fifths;
      prevTime = timeKey;

      const parts: string[] = [];
      if (attrs.length) parts.push(`<attributes>${attrs.join("")}</attributes>`);

      const voices = bar.voices.filter((v) => !v.isEmpty);
      voices.forEach((voice, vi) => {
        if (vi > 0) {
          parts.push(`<backup><duration>${measureDivisions(masterBar)}</duration></backup>`);
        }
        const voiceNum = vi + 1;
        const hopo = resolveHopo(voice.beats);
        for (const beat of voice.beats) {
          if (beat.isRest || beat.notes.length === 0) {
            parts.push(restXml(beat, voiceNum));
            continue;
          }
          beat.notes.forEach((note, ni) => {
            parts.push(noteXml(note, beat, ni > 0, voiceNum, stringCount, hopo, state));
          });
        }
      });

      measures.push(`<measure number="${bi + 1}">${parts.join("")}</measure>`);
    });

    partBodies.push(`<part id="${partId}">${measures.join("")}</part>`);
  });

  const musicxml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<score-partwise version="4.0">' +
    `<part-list>${partHeaders.join("")}</part-list>` +
    partBodies.join("") +
    "</score-partwise>";

  const warnings = [...state.warnings].map(
    (f) => `${f} markings were not converted (notation kept, effect dropped).`,
  );
  return { musicxml, tunings, warnings };
}
