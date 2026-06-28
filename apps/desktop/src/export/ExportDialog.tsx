/**
 * Export dialog — four buttons for the four target formats.
 *
 * Lives behind a ⌘E shortcut and a menu entry. Each button starts a save
 * flow through Tauri's dialog plugin, falling back to a browser download
 * in non-Tauri contexts.
 */

import { Download, FileMusic, FileSpreadsheet, FileText, Volume2 } from "lucide-react";
import { useState } from "react";

import { useScoreEngine } from "../lib/ScoreEngine";

import {
  exportMidi,
  exportMusicXml,
  exportPdf,
  exportWav,
  type ExportArtifact,
} from "./exporters";
import { saveArtifact } from "./saveBlob";

type Target = "musicxml" | "midi" | "wav" | "pdf";

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
}

const TARGETS: Array<{
  id: Target;
  label: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    id: "musicxml",
    label: "MusicXML 4.0",
    description: "Canonical interchange — opens in Finale, Sibelius, Dorico, MuseScore.",
    icon: <FileSpreadsheet size={16} />,
  },
  {
    id: "midi",
    label: "MIDI 1.0",
    description: "Standard MIDI file for DAWs and notation apps.",
    icon: <FileMusic size={16} />,
  },
  {
    id: "wav",
    label: "WAV audio",
    description: "Offline render of the score using the in-app synth.",
    icon: <Volume2 size={16} />,
  },
  {
    id: "pdf",
    label: "PDF (Verovio)",
    description: "Publication-quality engraving via the Verovio WASM toolkit.",
    icon: <FileText size={16} />,
  },
];

export function ExportDialog({ open, onClose }: ExportDialogProps): React.ReactElement | null {
  const engine = useScoreEngine();
  const [busy, setBusy] = useState<Target | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedPath, setSavedPath] = useState<string | null>(null);

  if (!open) return null;

  const project = engine.project;
  const score = engine.score;
  const ready = Boolean(project && score);

  const run = async (target: Target) => {
    if (!score || !project) return;
    setBusy(target);
    setError(null);
    setSavedPath(null);
    try {
      let art: ExportArtifact;
      const title = project.meta.title || "stockhausen-project";
      switch (target) {
        case "musicxml":
          art = await exportMusicXml(score.musicxml, title);
          break;
        case "midi":
          art = await exportMidi(score.musicxml, title);
          break;
        case "wav":
          art = await exportWav(() => engine.renderWav(), score.musicxml, title);
          break;
        case "pdf":
          art = await exportPdf(score.musicxml, title);
          break;
      }
      const path = await saveArtifact(art);
      if (path) setSavedPath(path);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[480px] rounded-lg border border-neutral-800 bg-neutral-950 p-6 text-zinc-100 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mb-4 flex items-center gap-2">
          <Download size={16} className="text-neon-cyan" />
          <h2 className="text-base font-medium">Export</h2>
        </header>

        {!ready && (
          <p className="rounded border border-neutral-800 bg-neutral-900 p-3 text-sm text-zinc-400">
            Open a project and load a score to enable export.
          </p>
        )}

        {ready && (
          <ul className="space-y-2">
            {TARGETS.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => run(t.id)}
                  className="group flex w-full items-center gap-3 rounded border border-neutral-800 bg-neutral-900/70 px-3 py-2 text-left transition hover:border-neon-cyan/40 hover:bg-neutral-900 disabled:opacity-40"
                >
                  <span className="text-neon-cyan">{t.icon}</span>
                  <div className="flex-1">
                    <div className="text-sm font-medium">{t.label}</div>
                    <div className="text-[11px] text-zinc-500">{t.description}</div>
                  </div>
                  <span className="text-[11px] text-zinc-500">
                    {busy === t.id ? "Rendering…" : "Save"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {savedPath && (
          <p className="mt-4 rounded border border-neon-emerald/40 bg-neon-emerald/10 p-2 text-xs text-neon-emerald">
            Saved to <span className="num break-all">{savedPath}</span>
          </p>
        )}

        {error && (
          <p className="mt-4 rounded border border-danger/40 bg-danger/10 p-2 text-xs text-danger">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-neutral-800 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
