/**
 * Compact chord-diagram (fret grid) — React + SVG (Track A, A5 §4.7 Q2).
 *
 * Draws one voicing as a conventional vertical grid: strings run top→bottom, the
 * lowest-pitched string on the left. OSMD does not render MusicXML `<frame>`
 * diagrams, so these are an SVG annotation strip above the staff — the same class of
 * aux view as the `Fretboard` panel (A4). OSMD stays the single staff renderer.
 *
 * `frets` is indexed by string (1 = highest, drawn on the right): -1 = muted,
 * 0 = open, n = the nth fret above `baseFret`.
 */

export interface ChordDiagramData {
  chord: string;
  base_fret: number;
  frets: number[]; // per string, string 1 (highest) first; -1 = muted, 0 = open
}

interface ChordDiagramProps {
  data: ChordDiagramData;
  /** Frets drawn in the grid window. Default 4. */
  fretCount?: number;
}

const MUTED = -1;

const COL = 11; // px between strings
const ROW = 13; // px between frets
const TOP = 16; // headroom for the o/x row
const LEFT = 8;

export function ChordDiagram({ data, fretCount = 4 }: ChordDiagramProps) {
  const strings = data.frets.length;
  // Draw low string on the left: reverse the string-1-first array.
  const columns = [...data.frets].reverse();
  // Open-position chords hang off the nut; higher voicings show a base-fret label.
  const windowBase = data.base_fret > 1 ? data.base_fret : 0;

  const width = LEFT * 2 + COL * (strings - 1);
  const height = TOP + ROW * fretCount + 16;
  const xOf = (col: number) => LEFT + col * COL;
  const yOfFret = (f: number) => TOP + f * ROW;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-[74px] w-auto"
      role="img"
      aria-label={`${data.chord} chord diagram`}
    >
      {/* nut (thick) only at open position; otherwise a plain top fret wire */}
      <line
        x1={xOf(0)}
        y1={TOP}
        x2={xOf(strings - 1)}
        y2={TOP}
        stroke="#a1a1aa"
        strokeWidth={windowBase === 0 ? 3 : 1}
      />
      {/* fret wires */}
      {Array.from({ length: fretCount }, (_, k) => (
        <line
          key={`fw${k}`}
          x1={xOf(0)}
          y1={yOfFret(k + 1)}
          x2={xOf(strings - 1)}
          y2={yOfFret(k + 1)}
          stroke="#3f3f46"
          strokeWidth={1}
        />
      ))}
      {/* strings + open/muted markers */}
      {columns.map((fret, col) => (
        <g key={`s${col}`}>
          <line
            x1={xOf(col)}
            y1={TOP}
            x2={xOf(col)}
            y2={yOfFret(fretCount)}
            stroke="#52525b"
            strokeWidth={0.6}
          />
          {fret === MUTED && (
            <text x={xOf(col)} y={TOP - 5} fontSize={9} fill="#71717a" textAnchor="middle">
              ×
            </text>
          )}
          {fret === 0 && (
            <circle cx={xOf(col)} cy={TOP - 8} r={3} fill="none" stroke="#71717a" strokeWidth={1} />
          )}
        </g>
      ))}
      {/* fretted dots */}
      {columns.map((fret, col) => {
        if (fret <= 0) return null;
        const rel = windowBase === 0 ? fret : fret - windowBase + 1;
        if (rel < 1 || rel > fretCount) return null;
        return (
          <circle
            key={`d${col}`}
            cx={xOf(col)}
            cy={yOfFret(rel) - ROW / 2}
            r={4}
            fill="#22d3ee"
          />
        );
      })}
      {/* base-fret label for movable shapes */}
      {windowBase > 0 && (
        <text x={0} y={yOfFret(1) - 3} fontSize={8} fill="#71717a" className="font-mono">
          {windowBase}
        </text>
      )}
      {/* chord name */}
      <text
        x={width / 2}
        y={height - 3}
        fontSize={10}
        fill="#22d3ee"
        textAnchor="middle"
        className="font-mono font-bold"
      >
        {data.chord}
      </text>
    </svg>
  );
}
