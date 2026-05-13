import { ChevronRight, FolderOpen } from "lucide-react";

/**
 * Left rail — project tree (movements / sections / takes).
 * Phase 0: empty placeholder.
 */
export function ProjectTree() {
  return (
    <aside className="w-56 shrink-0 border-r border-obsidian-700 bg-obsidian-800/40 px-3 py-4 text-xs">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-medium uppercase tracking-widest text-zinc-500">Project</h2>
        <button
          className="rounded p-1 text-zinc-500 transition-colors hover:bg-obsidian-700 hover:text-zinc-200"
          aria-label="Open project"
        >
          <FolderOpen size={12} />
        </button>
      </div>
      <div className="rounded-md border border-dashed border-obsidian-600/60 p-4 text-center text-[11px] text-zinc-500">
        No project yet.
        <br />
        <span className="text-zinc-600">Open one or start a new piece.</span>
      </div>

      <div className="mt-6 space-y-1 text-zinc-400">
        <div className="flex items-center gap-1 opacity-50">
          <ChevronRight size={10} />
          <span>Movement I — Andante</span>
        </div>
        <div className="flex items-center gap-1 opacity-50">
          <ChevronRight size={10} />
          <span>Movement II — Adagio</span>
        </div>
        <p className="mt-3 text-[10px] text-zinc-600">(placeholder content, Phase 0)</p>
      </div>
    </aside>
  );
}
