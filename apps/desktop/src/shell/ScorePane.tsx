import { ScoreView } from "../notation/ScoreView";
import { useScoreEngine } from "../lib/ScoreEngine";

export function ScorePane() {
  const engine = useScoreEngine();
  return (
    <section className="flex flex-1 min-h-0 items-stretch justify-center bg-obsidian-900 p-6">
      <div className="h-full w-full max-w-5xl">
        <ScoreView
          musicxml={engine.score?.musicxml ?? null}
          positionSec={engine.positionSec}
          durationSec={engine.score?.extracted.duration_sec ?? 0}
        />
      </div>
    </section>
  );
}
