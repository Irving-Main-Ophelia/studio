import { useState } from "react";

import { DiffOverlay } from "../agent/DiffOverlay";
import { useEditorKeyboard } from "../editor/useEditorKeyboard";
import { useScoreEngine } from "../lib/ScoreEngine";
import { useKeyboardShortcuts } from "../lib/useKeyboardShortcuts";
import { NewProjectDialog } from "../project/NewProjectDialog";
import { RecoveryBanner } from "../project/RecoveryBanner";
import { BottomRail } from "./BottomRail";
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

  // Editor keyboard listener: only active when a project is open and no
  // ⌘-bound shortcut is firing.
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
    </div>
  );
}
