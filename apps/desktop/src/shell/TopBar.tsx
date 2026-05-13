import { Play, Square, Repeat, Settings } from "lucide-react";

import { NorthStar } from "./NorthStar";

interface AppInfo {
  name: string;
  version: string;
  phase: string;
}

/**
 * Top bar — the "Broadway marquee" transport.
 * See docs/UI_DESIGN.md §6.
 *
 * Phase 0: layout only, no working transport yet.
 */
export function TopBar({ info }: { info: AppInfo }) {
  return (
    <header className="drag-region relative flex h-10 shrink-0 items-center gap-3 border-b border-obsidian-700 bg-obsidian-800/80 px-3">
      <div className="flex items-center gap-2 no-drag">
        <NorthStar size={20} />
        <span className="text-sm font-medium tracking-wide">{info.name}</span>
        <span className="num text-[10px] uppercase tracking-widest text-zinc-500">
          v{info.version} · phase {info.phase}
        </span>
      </div>

      <div className="mx-auto flex items-center gap-1 no-drag">
        <TransportButton label="Play" icon={<Play size={14} />} />
        <TransportButton label="Stop" icon={<Square size={14} />} />
        <TransportButton label="Loop" icon={<Repeat size={14} />} />
        <div className="ml-3 num text-xs text-zinc-400">
          <span className="text-zinc-200">1:1:000</span>
          <span className="mx-2 text-zinc-600">·</span>
          <span>120 BPM</span>
          <span className="mx-2 text-zinc-600">·</span>
          <span>4/4</span>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2 no-drag">
        <button
          className="rounded-md p-1.5 text-zinc-400 transition-colors duration-150 ease-signature hover:bg-obsidian-700 hover:text-zinc-100"
          aria-label="Settings"
        >
          <Settings size={14} />
        </button>
      </div>

      {/* The "marquee shimmer" — only animates when playing. Phase 0: static placeholder. */}
      <span
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-neon-magenta/60 to-transparent opacity-40"
        aria-hidden
      />
    </header>
  );
}

function TransportButton({ label, icon }: { label: string; icon: React.ReactNode }) {
  return (
    <button
      aria-label={label}
      className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition-colors duration-150 ease-signature hover:bg-obsidian-700 hover:text-zinc-100"
    >
      {icon}
    </button>
  );
}
