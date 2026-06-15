import { EditorStatusBar } from "../editor/EditorStatusBar";
import { useScoreEngine } from "../lib/ScoreEngine";
import { ScoreView } from "../notation/ScoreView";

interface ScorePaneProps {
  onNewProject: () => void;
  onImportAudio: () => void;
  onOpenMusicXml: () => void;
}

export function ScorePane({ onNewProject, onImportAudio, onOpenMusicXml }: ScorePaneProps) {
  const engine = useScoreEngine();
  return (
    <section className="flex flex-1 min-h-0 flex-col bg-obsidian-900">
      <div className="flex-1 min-h-0 overflow-auto p-6">
        <div className="mx-auto h-full w-full max-w-5xl">
          <ScoreView
            musicxml={engine.score?.musicxml ?? null}
            positionSec={engine.positionSec}
            durationSec={engine.score?.extracted.duration_sec ?? 0}
            onNewProject={onNewProject}
            onImportAudio={onImportAudio}
            onOpenMusicXml={onOpenMusicXml}
          />
        </div>
      </div>
      <EditorStatusBar />
    </section>
  );
}
