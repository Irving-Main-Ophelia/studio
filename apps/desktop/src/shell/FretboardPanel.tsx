/**
 * Fretboard panel (Track A, A4 + A5 + A6).
 *
 * Shows the interactive fretboard and lets the maintainer ask for a chord voicing
 * or a scale shape on demand (the engines are algorithmic — A5/A6). The board
 * follows the current note selection (its position is dotted in emerald) and uses
 * the selected part's tuning/capo.
 */

import { useEffect, useMemo, useState } from "react";

import {
  api,
  type ChordVoicing,
  type ChordVoicingsResult,
  type ScaleShapeResult,
} from "../lib/api";
import { assignFret, pitchToMidi } from "../lib/fret";
import { useScoreEngine } from "../lib/ScoreEngine";
import { Fretboard, type FretMark } from "../notation/Fretboard";
import { STANDARD_GUITAR_TUNING } from "../project/types";

const SCALES = [
  "major",
  "natural_minor",
  "harmonic_minor",
  "melodic_minor",
  "dorian",
  "phrygian",
  "lydian",
  "mixolydian",
  "locrian",
  "major_pentatonic",
  "minor_pentatonic",
  "blues",
];
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

type Mode = "chord" | "scale";

export function FretboardPanel(): React.ReactElement {
  const engine = useScoreEngine();
  const selection = engine.selection.note;

  // Tuning/capo from the selected part (or part 0), defaulting to standard.
  const { tuning, capo } = useMemo(() => {
    const partIndex = selection?.part_index ?? 0;
    const guitar = engine.project?.meta.instrumentation[partIndex]?.guitar ?? null;
    return {
      tuning: guitar?.tuning ?? STANDARD_GUITAR_TUNING,
      capo: guitar?.capo ?? 0,
    };
  }, [engine.project, selection?.part_index]);

  const [mode, setMode] = useState<Mode>("chord");
  const [chordText, setChordText] = useState("Am");
  const [tonic, setTonic] = useState("A");
  const [scale, setScale] = useState("minor_pentatonic");
  const [minFret, setMinFret] = useState(0);

  const [chordResult, setChordResult] = useState<ChordVoicingsResult | null>(null);
  const [voicingIdx, setVoicingIdx] = useState(0);
  const [scaleResult, setScaleResult] = useState<ScaleShapeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tuningKey = tuning.join(",");

  const runChord = async () => {
    setError(null);
    try {
      const res = await api.chordVoicings({ chord: chordText, tuning, capo, max_voicings: 8 });
      setChordResult(res);
      setVoicingIdx(0);
    } catch (e) {
      setChordResult(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  // Scale re-queries whenever its inputs (or the tuning/capo) change.
  useEffect(() => {
    if (mode !== "scale") return;
    let cancelled = false;
    api
      .scaleShape({ tonic, scale, tuning, capo, min_fret: minFret, span: 4 })
      .then((res) => {
        if (!cancelled) {
          setScaleResult(res);
          setError(null);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setScaleResult(null);
          setError(e instanceof Error ? e.message : String(e));
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, tonic, scale, minFret, capo, tuningKey]);

  const voicing: ChordVoicing | null = chordResult?.voicings[voicingIdx] ?? null;

  // Build the marks + the fret window for the active mode.
  const { marks, fromFret, fretCount } = useMemo(() => {
    const m: FretMark[] = [];
    let from = 0;
    let count = 5;

    if (mode === "chord" && voicing) {
      for (const p of voicing.positions) {
        m.push({
          string: p.string,
          fret: p.fret,
          label: p.fret === 0 ? "○" : String(p.fret),
          kind: p.is_root ? "root" : "chord",
        });
      }
      from = voicing.base_fret > 4 ? voicing.base_fret - 1 : 0;
      count = Math.max(5, voicing.fret_span + 2);
    } else if (mode === "scale" && scaleResult) {
      for (const p of scaleResult.positions) {
        m.push({
          string: p.string,
          fret: p.fret,
          label: String(p.degree),
          kind: p.is_root ? "root" : "scale",
        });
      }
      from = scaleResult.min_fret > 0 ? scaleResult.min_fret - 1 : 0;
      count = Math.max(5, scaleResult.max_fret - scaleResult.min_fret + 2);
    }

    // Overlay the currently-sounding notes of the active part (rose) — playhead sync.
    const partIndex = selection?.part_index ?? 0;
    if (engine.positionSec > 0 && engine.score?.extracted) {
      const pos = engine.positionSec;
      for (const ev of engine.score.extracted.notes) {
        if (ev.part_index !== partIndex) continue;
        if (pos < ev.start_sec || pos >= ev.start_sec + ev.duration_sec) continue;
        const spot = assignFret(ev.midi, tuning, capo);
        if (spot) m.push({ string: spot.string, fret: spot.fret, kind: "playhead" });
      }
    }

    // Overlay the current selection (emerald) so the board follows the score.
    if (selection?.pitch) {
      const midi = selection.midi ?? pitchToMidi(selection.pitch.split("-")[0] ?? "");
      if (midi != null) {
        const spot = assignFret(midi, tuning, capo);
        if (spot) {
          m.push({ string: spot.string, fret: spot.fret, kind: "selection", label: "●" });
        }
      }
    }
    return { marks: m, fromFret: from, fretCount: count };
  }, [mode, voicing, scaleResult, selection, tuning, capo, engine.positionSec, engine.score]);

  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto p-3 text-xs text-zinc-300">
      <div className="flex items-center gap-2">
        <ModeButton active={mode === "chord"} onClick={() => setMode("chord")} label="Chord" />
        <ModeButton active={mode === "scale"} onClick={() => setMode("scale")} label="Scale" />
        <span className="ml-auto text-[10px] text-zinc-500">
          {tuning.join(" ")}
          {capo > 0 ? ` · capo ${capo}` : ""}
        </span>
      </div>

      {mode === "chord" ? (
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            void runChord();
          }}
        >
          <input
            aria-label="Chord symbol"
            value={chordText}
            onChange={(e) => setChordText(e.target.value)}
            placeholder="Cmaj7"
            className="w-24 rounded border border-obsidian-600 bg-obsidian-900 px-2 py-1 font-mono"
          />
          <button
            type="submit"
            className="rounded bg-neon-cyan/20 px-2 py-1 font-medium text-neon-cyan hover:bg-neon-cyan/30"
          >
            Voicings
          </button>
          {chordResult && (
            <span className="text-[10px] text-zinc-500">{chordResult.count} found</span>
          )}
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          <select
            aria-label="Tonic"
            value={tonic}
            onChange={(e) => setTonic(e.target.value)}
            className="rounded border border-obsidian-600 bg-obsidian-900 px-1 py-1"
          >
            {NOTE_NAMES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <select
            aria-label="Scale"
            value={scale}
            onChange={(e) => setScale(e.target.value)}
            className="rounded border border-obsidian-600 bg-obsidian-900 px-1 py-1"
          >
            {SCALES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1">
            <span className="text-zinc-500">fret</span>
            <input
              type="number"
              min={0}
              max={20}
              value={minFret}
              onChange={(e) => setMinFret(Math.max(0, Math.min(20, Number(e.target.value) || 0)))}
              className="num w-12 rounded border border-obsidian-600 bg-obsidian-900 px-1 py-1"
            />
          </label>
        </div>
      )}

      {error && <p className="text-[10px] text-danger">{error}</p>}

      <div className="rounded border border-obsidian-700 bg-obsidian-900/60 p-2">
        <Fretboard
          tuning={tuning}
          capo={capo}
          marks={marks}
          fromFret={fromFret}
          fretCount={fretCount}
        />
      </div>

      {mode === "chord" && chordResult && chordResult.voicings.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {chordResult.voicings.map((v, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setVoicingIdx(i)}
              className={[
                "rounded px-2 py-0.5 text-[10px]",
                i === voicingIdx
                  ? "bg-neon-cyan/25 text-neon-cyan"
                  : "bg-obsidian-800 text-zinc-400 hover:bg-obsidian-700",
              ].join(" ")}
            >
              {v.base_fret === 0 ? "open" : `fr.${v.base_fret}`} · {v.difficulty}
            </button>
          ))}
        </div>
      )}

      <p className="mt-auto text-[10px] text-zinc-600">
        {selection?.pitch
          ? `Selection: ${selection.pitch} (●) follows the score.`
          : "Select a note in the score to place it here."}
      </p>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded px-2 py-0.5 font-medium",
        active ? "bg-neon-violet/25 text-neon-violet" : "bg-obsidian-800 text-zinc-400",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
