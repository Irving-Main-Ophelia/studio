import { useEffect, useRef, useState } from "react";
import { FileMusic, FolderOpen, Music2, Plus } from "lucide-react";
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";

interface ScoreViewProps {
  musicxml: string | null;
  positionSec?: number;
  durationSec?: number;
  theme?: "parchment" | "night";
  onNewProject?: () => void;
  onImportAudio?: () => void;
  onOpenMusicXml?: () => void;
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
  onNewProject,
  onImportAudio,
  onOpenMusicXml,
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
    let rafId: number;
    osmd
      .load(musicxml)
      .then(() => {
        // Defer render to next frame so the container has its CSS-computed width.
        rafId = requestAnimationFrame(() => {
          osmd.render();
          setLoading(false);
        });
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        setLoading(false);
      });
    return () => cancelAnimationFrame(rafId);
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
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-8 px-10 text-center">
          <p className="musical text-3xl text-score-ink/50 select-none">&ldquo;What do we compose today?&rdquo;</p>
          <div className="flex flex-wrap items-stretch justify-center gap-2">
            <EmptyActionCard
              icon={<Plus size={16} />}
              label="New Project"
              onClick={onNewProject}
            />
            <EmptyActionCard
              icon={<Music2 size={16} />}
              label="Import Audio"
              sub="FLAC / MP3 / WAV"
              onClick={onImportAudio}
            />
            <EmptyActionCard
              icon={<FileMusic size={16} />}
              label="Import MIDI"
              sub=".mid .midi"
              onClick={onImportAudio}
            />
            <EmptyActionCard
              icon={<FolderOpen size={16} />}
              label="Open MusicXML"
              sub=".xml .musicxml"
              onClick={onOpenMusicXml}
            />
          </div>
          <p className="num text-[9px] uppercase tracking-[0.3em] text-score-ink/30 select-none">
            Press <kbd className="rounded border border-score-ink/20 bg-score-ink/5 px-1 font-sans text-[9px]">cmd K</kbd> for all options
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

function EmptyActionCard({
  icon,
  label,
  sub,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  sub?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={[
        "group relative flex w-36 cursor-pointer flex-col items-center gap-2.5 rounded-xl px-4 py-5 text-center",
        "border border-score-ink/10 bg-score-ink/5",
        "transition-all duration-150",
        "hover:border-neon-violet/60 hover:bg-neon-violet/10",
        "hover:shadow-[0_0_24px_rgba(139,92,246,0.18)]",
        "active:scale-[0.97]",
        "disabled:cursor-not-allowed disabled:opacity-30",
      ].join(" ")}
    >
      <span className="text-score-ink/40 transition-colors duration-150 group-hover:text-neon-violet">
        {icon}
      </span>
      <span className="text-[11px] font-semibold leading-tight tracking-wide text-score-ink/70 transition-colors duration-150 group-hover:text-score-ink">
        {label}
      </span>
      {sub && (
        <span className="text-[8px] uppercase tracking-widest text-score-ink/30 group-hover:text-score-ink/50">
          {sub}
        </span>
      )}
    </button>
  );
}
