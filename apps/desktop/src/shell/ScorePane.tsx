/**
 * Center pane — the score viewport.
 *
 * Phase 0 Week 2 wires this to OpenSheetMusicDisplay. For now we render
 * an inviting empty parchment and a single greeting per docs/UI_DESIGN.md §13.
 */
export function ScorePane() {
  return (
    <section className="flex flex-1 min-h-0 items-center justify-center bg-obsidian-900 p-6">
      <div className="relative h-full w-full max-w-5xl rounded-xl bg-score-parchment text-score-ink shadow-[0_30px_80px_-30px_rgba(255,46,136,0.25)] ring-1 ring-obsidian-700/70 overflow-hidden">
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-10 text-center">
          <p className="musical text-2xl text-score-ink/70">
            “What do we write today?”
          </p>
          <p className="num text-[10px] uppercase tracking-[0.3em] text-score-ink/40">
            Parchment score · Phase 0 placeholder
          </p>
        </div>
      </div>
    </section>
  );
}
