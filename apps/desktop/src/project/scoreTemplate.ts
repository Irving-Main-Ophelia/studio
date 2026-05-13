/**
 * Stockhausen's blank-piano-score MusicXML template.
 *
 * "New project" needs a starting score. M1.0 ships exactly one template — a
 * grand-staff piano in the user-chosen key, time signature, and tempo — so
 * that the maintainer can begin writing notes immediately in M1.1.
 *
 * Music analogy: this is the equivalent of opening a fresh sheet of staff
 * paper, drawing the two five-line staves of a grand staff, writing the key
 * signature at the start, the time signature next to it, and tacking the
 * tempo marking above the first system. Nothing else.
 */

/* ------------------------- Key → fifths ------------------------------- */

/**
 * Mapping from human key names (as the user picks them in the dialog) to
 * the MusicXML `<fifths>` integer (number of sharps; negative = flats).
 * Mode is captured separately so `enharmonic_respell` and the
 * `score.transpose` tool agree on accidental spelling.
 */
const KEY_TABLE: Record<string, { fifths: number; mode: "major" | "minor" }> = {
  "C major": { fifths: 0, mode: "major" },
  "G major": { fifths: 1, mode: "major" },
  "D major": { fifths: 2, mode: "major" },
  "A major": { fifths: 3, mode: "major" },
  "E major": { fifths: 4, mode: "major" },
  "B major": { fifths: 5, mode: "major" },
  "F# major": { fifths: 6, mode: "major" },
  "C# major": { fifths: 7, mode: "major" },
  "F major": { fifths: -1, mode: "major" },
  "Bb major": { fifths: -2, mode: "major" },
  "Eb major": { fifths: -3, mode: "major" },
  "Ab major": { fifths: -4, mode: "major" },
  "Db major": { fifths: -5, mode: "major" },
  "Gb major": { fifths: -6, mode: "major" },
  "Cb major": { fifths: -7, mode: "major" },

  "A minor": { fifths: 0, mode: "minor" },
  "E minor": { fifths: 1, mode: "minor" },
  "B minor": { fifths: 2, mode: "minor" },
  "F# minor": { fifths: 3, mode: "minor" },
  "C# minor": { fifths: 4, mode: "minor" },
  "G# minor": { fifths: 5, mode: "minor" },
  "D# minor": { fifths: 6, mode: "minor" },
  "A# minor": { fifths: 7, mode: "minor" },
  "D minor": { fifths: -1, mode: "minor" },
  "G minor": { fifths: -2, mode: "minor" },
  "C minor": { fifths: -3, mode: "minor" },
  "F minor": { fifths: -4, mode: "minor" },
  "Bb minor": { fifths: -5, mode: "minor" },
  "Eb minor": { fifths: -6, mode: "minor" },
  "Ab minor": { fifths: -7, mode: "minor" },
};

export const SUPPORTED_KEYS = Object.keys(KEY_TABLE);

export const COMMON_TIME_SIGNATURES = [
  "4/4",
  "3/4",
  "2/4",
  "6/8",
  "9/8",
  "12/8",
  "5/4",
  "7/8",
];

export interface KeyParts {
  fifths: number;
  mode: "major" | "minor";
}

/** Throws if the key is not in our table. */
export function parseKey(key: string): KeyParts {
  const normalized = key.trim();
  const direct = KEY_TABLE[normalized];
  if (direct) return direct;
  // Accept "Gm" style as a friendly alternative for "G minor".
  if (/^[A-G][#b]?m$/i.test(normalized)) {
    const root = normalized.slice(0, -1);
    const alt = KEY_TABLE[`${root} minor`];
    if (alt) return alt;
  }
  throw new Error(`Unsupported key signature: ${key}`);
}

export interface TimeSignatureParts {
  beats: number;
  beatType: number;
}

export function parseTimeSignature(sig: string): TimeSignatureParts {
  const m = sig.trim().match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!m) throw new Error(`Unsupported time signature: ${sig}`);
  const beats = parseInt(m[1], 10);
  const beatType = parseInt(m[2], 10);
  if (![1, 2, 4, 8, 16, 32].includes(beatType)) {
    throw new Error(`Unsupported beat type in time signature: ${sig}`);
  }
  return { beats, beatType };
}

/* ------------------------- Template ----------------------------------- */

/**
 * One whole-bar rest at the chosen denominator. `divisions=4` in our
 * template means a quarter note = 4 divisions, so:
 *   - quarter beat = 4 divisions
 *   - eighth beat = 2 divisions
 *   - sixteenth beat = 1 division
 *   - dotted-half + whole = scale linearly
 */
const BASE_DIVISIONS = 4;

function divisionsPerWholeBar(beats: number, beatType: number): number {
  const perBeat = BASE_DIVISIONS * (4 / beatType);
  return Math.round(perBeat * beats);
}

function emptyMeasure(
  measureNumber: number,
  staves: 2,
  divisionsPerMeasure: number,
  emitAttributes: boolean,
  attributes: string,
): string {
  // Whole-measure rest on staff 1
  const restStaff1 = `      <note>
        <rest measure="yes"/>
        <duration>${divisionsPerMeasure}</duration>
        <voice>1</voice>
        <staff>1</staff>
      </note>`;
  const backup = `      <backup>
        <duration>${divisionsPerMeasure}</duration>
      </backup>`;
  const restStaff2 = `      <note>
        <rest measure="yes"/>
        <duration>${divisionsPerMeasure}</duration>
        <voice>2</voice>
        <staff>${staves}</staff>
      </note>`;
  return `    <measure number="${measureNumber}">
${emitAttributes ? attributes : ""}
${restStaff1}
${backup}
${restStaff2}
    </measure>`;
}

export interface BlankScoreOptions {
  title: string;
  composer: string;
  tempo_bpm: number;
  time_signature: string;
  key_signature: string;
  /** Default 4 bars. The notation editor in M1.1 will add/remove bars. */
  bars?: number;
}

/**
 * Build a blank grand-staff piano MusicXML 4.0 score with the requested key,
 * time signature, and tempo. The score body is N whole-measure rests in
 * both staves; no notes.
 */
export function buildBlankPianoScore(opts: BlankScoreOptions): string {
  const bars = Math.max(1, opts.bars ?? 4);
  const key = parseKey(opts.key_signature);
  const ts = parseTimeSignature(opts.time_signature);
  const dpm = divisionsPerWholeBar(ts.beats, ts.beatType);
  const tempo = Math.max(20, Math.round(opts.tempo_bpm));

  // Attributes block only on bar 1; subsequent bars inherit.
  const attributes = `      <attributes>
        <divisions>${BASE_DIVISIONS}</divisions>
        <key>
          <fifths>${key.fifths}</fifths>
          <mode>${key.mode}</mode>
        </key>
        <time>
          <beats>${ts.beats}</beats>
          <beat-type>${ts.beatType}</beat-type>
        </time>
        <staves>2</staves>
        <clef number="1"><sign>G</sign><line>2</line></clef>
        <clef number="2"><sign>F</sign><line>4</line></clef>
      </attributes>
      <direction placement="above">
        <direction-type>
          <metronome>
            <beat-unit>quarter</beat-unit>
            <per-minute>${tempo}</per-minute>
          </metronome>
        </direction-type>
        <sound tempo="${tempo}"/>
      </direction>`;

  const measures: string[] = [];
  for (let i = 1; i <= bars; i += 1) {
    measures.push(emptyMeasure(i, 2, dpm, i === 1, attributes));
  }

  const titleXml = escapeXml(opts.title.trim() || "Untitled");
  const composerXml = escapeXml(opts.composer.trim() || "Anonymous");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work>
    <work-title>${titleXml}</work-title>
  </work>
  <identification>
    <creator type="composer">${composerXml}</creator>
    <encoding>
      <software>Stockhausen</software>
      <encoding-date>${new Date().toISOString().slice(0, 10)}</encoding-date>
    </encoding>
  </identification>
  <part-list>
    <score-part id="P1">
      <part-name>Piano</part-name>
      <part-abbreviation>Pno.</part-abbreviation>
      <score-instrument id="P1-I1">
        <instrument-name>Piano</instrument-name>
      </score-instrument>
    </score-part>
  </part-list>
  <part id="P1">
${measures.join("\n")}
  </part>
</score-partwise>
`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
