/**
 * Audio + MIDI Import Dialog.
 *
 * Two import paths:
 *   1. Audio (MP3/WAV/FLAC) → Basic Pitch polyphonic transcription (~70% F1 on guitar)
 *      Runs in a Python 3.12 venv via subprocess. MIDI recommended for perfect accuracy.
 *   2. MIDI file → music21 conversion (100% accurate, recommended for Chan Cil)
 *
 * Accessible via ⌘K → "Import Audio" or TopBar menu.
 */

import { AlertTriangle, CheckCircle2, FileMusic, Music, Music2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { BACKEND_URL, api, type KeyEstimate } from "../lib/api";
import { useScoreEngine } from "../lib/ScoreEngine";
import { loadEditorPreferences } from "./EditorPreferences";
import { KeySuggestionDialog } from "./KeySuggestionDialog";
import { buildScoreInitOp } from "../project/OperationLog";
import type { NewProjectSpec } from "../project/types";

interface AudioCapabilities {
  stem_separation: boolean;
  transcription: boolean;
  transcription_polyphonic?: boolean;
  transcription_monophonic?: boolean;
  midi_import?: boolean;
  transcription_engine: string | null;
  requires_modal: boolean;
  note: string;
}

interface AudioImportDialogProps {
  open: boolean;
  onClose: () => void;
}

const AUDIO_ACCEPT = ".mp3,.wav,.flac,.aiff,audio/mpeg,audio/wav,audio/flac,audio/aiff";
const MIDI_ACCEPT = ".mid,.midi,audio/midi,audio/x-midi";

type ImportMode = "audio" | "midi";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function AudioImportDialog({
  open,
  onClose,
}: AudioImportDialogProps): React.ReactElement | null {
  const engine = useScoreEngine();
  const audioInputRef = useRef<HTMLInputElement>(null);
  const midiInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<ImportMode>("midi");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [capabilities, setCapabilities] = useState<AudioCapabilities | null>(null);
  const [capLoading, setCapLoading] = useState(false);
  const [capError, setCapError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importDone, setImportDone] = useState(false);
  const [pendingKey, setPendingKey] = useState<KeyEstimate | null>(null);
  const [pendingMusicXml, setPendingMusicXml] = useState<string | null>(null);
  const [pendingTitle, setPendingTitle] = useState<string>("");
  const [keyBusy, setKeyBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelectedFile(null);
    setImportError(null);
    setImportDone(false);
    setCapabilities(null);
    setCapError(null);
    setCapLoading(true);
    fetch(`${BACKEND_URL}/audio/capabilities`)
      .then(async (res) => {
        if (!res.ok) throw new Error(res.statusText);
        return (await res.json()) as AudioCapabilities;
      })
      .then(setCapabilities)
      .catch((err: unknown) => setCapError(String(err)))
      .finally(() => setCapLoading(false));
  }, [open]);

  if (!open) return null;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSelectedFile(e.target.files?.[0] ?? null);
    setImportError(null);
    setImportDone(false);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0] ?? null;
    if (file) {
      setSelectedFile(file);
      setImportError(null);
      setImportDone(false);
      if (file.name.match(/\.(mid|midi)$/i)) setMode("midi");
      else setMode("audio");
    }
  }

  async function finalizeImport(
    title: string,
    musicxml: string,
    keyEst: KeyEstimate | null,
    applyKey = false,
  ) {
    let finalXml = musicxml;
    if (applyKey && keyEst) {
      const applied = await api.setKeySignature({
        musicxml,
        tonic: keyEst.key,
        mode: keyEst.mode || "major",
      });
      finalXml = applied.musicxml;
    }

    if (engine.project) {
      await engine.replaceScore(title, finalXml);
    } else {
      let tempo_bpm = 120;
      let key_signature = "C major";
      const time_signature = _extractTimeSig(finalXml);
      try {
        const extracted = await api.extractNotes(finalXml);
        tempo_bpm = extracted.tempo_bpm || 120;
        if (keyEst?.key) key_signature = `${keyEst.key} ${keyEst.mode ?? ""}`.trim();
        else {
          const k = await api.analyzeKey(finalXml).catch(() => null);
          if (k?.key) key_signature = `${k.key} ${k.mode ?? ""}`.trim();
        }
      } catch {
        // non-fatal
      }
      const initialOp = buildScoreInitOp({
        musicxml: finalXml,
        title,
        composer: "",
        tempo_bpm,
        time_signature,
        key_signature,
      });
      const spec: NewProjectSpec = {
        title,
        composer: "",
        tempo_bpm,
        time_signature,
        key_signature,
        instrumentation: [{ id: "guitar", instrument: "Classical Guitar", channel: 0 }],
        initial_musicxml: finalXml,
        initial_operation: initialOp,
      };
      await engine.newProject(spec);
    }
    setImportDone(true);
    setPendingKey(null);
    setPendingMusicXml(null);
    setTimeout(onClose, 1200);
  }

  async function handleImport() {
    if (!selectedFile) return;
    setImporting(true);
    setImportError(null);
    setImportDone(false);

    try {
      const b64 = await fileToBase64(selectedFile);
      let musicxml: string;

      if (mode === "midi") {
        const res = await fetch(`${BACKEND_URL}/audio/import-midi`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: selectedFile.name,
            midi_base64: b64,
            part_name: "Classical Guitar",
          }),
        });
        if (!res.ok) {
          const err = (await res.json()) as { detail?: string };
          throw new Error(err.detail ?? res.statusText);
        }
        const data = (await res.json()) as { musicxml: string };
        musicxml = data.musicxml;
      } else {
        const res = await fetch(`${BACKEND_URL}/audio/import`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: selectedFile.name, audio_base64: b64, mode: "auto" }),
        });
        if (!res.ok) {
          const err = (await res.json()) as { detail?: string };
          throw new Error(err.detail ?? res.statusText);
        }
        const data = (await res.json()) as { musicxml: string };
        musicxml = data.musicxml;
      }

      const title = selectedFile.name.replace(/\.[^.]+$/, "");

      let keyEst: KeyEstimate | null = null;
      try {
        keyEst = await api.analyzeKey(musicxml);
      } catch {
        keyEst = null;
      }

      const prefs = loadEditorPreferences();
      if (prefs.keySuggestionOnImport && keyEst && keyEst.confidence >= 0.5) {
        setPendingMusicXml(musicxml);
        setPendingTitle(title);
        setPendingKey(keyEst);
        return;
      }

      await finalizeImport(title, musicxml, keyEst);
    } catch (err: unknown) {
      setImportError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  }

  async function handleApplyKey() {
    if (!pendingMusicXml || !pendingKey) return;
    setKeyBusy(true);
    try {
      await finalizeImport(pendingTitle, pendingMusicXml, pendingKey, true);
    } catch (err: unknown) {
      setImportError(err instanceof Error ? err.message : String(err));
    } finally {
      setKeyBusy(false);
    }
  }

  async function handleSkipKey() {
    if (!pendingMusicXml) return;
    setKeyBusy(true);
    try {
      await finalizeImport(pendingTitle, pendingMusicXml, pendingKey, false);
    } catch (err: unknown) {
      setImportError(err instanceof Error ? err.message : String(err));
    } finally {
      setKeyBusy(false);
    }
  }

  function _extractTimeSig(xml: string): string {
    const beats = xml.match(/<beats>(\d+)<\/beats>/)?.[1];
    const beatType = xml.match(/<beat-type>(\d+)<\/beat-type>/)?.[1];
    return beats && beatType ? `${beats}/${beatType}` : "4/4";
  }

  const midiReady = capabilities?.midi_import !== false;
  const audioReady = capabilities?.transcription === true;
  const canImport =
    !!selectedFile && !importing && (mode === "midi" ? midiReady : audioReady);

  const inputRef = mode === "midi" ? midiInputRef : audioInputRef;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[520px] max-w-[90vw] rounded-xl border border-obsidian-600 bg-obsidian-900 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-obsidian-700 px-5 py-4">
          <Music size={16} className="text-neon-violet" />
          <h2 className="text-sm font-semibold text-zinc-100">Import Audio / MIDI</h2>
        </div>

        <div className="space-y-4 p-5">
          {/* Mode toggle */}
          <div className="flex rounded-lg border border-obsidian-700 p-1">
            {(["midi", "audio"] as ImportMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setSelectedFile(null); }}
                className={[
                  "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  mode === m
                    ? "bg-neon-violet/20 text-neon-violet"
                    : "text-zinc-500 hover:text-zinc-300",
                ].join(" ")}
              >
                {m === "audio" ? <Music2 size={12} /> : <FileMusic size={12} />}
                {m === "audio" ? "Audio (MP3 · WAV)" : "MIDI file"}
              </button>
            ))}
          </div>

          {/* Mode hint */}
          {mode === "midi" && (
            <div className="rounded-lg border border-neon-cyan/20 bg-neon-cyan/5 px-3 py-2 text-xs text-zinc-300">
              <p className="font-medium text-neon-cyan">Best accuracy</p>
              <p className="mt-0.5 text-zinc-400">
                Export MIDI from GarageBand, Logic, or MuseScore — or record from a MIDI keyboard.
                Captures melody + bass + chords with 100% accuracy.
              </p>
            </div>
          )}
          {mode === "audio" && (
            <div className="rounded-lg border border-neon-cyan/20 bg-neon-cyan/5 px-3 py-2 text-xs text-zinc-300">
              <p className="font-medium text-neon-cyan">Basic Pitch — polyphonic transcription</p>
              <p className="mt-1 text-zinc-400">
                Detects <strong className="text-zinc-300">melody + chords + bass simultaneously</strong> (~70% F1 on guitar).
                Useful starting point — verify rhythm and articulations manually.
              </p>
              <p className="mt-1 text-zinc-500">
                For higher accuracy, use the <strong className="text-zinc-400">MIDI file</strong> tab with a recording from GarageBand, Logic, or MuseScore.
              </p>
            </div>
          )}

          {/* Drop zone */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            className={[
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 transition",
              dragging
                ? "border-neon-violet bg-neon-violet/10"
                : "border-obsidian-600 bg-obsidian-800 hover:border-neon-violet/50",
            ].join(" ")}
          >
            {mode === "midi"
              ? <FileMusic size={24} className="text-zinc-500" />
              : <Music2 size={24} className="text-zinc-500" />}
            {selectedFile ? (
              <span className="text-sm font-medium text-zinc-200">{selectedFile.name}</span>
            ) : (
              <span className="text-sm text-zinc-500">
                Drop here or click to browse
              </span>
            )}
            <span className="text-[10px] text-zinc-600">
              {mode === "midi" ? ".mid · .midi" : "MP3 · WAV · FLAC · AIFF"}
            </span>
          </div>
          <input ref={audioInputRef} type="file" accept={AUDIO_ACCEPT} className="sr-only" onChange={handleFileChange} />
          <input ref={midiInputRef} type="file" accept={MIDI_ACCEPT} className="sr-only" onChange={handleFileChange} />

          {/* Status messages */}
          {capLoading && (
            <div className="rounded-lg bg-obsidian-800 px-3 py-2 text-xs text-zinc-500">
              Checking backend…
            </div>
          )}
          {capError && (
            <div className="rounded-lg border border-red-800/50 bg-red-900/20 px-3 py-2 text-xs text-red-400">
              Backend unavailable: {capError}
            </div>
          )}
          {capabilities && mode === "audio" && !audioReady && (
            <div className="flex items-start gap-2 rounded-lg border border-yellow-800/50 bg-yellow-900/20 px-3 py-2">
              <AlertTriangle size={13} className="mt-0.5 shrink-0 text-yellow-400" />
              <div className="text-xs text-yellow-300">
                <p className="font-medium">Transcription venv not configured</p>
                <p className="mt-0.5 text-yellow-400">
                  Run: <code className="text-yellow-300">python3.12 -m venv backend/agent/venvs/amt</code>{" "}
                  <button type="button" className="underline" onClick={() => setMode("midi")}>
                    Use MIDI in the meantime.
                  </button>
                </p>
              </div>
            </div>
          )}
          {importError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-800/50 bg-red-900/20 px-3 py-2 text-xs text-red-400">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span>{importError}</span>
            </div>
          )}
          {importDone && (
            <div className="flex items-center gap-2 rounded-lg border border-green-800/50 bg-green-900/20 px-3 py-2 text-xs text-green-400">
              <CheckCircle2 size={13} />
              Score loaded — closing…
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-obsidian-700 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={importing}
            className="rounded-lg px-4 py-1.5 text-sm text-zinc-400 transition hover:text-zinc-200 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={!canImport}
            className={[
              "flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium transition",
              canImport
                ? "bg-neon-violet/20 text-neon-violet hover:bg-neon-violet/30"
                : "cursor-not-allowed bg-neon-violet/10 text-neon-violet opacity-40",
            ].join(" ")}
          >
            {importing ? (
              <>
                <span className="inline-block h-3 w-3 animate-spin rounded-full border border-neon-violet border-t-transparent" />
                Importing…
              </>
            ) : (
              <>
                <Upload size={13} />
                Import
              </>
            )}
          </button>
        </div>
      </div>

      <KeySuggestionDialog
        open={!!pendingKey && !!pendingMusicXml}
        estimate={pendingKey}
        currentKey={engine.project?.meta.key_signature ?? null}
        busy={keyBusy}
        onApply={() => void handleApplyKey()}
        onSkip={() => void handleSkipKey()}
      />
    </div>
  );
}
