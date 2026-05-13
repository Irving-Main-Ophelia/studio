/**
 * Bottom rail — timeline, waveforms, mixer.
 * Phase 0: visual placeholder only.
 */
export function BottomRail() {
  return (
    <footer className="h-24 shrink-0 border-t border-obsidian-700 bg-obsidian-800/60 px-3 py-2 text-xs text-zinc-400">
      <div className="flex items-center justify-between">
        <span className="num uppercase tracking-widest text-zinc-500">Timeline</span>
        <span className="num text-zinc-600">— · —</span>
      </div>
      <div className="mt-2 h-12 rounded bg-obsidian-900/60 ring-1 ring-obsidian-700/60" />
    </footer>
  );
}
