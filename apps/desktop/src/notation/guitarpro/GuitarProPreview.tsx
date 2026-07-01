/**
 * Guitar Pro import preview (Track A, A7 — optional alphaTab player).
 *
 * Before a `.gp/.gpx/.gp5` is converted to MusicXML, this modal renders it with
 * alphaTab's *native* engine and plays it with alphaTab's built-in synth, so the
 * maintainer can (a) hear techniques the app doesn't yet voice (bends/palm-mute are
 * Phase 7 in-app) and (b) A/B the original against what the lossy conversion keeps
 * (ADR-0017). On confirm, the parent runs the normal MusicXML conversion.
 *
 * This is a *preview only*: alphaTab never becomes a second canonical renderer — OSMD
 * stays the single staff renderer (ADR-0019). The alphaTab runtime is dynamically
 * imported so its ~1 MB stays out of the startup bundle; if the audio synth can't
 * initialise in this environment, the visual preview and import still work.
 */

import { Guitar, Loader2, Pause, Play, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { AlphaTabApi } from "@coderline/alphatab";
// alphaTab's SMuFL font + soundfont, emitted as Vite assets and fetched on demand.
import bravuraWoff from "@coderline/alphatab/font/Bravura.woff?url";
import bravuraWoff2 from "@coderline/alphatab/font/Bravura.woff2?url";
import soundFontUrl from "@coderline/alphatab/soundfont/sonivox.sf2?url";

type Phase = "loading" | "ready" | "error";

interface GuitarProPreviewProps {
  open: boolean;
  filename: string | null;
  bytes: Uint8Array | null;
  importing?: boolean;
  onCancel: () => void;
  onImport: () => void;
}

export function GuitarProPreview({
  open,
  filename,
  bytes,
  importing = false,
  onCancel,
  onImport,
}: GuitarProPreviewProps): React.ReactElement | null {
  const renderRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<AlphaTabApi | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [audioReady, setAudioReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !bytes || !renderRef.current) return;
    let cancelled = false;
    let api: AlphaTabApi | null = null;
    setPhase("loading");
    setAudioReady(false);
    setPlaying(false);
    setError(null);

    void (async () => {
      const at = await import("@coderline/alphatab");
      if (cancelled || !renderRef.current) return;

      const settings = new at.Settings();
      settings.core.engine = "svg";
      settings.core.useWorkers = false; // no worker asset resolution needed for a preview
      settings.core.smuflFontSources = new Map([
        [at.FontFileFormat.Woff2, bravuraWoff2],
        [at.FontFileFormat.Woff, bravuraWoff],
      ]);
      settings.player.enablePlayer = true;
      settings.player.scrollElement = renderRef.current;

      api = new at.AlphaTabApi(renderRef.current, settings);
      apiRef.current = api;

      api.renderFinished.on(() => {
        if (!cancelled) setPhase("ready");
      });
      api.playerReady.on(() => {
        if (!cancelled) setAudioReady(true);
      });
      api.playerStateChanged.on((args) => {
        if (!cancelled) setPlaying(Number(args.state) === 1); // 1 = PlayerState.Playing
      });
      api.error.on((err) => {
        if (cancelled) return;
        // A failure before anything rendered is fatal to the preview; a later one
        // (audio worklet / soundfont) leaves the visual intact — degrade to a silent
        // preview rather than blocking the import.
        setPhase((p) => (p === "ready" ? p : "error"));
        setError(err instanceof Error ? err.message : String(err));
      });

      try {
        api.loadSoundFont(soundFontUrl);
      } catch {
        /* audio is optional; the visual preview and import still work */
      }
      api.load(new Uint8Array(bytes));
    })().catch((err: unknown) => {
      if (cancelled) return;
      setPhase("error");
      setError(err instanceof Error ? err.message : String(err));
    });

    return () => {
      cancelled = true;
      try {
        api?.destroy();
      } catch {
        /* ignore teardown races */
      }
      apiRef.current = null;
    };
  }, [open, bytes]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label="Guitar Pro preview"
    >
      <div
        className="flex max-h-[85vh] w-[720px] flex-col rounded-lg border border-neutral-800 bg-neutral-950 text-zinc-100 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-neutral-800 px-5 py-3">
          <Guitar size={16} className="text-neon-cyan" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">Guitar Pro preview</div>
            <div className="truncate text-[11px] text-zinc-500">{filename ?? ""}</div>
          </div>
          <button
            type="button"
            onClick={() => apiRef.current?.playPause()}
            disabled={!audioReady}
            title={audioReady ? "Play / pause" : "Audio not available in this environment"}
            aria-label="Play or pause"
            className="rounded border border-neutral-800 p-1.5 text-zinc-300 hover:text-neon-cyan disabled:opacity-40"
          >
            {playing ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button
            type="button"
            onClick={() => {
              apiRef.current?.stop();
              setPlaying(false);
            }}
            disabled={!audioReady}
            aria-label="Stop"
            className="rounded border border-neutral-800 p-1.5 text-zinc-300 hover:text-neon-cyan disabled:opacity-40"
          >
            <Square size={14} />
          </button>
        </div>

        <div className="relative min-h-[240px] flex-1 overflow-auto bg-white p-3">
          <div ref={renderRef} />
          {phase === "loading" && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-white/70 text-sm text-neutral-600">
              <Loader2 size={16} className="animate-spin" /> Rendering…
            </div>
          )}
          {phase === "error" && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/90 p-6 text-center text-sm text-danger">
              Could not preview this file: {error}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-neutral-800 px-5 py-3">
          <p className="min-w-0 flex-1 text-[11px] text-zinc-500">
            Preview plays with Guitar Pro&apos;s own audio. Importing converts to the
            app&apos;s notation (MusicXML) — some effects may be approximated.
          </p>
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-neutral-800 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onImport}
            disabled={phase === "error" || importing}
            className="rounded border border-neon-cyan/40 bg-neon-cyan/10 px-3 py-1.5 text-xs font-medium text-neon-cyan hover:bg-neon-cyan/20 disabled:opacity-40"
          >
            {importing ? "Importing…" : "Import to score"}
          </button>
        </div>
      </div>
    </div>
  );
}
