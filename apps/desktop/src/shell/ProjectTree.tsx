import {
  FileMusic,
  FolderOpen,
  Music2,
  Plus,
  Save,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";

import { useScoreEngine } from "../lib/ScoreEngine";
import { projectPersistence } from "../project/persistence";

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

export function ProjectTree({ onNewProject }: { onNewProject: () => void }) {
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

  const closeProject = async () => {
    await engine.closeProject();
  };

  const forgetRecent = async (path: string) => {
    try {
      await projectPersistence.recentForget(path);
      await engine.refreshRecents();
    } catch (err) {
      console.error("recent_forget failed:", err);
    }
  };

  return (
    <aside className="w-60 shrink-0 overflow-y-auto border-r border-obsidian-700 bg-obsidian-800/40 px-3 py-4 text-xs">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-medium uppercase tracking-widest text-zinc-500">Project</h2>
        <div className="flex items-center gap-1">
          <IconButton
            label="New project (⌘N)"
            onClick={onNewProject}
            icon={<Plus size={12} />}
          />
          <IconButton
            label="Open project folder (⌘O)"
            onClick={() => void engine.openProjectViaDialog()}
            icon={<FolderOpen size={12} />}
          />
        </div>
      </div>

      {/* Current project */}
      <div className="mb-5 rounded-md border border-obsidian-700/60 bg-obsidian-900/40 p-3">
        {engine.project ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-zinc-200">
              <FileMusic size={12} className="text-neon-cyan" />
              <span className="truncate text-[11px] font-medium">
                {engine.project.meta.title}
              </span>
            </div>
            <p className="num text-[10px] text-zinc-500">
              {engine.project.meta.key_signature} · {engine.project.meta.time_signature}
              {" · "}
              {engine.project.meta.tempo_bpm.toFixed(0)} bpm
            </p>
            <p className="num text-[10px] text-zinc-600">
              {engine.project.operations.length} ops ·{" "}
              {engine.lastSavedAt ? `saved ${formatRelative(engine.lastSavedAt)}` : "never saved"}
              {engine.saving && <span className="text-neon-cyan"> · saving…</span>}
              {engine.isDirty && !engine.saving && <span className="text-neon-amber"> · unsaved</span>}
            </p>
            <div className="flex items-center gap-1 pt-1">
              <ActionButton
                label="Save"
                shortcut="⌘S"
                onClick={() => void engine.saveProject()}
                icon={<Save size={11} />}
              />
              <ActionButton
                label="Undo"
                shortcut="⌘Z"
                onClick={() => void engine.undo()}
                disabled={!engine.canUndo}
                icon={<Undo2 size={11} />}
              />
              <ActionButton
                label="Close"
                onClick={() => void closeProject()}
                icon={<X size={11} />}
              />
            </div>
          </div>
        ) : engine.score ? (
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-zinc-200">
              <FileMusic size={12} className="text-neon-violet" />
              <span className="truncate text-[11px]">{engine.score.filename}</span>
            </div>
            <p className="num text-[10px] text-zinc-500">
              demo preview · {engine.score.extracted.notes.length} notes ·{" "}
              {engine.score.extracted.tempo_bpm.toFixed(0)} bpm
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
            <p className="mt-1 text-[10px] text-zinc-600">
              read-only — press <kbd className="num">⌘N</kbd> to start a project
            </p>
          </div>
        ) : (
          <p className="text-center text-[11px] text-zinc-500">
            No project open.
            <br />
            <span className="text-zinc-600">
              Press <kbd className="num">⌘N</kbd> to start one.
            </span>
          </p>
        )}
      </div>

      {/* Recent projects */}
      {engine.recents.length > 0 && (
        <>
          <h3 className="mb-2 num text-[10px] uppercase tracking-widest text-zinc-500">
            Recent
          </h3>
          <ul className="mb-5 space-y-1">
            {engine.recents.map((r) => (
              <li key={r.path} className="flex items-center gap-1">
                <button
                  onClick={() => void engine.openProject(r.path)}
                  className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left transition-colors hover:bg-obsidian-700"
                >
                  <FileMusic
                    size={11}
                    className="mt-0.5 shrink-0 text-neon-cyan/80"
                  />
                  <div className="min-w-0">
                    <div className="truncate text-[11px] text-zinc-200">{r.title}</div>
                    <div className="truncate text-[9px] text-zinc-600">
                      {formatRelative(r.last_opened)}
                    </div>
                  </div>
                </button>
                <button
                  aria-label={`Forget ${r.title}`}
                  onClick={() => void forgetRecent(r.path)}
                  className="shrink-0 rounded p-1 text-zinc-600 transition-colors hover:bg-obsidian-700 hover:text-zinc-300"
                >
                  <Trash2 size={10} />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Fixtures */}
      <h3 className="mb-2 num text-[10px] uppercase tracking-widest text-zinc-500">
        Demos
      </h3>
      <ul className="space-y-1">
        {FIXTURES.map((f) => (
          <li key={f.file}>
            <button
              onClick={() => void engine.loadFromUrl(`/fixtures/${f.file}`, f.file)}
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

      <button
        onClick={() => void openFromDisk()}
        className="mt-3 flex w-full items-center gap-2 rounded px-2 py-1.5 text-[10px] text-zinc-500 transition-colors hover:bg-obsidian-700 hover:text-zinc-200"
      >
        <FolderOpen size={11} className="text-neon-violet/60" />
        Open MusicXML file (preview)
      </button>

      {engine.loadError && (
        <div className="mt-4 rounded border border-danger/40 bg-danger/10 p-2 text-[10px] text-danger">
          {engine.loadError}
        </div>
      )}
      {engine.saveError && (
        <div className="mt-4 rounded border border-danger/40 bg-danger/10 p-2 text-[10px] text-danger">
          save error: {engine.saveError}
        </div>
      )}
    </aside>
  );
}

function IconButton({
  label,
  onClick,
  icon,
}: {
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded p-1 text-zinc-400 transition-colors hover:bg-obsidian-700 hover:text-zinc-200"
    >
      {icon}
    </button>
  );
}

function ActionButton({
  label,
  shortcut,
  onClick,
  icon,
  disabled,
}: {
  label: string;
  shortcut?: string;
  onClick: () => void;
  icon: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={shortcut ? `${label} (${shortcut})` : label}
      className="flex items-center gap-1 rounded px-2 py-1 text-[10px] text-zinc-400 transition-colors hover:bg-obsidian-700 hover:text-zinc-200 disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function formatRelative(iso: string): string {
  try {
    const date = new Date(iso);
    const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
    if (seconds < 60) return "moments ago";
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    if (days < 30) return `${days}d ago`;
    return date.toLocaleDateString();
  } catch {
    return iso;
  }
}
