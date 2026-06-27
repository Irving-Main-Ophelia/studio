import { EditorStatusBar } from "../editor/EditorStatusBar";
import { NoteEditToolbar } from "../editor/NoteEditToolbar";
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
      <NoteEditToolbar />
      <div className="flex-1 min-h-0 overflow-auto p-6">
        <div className="mx-auto h-full w-full max-w-5xl">
          <ScoreView
            musicxml={engine.score?.musicxml ?? null}
            timeSignature={engine.project?.meta.time_signature ?? "4/4"}
            positionSec={engine.positionSec}
            durationSec={engine.score?.extracted.duration_sec ?? 0}
            editEnabled={Boolean(engine.score?.musicxml)}
            selectedNote={engine.selection.note}
            measureRange={engine.selection.measureRange}
            captureMode={engine.captureMode}
            editorBusy={engine.editorBusy}
            onSelectNote={engine.selectNote}
            onMeasureRange={engine.setMeasureRange}
            onNoteDuration={engine.editNoteDuration}
            onNoteArticulation={engine.editNoteArticulation}
            onNoteDynamic={engine.editNoteDynamic}
            onNoteRespell={engine.editNoteRespell}
            onNotePitch={engine.editNotePitch}
            onNoteTranspose={engine.transposeNote}
            onNoteRemove={engine.removeNoteAt}
            editorError={engine.editorError}
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
