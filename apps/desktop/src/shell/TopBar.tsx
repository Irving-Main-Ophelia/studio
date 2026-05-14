import { useMemo, useState } from "react";
import { Loader2, MapPin, Pause, Play, Repeat, Settings, Square } from "lucide-react";

import { useScoreEngine } from "../lib/ScoreEngine";
import { NorthStar } from "./NorthStar";

interface AppInfo {
  name: string;
  version: string;
  phase: string;
}

const PRESET_KEYS = [
  "C major",
  "G major",
  "D major",
  "A major",
  "E major",
  "F major",
  "Bb major",
  "Eb major",
  "A minor",
  "E minor",
  "B minor",
  "F# minor",
  "C# minor",
  "G minor",
  "C minor",
];

/**
 * Top bar — the "Broadway marquee" transport.
 * Phase 0: working Play/Stop + key transposition.
 */
export function TopBar({ info }: { info: AppInfo }) {
  const engine = useScoreEngine();
  const [showTranspose, setShowTranspose] = useState(false);

  const isPlaying = engine.playerStatus === "playing";
  const isLoading = engine.playerStatus === "loading" || engine.loading;
  const canPlay = !!engine.score;

  const positionLabel = useMemo(() => formatTime(engine.positionSec), [engine.positionSec]);
  const durationLabel = useMemo(
    () => (engine.score ? formatTime(engine.score.extracted.duration_sec) : "—"),
    [engine.score],
  );
  const tempo = engine.score?.extracted.tempo_bpm ?? 120;

  return (
    <header className="drag-region relative flex h-10 shrink-0 items-center gap-3 border-b border-obsidian-700 bg-obsidian-800/80 px-3">
      {/* Identity */}
      <div className="flex items-center gap-2 no-drag">
        <NorthStar size={20} />
        <span className="text-sm font-medium tracking-wide">{info.name}</span>
        <span className="num text-[10px] uppercase tracking-widest text-zinc-500">
          v{info.version} · phase {info.phase}
        </span>
        <BackendStatus online={engine.backendOnline} />
      </div>

      {/* Transport */}
      <div className="mx-auto flex items-center gap-1 no-drag">
        <TransportButton
          label={isPlaying ? "Pause" : "Play"}
          disabled={!canPlay}
          onClick={() => (isPlaying ? engine.stop() : engine.play())}
          icon={
            isLoading ? (
              <Loader2 size={14} className="animate-spin text-neon-cyan" />
            ) : isPlaying ? (
              <Pause size={14} className="text-neon-magenta" />
            ) : (
              <Play size={14} className={canPlay ? "text-neon-magenta" : ""} />
            )
          }
        />
        <TransportButton
          label="Stop"
          disabled={!canPlay}
          onClick={() => engine.stop()}
          icon={<Square size={14} />}
        />
        <TransportButton
          label="Play from cursor"
          disabled={!canPlay || !engine.project}
          onClick={() => void engine.playFromCursor()}
          icon={<MapPin size={14} />}
        />
        <TransportButton
          label={engine.loop ? "Clear loop" : "Loop last 4 bars"}
          disabled={!canPlay}
          highlighted={!!engine.loop}
          onClick={() => {
            if (!engine.score) return;
            if (engine.loop) {
              engine.setLoop(null);
            } else {
              const total = engine.score.extracted.duration_sec;
              const start = Math.max(0, total - 8);
              engine.setLoop({ start_sec: start, end_sec: total });
            }
          }}
          icon={<Repeat size={14} />}
        />

        {/* Position / tempo readout */}
        <div className="ml-3 num text-xs text-zinc-400">
          <span className="text-zinc-200">{positionLabel}</span>
          <span className="text-zinc-600"> / {durationLabel}</span>
          <span className="mx-2 text-zinc-600">·</span>
          <span>{tempo.toFixed(0)} BPM</span>
          {engine.score?.keyEstimate && (
            <>
              <span className="mx-2 text-zinc-600">·</span>
              <span className="text-neon-cyan/90">
                {engine.score.keyEstimate.key} {engine.score.keyEstimate.mode}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Right */}
      <div className="ml-auto flex items-center gap-2 no-drag">
        <button
          disabled={!canPlay}
          onClick={() => setShowTranspose((v) => !v)}
          className="rounded-md px-2 py-1 text-xs text-zinc-400 transition-colors duration-150 ease-signature hover:bg-obsidian-700 hover:text-zinc-100 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-400"
        >
          Transpose
        </button>
        <button
          className="rounded-md p-1.5 text-zinc-400 transition-colors duration-150 ease-signature hover:bg-obsidian-700 hover:text-zinc-100"
          aria-label="Settings"
        >
          <Settings size={14} />
        </button>
      </div>

      {/* Transpose dropdown */}
      {showTranspose && (
        <TransposePanel
          onChoose={async (k) => {
            setShowTranspose(false);
            await engine.transpose(k);
          }}
          onClose={() => setShowTranspose(false)}
        />
      )}

      {/* Marquee shimmer — animates when playing */}
      <span
        aria-hidden
        className={[
          "pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-neon-magenta/60 to-transparent",
          isPlaying ? "opacity-100" : "opacity-40",
        ].join(" ")}
      />
    </header>
  );
}

function TransportButton({
  label,
  icon,
  onClick,
  disabled,
  highlighted,
}: {
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  highlighted?: boolean;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={[
        "flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-150 ease-signature",
        highlighted
          ? "bg-neon-amber/15 text-neon-amber"
          : "text-zinc-400 hover:bg-obsidian-700 hover:text-zinc-100",
        "disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-400",
      ].join(" ")}
    >
      {icon}
    </button>
  );
}

function TransposePanel({
  onChoose,
  onClose,
}: {
  onChoose: (k: string) => void | Promise<void>;
  onClose: () => void;
}) {
  return (
    <div className="absolute right-3 top-12 z-30 w-56 glass-panel rounded-lg p-3 text-xs no-drag">
      <div className="mb-2 flex items-center justify-between">
        <span className="num uppercase tracking-widest text-zinc-400">Transpose to…</span>
        <button
          onClick={onClose}
          className="text-zinc-500 hover:text-zinc-200"
          aria-label="Close"
        >
          ✕
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1">
        {PRESET_KEYS.map((k) => (
          <button
            key={k}
            onClick={() => onChoose(k)}
            className="rounded px-2 py-1 text-[11px] text-zinc-200 transition-colors hover:bg-neon-violet/30"
          >
            {k}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-zinc-500">
        Or ask the agent: <span className="text-neon-cyan">“transpose to F minor”</span>
      </p>
    </div>
  );
}

function BackendStatus({ online }: { online: boolean | null }) {
  let color = "text-zinc-600";
  let label = "agent: checking";
  if (online === true) {
    color = "text-neon-emerald";
    label = "agent online";
  } else if (online === false) {
    color = "text-danger";
    label = "agent offline";
  }
  return (
    <span
      className={`num ml-3 text-[10px] uppercase tracking-widest ${color}`}
      title="Local FastAPI agent at 127.0.0.1:8000"
    >
      ● {label}
    </span>
  );
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
