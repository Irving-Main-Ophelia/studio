import { useEffect, useRef, useState } from "react";

import { DiffOverlay } from "../agent/DiffOverlay";
import { GenerateScoreDialog } from "../agent/GenerateScoreDialog";
import { useEditorKeyboard } from "../editor/useEditorKeyboard";
import { useMidiRecorder } from "../lib/useMidiRecorder";
import { AudioImportDialog } from "../editor/AudioImportDialog";
import { ExportDialog } from "../export/ExportDialog";
import { OrchestrationDialog } from "../editor/OrchestrationDialog";
import { TransposeDialog } from "../editor/TransposeDialog";
import { useScoreEngine } from "../lib/ScoreEngine";
import { isTauri } from "../lib/tauri";
import { useKeyboardShortcuts } from "../lib/useKeyboardShortcuts";
import { GuitarProPreview } from "../notation/guitarpro/GuitarProPreview";
import { importGuitarProBytes, isGuitarProFile } from "../notation/guitarpro/importGuitarPro";
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
  const shellRef = useRef<HTMLDivElement>(null);
  const xmlInputRef = useRef<HTMLInputElement>(null);
  const [newDialog, setNewDialog] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [transposeOpen, setTransposeOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [orchestrationOpen, setOrchestrationOpen] = useState(false);
  const [audioImportOpen, setAudioImportOpen] = useState(false);
  // Guitar Pro files preview in alphaTab before conversion (A7 optional player).
  const [gpPreview, setGpPreview] = useState<{ filename: string; bytes: Uint8Array } | null>(null);
  const [gpImporting, setGpImporting] = useState(false);

  const openMusicXml = () => xmlInputRef.current?.click();

  const handleXmlFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    if (isGuitarProFile(file.name)) {
      // Preview the GP file in alphaTab; conversion to MusicXML waits for confirm.
      const bytes = new Uint8Array(await file.arrayBuffer());
      setGpPreview({ filename: file.name, bytes });
      return;
    }
    const text = await file.text();
    await engine.loadFromXml(file.name, text);
  };

  const confirmGpImport = async () => {
    if (!gpPreview) return;
    setGpImporting(true);
    try {
      // alphaTab parses the binary GP model; we convert to MusicXML (ADR-0019).
      const { musicxml, warnings } = await importGuitarProBytes(gpPreview.bytes);
      if (warnings.length) {
        console.warn(`Guitar Pro import: ${warnings.length} effect(s) not converted —`, warnings);
      }
      await engine.loadFromXml(gpPreview.filename, musicxml);
      setGpPreview(null);
    } finally {
      setGpImporting(false);
    }
  };

  // Ensure the shell div has focus on mount so keyboard shortcuts are captured.
  // Without this, browser chrome retains focus and ⌘N / ⌘K go to the OS.
  useEffect(() => {
    shellRef.current?.focus();
  }, []);

  useEditorKeyboard(Boolean(engine.project));
  useMidiRecorder();

  useKeyboardShortcuts([
    // ⌘N is browser-reserved (opens new window) and cannot be intercepted by
    // event.preventDefault() in a browser tab. It works fine in the native
    // Tauri app where there is no browser chrome.
    ...(isTauri() ? [{ key: "n", meta: true, handler: () => setNewDialog(true) }] : []),
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
    <div
      ref={shellRef}
      tabIndex={-1}
      className="flex h-full w-full flex-col bg-obsidian-900 text-zinc-100 outline-none"
    >
      <input
        ref={xmlInputRef}
        type="file"
        accept=".xml,.musicxml,.gp,.gpx,.gp3,.gp4,.gp5"
        className="sr-only"
        onChange={(e) => void handleXmlFile(e)}
      />
      <NewProjectDialog open={newDialog} onClose={() => setNewDialog(false)} />
      <TopBar
        info={info}
        onNewProject={() => setNewDialog(true)}
        onImportAudio={() => setAudioImportOpen(true)}
        onOpenMusicXml={openMusicXml}
        onExport={() => setExportOpen(true)}
      />
      <RecoveryBanner />
      <div className="flex flex-1 min-h-0">
        <ProjectTree
          onNewProject={() => setNewDialog(true)}
          onOpenAudioImport={() => setAudioImportOpen(true)}
        />
        <main className="flex flex-1 min-w-0 flex-col">
          <ScorePane
            onNewProject={() => setNewDialog(true)}
            onImportAudio={() => setAudioImportOpen(true)}
            onOpenMusicXml={openMusicXml}
          />
          <BottomRail />
        </main>
        <RightRail />
      </div>
      <DiffOverlay />
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
      <TransposeDialog open={transposeOpen} onClose={() => setTransposeOpen(false)} />
      <GenerateScoreDialog open={generateOpen} onClose={() => setGenerateOpen(false)} />
      <OrchestrationDialog open={orchestrationOpen} onClose={() => setOrchestrationOpen(false)} />
      <AudioImportDialog open={audioImportOpen} onClose={() => setAudioImportOpen(false)} />
      <GuitarProPreview
        open={gpPreview != null}
        filename={gpPreview?.filename ?? null}
        bytes={gpPreview?.bytes ?? null}
        importing={gpImporting}
        onCancel={() => setGpPreview(null)}
        onImport={() => void confirmGpImport()}
      />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onOpenNewProject={() => setNewDialog(true)}
        onOpenExport={() => setExportOpen(true)}
        onOpenTranspose={() => setTransposeOpen(true)}
        onOpenGenerate={() => setGenerateOpen(true)}
        onOpenOrchestration={() => setOrchestrationOpen(true)}
        onOpenAudioImport={() => setAudioImportOpen(true)}
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
