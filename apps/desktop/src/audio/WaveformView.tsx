import { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";

import { isTauri } from "../lib/tauri";

/**
 * Display-only waveform of a take file (Phase-5 B3, ADR-0024). The canonical
 * audio is the WAV in `takes/`; this is a *view* over it — wavesurfer never owns
 * the audio. Bytes are read through the fs plugin and handed to wavesurfer as a
 * Blob URL (no asset-protocol config needed). A full decode into RAM is fine for
 * short takes; pre-decoded peaks streamed from disk are the follow-up for large
 * files (ADR-0024 / PHASE_5 §5.9).
 */
export function WaveformView({
  takePath,
  height = 32,
}: {
  takePath: string;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauri() || !containerRef.current) return;
    let ws: WaveSurfer | null = null;
    let objectUrl: string | null = null;
    let cancelled = false;

    void (async () => {
      try {
        const { readFile } = await import("@tauri-apps/plugin-fs");
        const bytes = await readFile(takePath);
        if (cancelled || !containerRef.current) return;
        objectUrl = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
        ws = WaveSurfer.create({
          container: containerRef.current,
          url: objectUrl,
          height,
          waveColor: "#5b6472",
          progressColor: "#22d3ee",
          cursorWidth: 0,
          interact: false,
          normalize: true,
        });
      } catch (err) {
        if (!cancelled) setError(typeof err === "string" ? err : String(err));
      }
    })();

    return () => {
      cancelled = true;
      ws?.destroy();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [takePath, height]);

  if (error) {
    return <div className="text-[9px] text-danger">waveform: {error}</div>;
  }
  return <div ref={containerRef} className="w-full" />;
}
