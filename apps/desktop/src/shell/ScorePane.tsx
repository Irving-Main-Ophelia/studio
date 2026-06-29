import { useEffect, useMemo, useState } from "react";

import { EditorStatusBar } from "../editor/EditorStatusBar";
import { NoteEditToolbar } from "../editor/NoteEditToolbar";
import { api } from "../lib/api";
import { useScoreEngine } from "../lib/ScoreEngine";
import { ScoreView } from "../notation/ScoreView";
import { ViewModeToggle } from "../notation/ViewModeToggle";
import type { InstrumentationEntry, ViewMode } from "../project/types";

interface ScorePaneProps {
  onNewProject: () => void;
  onImportAudio: () => void;
  onOpenMusicXml: () => void;
}

const NO_PARTS: InstrumentationEntry[] = [];

export function ScorePane({ onNewProject, onImportAudio, onOpenMusicXml }: ScorePaneProps) {
  const engine = useScoreEngine();
  const canonical = engine.score?.musicxml ?? null;
  const instrumentation = engine.project?.meta.instrumentation ?? NO_PARTS;

  // The parts we can offer a view toggle for. A score open without a project still
  // gets a single toggle for part 0 (the common imported-score case).
  const parts = useMemo(
    () =>
      instrumentation.length > 0
        ? instrumentation.map((e, i) => ({
            index: i,
            label: e.instrument || e.id || `Part ${i + 1}`,
            guitar: e.guitar ?? null,
          }))
        : canonical
          ? [{ index: 0, label: "Part 1", guitar: null }]
          : [],
    [instrumentation, canonical],
  );

  // Per-part view modes, seeded from persisted meta; local for snappy toggling.
  const [viewModes, setViewModes] = useState<Record<number, ViewMode>>({});
  useEffect(() => {
    const seeded: Record<number, ViewMode> = {};
    instrumentation.forEach((e, i) => {
      seeded[i] = (e.guitar?.view_mode as ViewMode) ?? "staff";
    });
    setViewModes(seeded);
    // Reseed only when a different project loads — not on every instrumentation
    // change, which would clobber a just-toggled local view mid-persist.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine.project?.path]);

  const [projectedXml, setProjectedXml] = useState<string | null>(null);
  const [projecting, setProjecting] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);

  // Parts requesting a non-staff view ⇒ the projection request body.
  const activeSpecs = useMemo(
    () =>
      parts.flatMap((p) => {
        const vm = viewModes[p.index] ?? "staff";
        if (vm === "staff") return [];
        return [
          {
            part_index: p.index,
            view_mode: vm,
            tuning: p.guitar?.tuning ?? null,
            capo: p.guitar?.capo ?? 0,
          },
        ];
      }),
    [parts, viewModes],
  );
  const specsKey = JSON.stringify(activeSpecs);

  useEffect(() => {
    if (!canonical || activeSpecs.length === 0) {
      setProjectedXml(null);
      setProjectError(null);
      return;
    }
    let cancelled = false;
    setProjecting(true);
    api
      .projectTabView({ musicxml: canonical, parts: activeSpecs })
      .then((res) => {
        if (cancelled) return;
        setProjectedXml(res.musicxml);
        setProjectError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setProjectedXml(null);
        setProjectError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setProjecting(false);
      });
    return () => {
      cancelled = true;
    };
    // specsKey captures the meaningful contents of activeSpecs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canonical, specsKey]);

  const handleViewMode = (partIndex: number, mode: ViewMode) => {
    setViewModes((prev) => ({ ...prev, [partIndex]: mode }));
    if (engine.project) void engine.setPartViewMode(partIndex, mode);
  };

  // A tab projection is read-only: editing happens against the canonical staff.
  const projectionActive = activeSpecs.length > 0 && projectedXml != null;
  const editEnabled = Boolean(canonical) && !projectionActive;
  const single = parts.length === 1;

  return (
    <section className="flex flex-1 min-h-0 flex-col bg-obsidian-900">
      <NoteEditToolbar />
      {canonical && parts.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-obsidian-700 bg-obsidian-800/60 px-3 py-1 text-[10px] text-zinc-400">
          {parts.map((p) => (
            <div key={p.index} className="flex items-center gap-1.5">
              {!single && <span className="text-zinc-500">{p.label}</span>}
              <ViewModeToggle
                value={viewModes[p.index] ?? "staff"}
                onChange={(mode) => handleViewMode(p.index, mode)}
                busy={projecting}
              />
            </div>
          ))}
          {projectionActive && (
            <span className="text-zinc-500">Tab view is read-only — switch to Staff to edit.</span>
          )}
          {projectError && <span className="text-danger">Tab view failed: {projectError}</span>}
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-auto p-6">
        <div className="mx-auto h-full w-full max-w-5xl">
          <ScoreView
            musicxml={canonical}
            renderMusicxml={projectedXml}
            timeSignature={engine.project?.meta.time_signature ?? "4/4"}
            positionSec={engine.positionSec}
            durationSec={engine.score?.extracted.duration_sec ?? 0}
            editEnabled={editEnabled}
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
