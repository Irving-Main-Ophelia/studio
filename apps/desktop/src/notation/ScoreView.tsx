import { useEffect, useRef, useState } from "react";
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";

interface ScoreViewProps {
  musicxml: string | null;
  positionSec?: number;
  durationSec?: number;
  theme?: "parchment" | "night";
}

/**
 * Renders a MusicXML score with OpenSheetMusicDisplay.
 *
 * Phase 0 wires basic rendering + a soft playhead that tracks elapsed time.
 * Phase 1 will sync the OSMD cursor to the audio engine note-by-note.
 */
export function ScoreView({
  musicxml,
  positionSec = 0,
  durationSec = 0,
  theme = "parchment",
}: ScoreViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const osmd = new OpenSheetMusicDisplay(containerRef.current, {
      autoResize: true,
      backend: "svg",
      drawTitle: true,
      drawSubtitle: false,
      drawComposer: true,
      drawCredits: false,
      drawPartNames: false,
      drawingParameters: theme === "night" ? "compact" : "default",
    });
    osmdRef.current = osmd;
    return () => {
      osmd.clear();
      osmdRef.current = null;
    };
  }, [theme]);

  useEffect(() => {
    const osmd = osmdRef.current;
    if (!osmd || !musicxml) return;
    setLoading(true);
    setError(null);
    osmd
      .load(musicxml)
      .then(() => {
        osmd.render();
        setLoading(false);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        setLoading(false);
      });
  }, [musicxml]);

  const isParchment = theme === "parchment";

  return (
    <div
      className={[
        "relative h-full w-full overflow-hidden rounded-xl ring-1 ring-obsidian-700/70 shadow-[0_30px_80px_-30px_rgba(255,46,136,0.25)]",
        isParchment
          ? "bg-score-parchment text-score-ink"
          : "bg-score-night-bg text-score-night-ink",
      ].join(" ")}
    >
      {/* Playhead progress bar */}
      <div
        aria-hidden
        className="absolute left-0 right-0 top-0 z-10 h-px bg-neon-magenta/70 transition-[width] duration-100"
        style={{
          width: `${durationSec > 0 ? Math.min(100, (positionSec / durationSec) * 100) : 0}%`,
        }}
      />

      {/* OSMD container */}
      <div
        ref={containerRef}
        className="h-full w-full overflow-auto px-6 py-8 [&_svg]:!w-full [&_svg]:!h-auto"
      />

      {/* Empty state */}
      {!musicxml && !loading && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-10 text-center">
          <p className="musical text-2xl opacity-70">“What do we write today?”</p>
          <p className="num text-[10px] uppercase tracking-[0.3em] opacity-50">
            Use File → Open or drag a .musicxml in
          </p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-score-parchment/80">
          <span className="num text-[10px] uppercase tracking-[0.3em] opacity-50">
            Rendering score…
          </span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-score-parchment/95 px-8 text-center">
          <div>
            <p className="font-medium text-danger">Could not render this score.</p>
            <p className="mt-2 text-xs opacity-70">{error}</p>
          </div>
        </div>
      )}
    </div>
  );
}
