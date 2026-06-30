/**
 * Interactive fretboard viewer (Track A, A4 — React + SVG).
 *
 * Renders a fretted instrument's neck for the given tuning/capo and highlights a
 * set of positions (a chord voicing, a scale box, or the current selection). Pure
 * presentational — the panel (`FretboardPanel`) supplies positions and sync.
 */

export interface FretMark {
  string: number; // 1-based, 1 = highest (drawn at top)
  fret: number; // 0 = open, relative to the capo
  label?: string;
  /** "root" | "chord" | "scale" | "selection" — drives colour. */
  kind?: string;
}

interface FretboardProps {
  tuning: string[]; // string 1 (highest) first
  capo?: number;
  marks: FretMark[];
  /** Lowest fret drawn (after the open column). Default 0. */
  fromFret?: number;
  /** Number of frets drawn. Default 5. */
  fretCount?: number;
}

const KIND_FILL: Record<string, string> = {
  root: "#f59e0b", // neon-amber
  chord: "#22d3ee", // neon-cyan
  scale: "#a78bfa", // neon-violet
  selection: "#34d399", // emerald
  playhead: "#f43f5e", // rose — currently-sounding note
};

const OPEN_X = 26;
const LEFT = 54;
const TOP = 18;
const ROW = 22;
const COL = 40;
const DOT = 8;

export function Fretboard({
  tuning,
  capo = 0,
  marks,
  fromFret = 0,
  fretCount = 5,
}: FretboardProps) {
  const strings = tuning.length;
  const firstFret = Math.max(fromFret, capo > 0 ? capo : 0);
  const width = LEFT + COL * fretCount + 24;
  const height = TOP + ROW * (strings - 1) + 36;

  const yOf = (s: number) => TOP + (s - 1) * ROW;
  // Fret f (absolute) → x of the centre of its cell. Frets are firstFret+1..firstFret+fretCount.
  const xOfFret = (f: number) => LEFT + (f - firstFret - 0.5) * COL;

  const inWindow = (f: number) => f > firstFret && f <= firstFret + fretCount;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      role="img"
      aria-label="Fretboard"
    >
      {/* nut / capo bar */}
      <rect
        x={LEFT - 3}
        y={TOP - 4}
        width={capo > 0 || firstFret > 0 ? 3 : 5}
        height={ROW * (strings - 1) + 8}
        fill={capo > 0 ? "#f59e0b" : "#a1a1aa"}
      />

      {/* strings */}
      {tuning.map((open, i) => (
        <g key={`s${i}`}>
          <line
            x1={LEFT}
            y1={yOf(i + 1)}
            x2={LEFT + COL * fretCount}
            y2={yOf(i + 1)}
            stroke="#52525b"
            strokeWidth={0.5 + i * 0.18}
          />
          <text x={6} y={yOf(i + 1) + 3} fontSize={9} fill="#71717a" className="font-mono">
            {open}
          </text>
        </g>
      ))}

      {/* fret wires + numbers */}
      {Array.from({ length: fretCount + 1 }, (_, k) => {
        const x = LEFT + COL * k;
        const fretNum = firstFret + k;
        return (
          <g key={`f${k}`}>
            <line x1={x} y1={TOP - 4} x2={x} y2={yOf(strings) + 4} stroke="#3f3f46" strokeWidth={1} />
            {k > 0 && (
              <text
                x={x - COL / 2}
                y={yOf(strings) + 20}
                fontSize={9}
                fill="#71717a"
                textAnchor="middle"
                className="font-mono"
              >
                {fretNum}
              </text>
            )}
          </g>
        );
      })}

      {/* inlay dots (3,5,7,9,12…) */}
      {[3, 5, 7, 9, 12, 15, 17, 19, 21, 24]
        .filter((f) => inWindow(f))
        .map((f) => (
          <circle
            key={`inlay${f}`}
            cx={xOfFret(f)}
            cy={yOf(strings) + 8}
            r={2}
            fill={f % 12 === 0 ? "#52525b" : "#3f3f46"}
          />
        ))}

      {/* marks */}
      {marks.map((m, idx) => {
        const open = m.fret === 0;
        const cx = open ? OPEN_X : xOfFret(m.fret);
        if (!open && !inWindow(m.fret)) return null;
        const fill = KIND_FILL[m.kind ?? "chord"] ?? KIND_FILL.chord;
        return (
          <g key={`m${idx}`}>
            <circle
              cx={cx}
              cy={yOf(m.string)}
              r={DOT}
              fill={open ? "none" : fill}
              stroke={fill}
              strokeWidth={open ? 2 : 0}
            />
            {m.label && (
              <text
                x={cx}
                y={yOf(m.string) + 3}
                fontSize={8}
                fill={open ? fill : "#0a0a0a"}
                textAnchor="middle"
                className="font-mono font-bold"
              >
                {m.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
