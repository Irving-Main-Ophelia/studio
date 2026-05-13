import { FileMusic, FolderOpen, Music2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";

import { useScoreEngine } from "../lib/ScoreEngine";

interface OpenedScore {
  filename: string;
  musicxml: string;
}

const FIXTURES: Array<{ file: string; label: string; composer: string }> = [
  {
    file: "bach-chorale-bwv66-6.musicxml",
    label: "Christ unser Herr (BWV 66.6)",
    composer: "J. S. Bach",
  },
  {
    file: "bach-chorale-bwv1-6.musicxml",
    label: "Wie schön leuchtet (BWV 1.6)",
    composer: "J. S. Bach",
  },
  {
    file: "andante-c-sharp-minor.musicxml",
    label: "Andante in C♯ minor",
    composer: "demo fixture",
  },
];

export function ProjectTree() {
  const engine = useScoreEngine();

  const openFromDisk = async () => {
    try {
      const result = await invoke<OpenedScore | null>("open_score_file");
      if (result) {
        await engine.loadFromXml(result.filename, result.musicxml);
      }
    } catch (err) {
      console.error("open_score_file failed:", err);
    }
  };

  return (
    <aside className="w-60 shrink-0 overflow-y-auto border-r border-obsidian-700 bg-obsidian-800/40 px-3 py-4 text-xs">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-medium uppercase tracking-widest text-zinc-500">Project</h2>
        <button
          className="rounded p-1 text-zinc-500 transition-colors hover:bg-obsidian-700 hover:text-zinc-200"
          aria-label="Open MusicXML file"
          title="Open MusicXML (⌘O)"
          onClick={openFromDisk}
        >
          <FolderOpen size={12} />
        </button>
      </div>

      {/* Current score */}
      <div className="mb-5 rounded-md border border-obsidian-700/60 bg-obsidian-900/40 p-3">
        {engine.score ? (
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-zinc-200">
              <FileMusic size={12} className="text-neon-cyan" />
              <span className="truncate text-[11px]">{engine.score.filename}</span>
            </div>
            <p className="num text-[10px] text-zinc-500">
              {engine.score.extracted.notes.length} notes ·{" "}
              {engine.score.extracted.tempo_bpm.toFixed(0)} BPM ·{" "}
              {formatTime(engine.score.extracted.duration_sec)}
            </p>
            {engine.score.keyEstimate && (
              <p className="text-[10px] text-zinc-500">
                est. key:{" "}
                <span className="text-neon-cyan">
                  {engine.score.keyEstimate.key} {engine.score.keyEstimate.mode}
                </span>{" "}
                <span className="text-zinc-600">
                  ({Math.round(engine.score.keyEstimate.confidence * 100)}%)
                </span>
              </p>
            )}
          </div>
        ) : (
          <p className="text-center text-[11px] text-zinc-500">
            No score loaded.
            <br />
            <span className="text-zinc-600">Pick a fixture below or open a file.</span>
          </p>
        )}
      </div>

      {/* Fixtures */}
      <h3 className="mb-2 num text-[10px] uppercase tracking-widest text-zinc-500">
        Fixtures
      </h3>
      <ul className="space-y-1">
        {FIXTURES.map((f) => (
          <li key={f.file}>
            <button
              onClick={() => engine.loadFromUrl(`/fixtures/${f.file}`, f.file)}
              className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left transition-colors hover:bg-obsidian-700"
            >
              <Music2 size={11} className="mt-0.5 shrink-0 text-neon-violet/80" />
              <div className="min-w-0">
                <div className="truncate text-[11px] text-zinc-200">{f.label}</div>
                <div className="truncate text-[9px] text-zinc-500">{f.composer}</div>
              </div>
            </button>
          </li>
        ))}
      </ul>

      {/* Errors */}
      {engine.loadError && (
        <div className="mt-4 rounded border border-danger/40 bg-danger/10 p-2 text-[10px] text-danger">
          {engine.loadError}
        </div>
      )}

      <p className="mt-6 text-[9px] text-zinc-600">
        Phase 0: fixtures + file open.<br />
        Multi-project tree comes in Phase 1.
      </p>
    </aside>
  );
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
