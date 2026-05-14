import { useState } from "react";

import { DiffOverlay } from "../agent/DiffOverlay";
import { useEditorKeyboard } from "../editor/useEditorKeyboard";
import { ExportDialog } from "../export/ExportDialog";
import { TransposeDialog } from "../editor/TransposeDialog";
import { useScoreEngine } from "../lib/ScoreEngine";
import { useKeyboardShortcuts } from "../lib/useKeyboardShortcuts";
import { NewProjectDialog } from "../project/NewProjectDialog";
import { RecoveryBanner } from "../project/RecoveryBanner";
import { BottomRail } from "./BottomRail";
import { CommandPalette } from "./CommandPalette";
import { ProjectTree } from "./ProjectTree";
import { RightRail } from "./RightRail";
import { ScorePane } from "./ScorePane";
import { TopBar } from "./TopBar";

interface AppInfo {
  name: string;
  version: string;
  phase: string;
}

/**
 * The three-pane modular shell described in docs/UI_DESIGN.md §5.
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │  Top Bar (transport)                                          │
 *   ├────────────┬─────────────────────────────┬────────────────────┤
 *   │            │                             │                    │
 *   │  Project   │       Score Viewport        │   Agent Panel      │
 *   │  Tree      │                             │                    │
 *   │            ├─────────────────────────────┤                    │
 *   │            │  Bottom Rail (timeline)     │                    │
 *   └────────────┴─────────────────────────────┴────────────────────┘
 */
export function Shell({ info }: { info: AppInfo }) {
  const engine = useScoreEngine();
  const [newDialog, setNewDialog] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [transposeOpen, setTransposeOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEditorKeyboard(Boolean(engine.project));

  useKeyboardShortcuts([
    { key: "n", meta: true, handler: () => setNewDialog(true) },
    { key: "o", meta: true, handler: () => void engine.openProjectViaDialog() },
    {
      key: "s",
      meta: true,
      handler: async () => {
        if (engine.project) await engine.saveProject();
      },
    },
    {
      key: "z",
      meta: true,
      handler: () => {
        if (engine.canUndo) void engine.undo();
      },
    },
    {
      key: "z",
      meta: true,
      shift: true,
      handler: () => {
        if (engine.canRedo) void engine.redo();
      },
    },
    { key: "k", meta: true, handler: () => setPaletteOpen((v) => !v) },
    { key: "e", meta: true, shift: true, handler: () => setExportOpen(true) },
  ]);

  return (
    <div className="flex h-full w-full flex-col bg-obsidian-900 text-zinc-100">
      <NewProjectDialog open={newDialog} onClose={() => setNewDialog(false)} />
      <TopBar info={info} />
      <RecoveryBanner />
      <div className="flex flex-1 min-h-0">
        <ProjectTree onNewProject={() => setNewDialog(true)} />
        <main className="flex flex-1 min-w-0 flex-col">
          <ScorePane />
          <BottomRail />
        </main>
        <RightRail />
      </div>
      <DiffOverlay />
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
      <TransposeDialog open={transposeOpen} onClose={() => setTransposeOpen(false)} />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onOpenNewProject={() => setNewDialog(true)}
        onOpenExport={() => setExportOpen(true)}
        onOpenTranspose={() => setTransposeOpen(true)}
        onFocusTutor={() => {
          // Tutor tab lives inside RightRail; opening the palette command
          // simply scrolls focus to the right rail. Wiring an event bus
          // for "focus tab=tutor" is a Phase-2 nicety; today the rail
          // already shows the tab next to Agent.
          const aside = document.querySelector("aside[aria-label='Theory Tutor']");
          if (aside instanceof HTMLElement) aside.focus();
        }}
      />
    </div>
  );
}
