/**
 * ⌘K command palette — the global navigation surface (UI_DESIGN.md §5).
 *
 * Mirrors the macOS Spotlight / VS Code experience: open with ⌘K, type
 * to filter, Enter to run. Every command is registered here so the
 * shortcut list and the palette never drift apart.
 */

import { Command } from "cmdk";
import {
  Download,
  Eye,
  FileMusic,
  FolderOpen,
  GraduationCap,
  Music,
  Plus,
  Repeat,
  RotateCcw,
  Save,
} from "lucide-react";
import { useEffect, useState } from "react";

import { useScoreEngine } from "../lib/ScoreEngine";

interface CommandItem {
  id: string;
  label: string;
  shortcut?: string;
  icon: React.ReactNode;
  group: "project" | "edit" | "transport" | "agent" | "view";
  disabled?: boolean;
  run: () => void | Promise<void>;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onOpenNewProject: () => void;
  onOpenExport: () => void;
  onOpenTranspose: () => void;
  onFocusTutor: () => void;
}

export function CommandPalette({
  open,
  onClose,
  onOpenNewProject,
  onOpenExport,
  onOpenTranspose,
  onFocusTutor,
}: CommandPaletteProps): React.ReactElement | null {
  const engine = useScoreEngine();
  const [value, setValue] = useState("");

  useEffect(() => {
    if (open) setValue("");
  }, [open]);

  if (!open) return null;

  const items: CommandItem[] = [
    {
      id: "project.new",
      label: "New project…",
      shortcut: "⌘N",
      icon: <Plus size={14} />,
      group: "project",
      run: () => {
        onOpenNewProject();
        onClose();
      },
    },
    {
      id: "project.open",
      label: "Open project…",
      shortcut: "⌘O",
      icon: <FolderOpen size={14} />,
      group: "project",
      run: async () => {
        onClose();
        await engine.openProjectViaDialog();
      },
    },
    {
      id: "project.save",
      label: "Save project",
      shortcut: "⌘S",
      icon: <Save size={14} />,
      group: "project",
      disabled: !engine.project,
      run: async () => {
        onClose();
        if (engine.project) await engine.saveProject();
      },
    },
    {
      id: "edit.undo",
      label: "Undo",
      shortcut: "⌘Z",
      icon: <RotateCcw size={14} />,
      group: "edit",
      disabled: !engine.canUndo,
      run: async () => {
        onClose();
        await engine.undo();
      },
    },
    {
      id: "edit.redo",
      label: "Redo",
      shortcut: "⌘⇧Z",
      icon: <RotateCcw size={14} className="-scale-x-100" />,
      group: "edit",
      disabled: !engine.canRedo,
      run: async () => {
        onClose();
        await engine.redo();
      },
    },
    {
      id: "transport.play",
      label: "Play / pause",
      shortcut: "Space",
      icon: <Music size={14} />,
      group: "transport",
      disabled: !engine.score,
      run: () => {
        onClose();
        if (engine.playerStatus === "playing") engine.stop();
        else engine.play();
      },
    },
    {
      id: "transport.loop4",
      label: engine.loop ? "Clear loop" : "Loop last 4 bars",
      icon: <Repeat size={14} />,
      group: "transport",
      disabled: !engine.score,
      run: () => {
        onClose();
        if (!engine.score) return;
        if (engine.loop) {
          engine.setLoop(null);
        } else {
          const total = engine.score.extracted.duration_sec;
          engine.setLoop({ start_sec: Math.max(0, total - 8), end_sec: total });
        }
      },
    },
    {
      id: "agent.transpose",
      label: "Transpose…",
      icon: <Music size={14} />,
      group: "agent",
      disabled: !engine.score,
      run: () => {
        onClose();
        onOpenTranspose();
      },
    },
    {
      id: "view.tutor",
      label: "Open Theory Tutor",
      shortcut: "⌘E",
      icon: <GraduationCap size={14} />,
      group: "view",
      run: () => {
        onClose();
        onFocusTutor();
      },
    },
    {
      id: "view.export",
      label: "Export…",
      shortcut: "⌘⇧E",
      icon: <Download size={14} />,
      group: "view",
      disabled: !engine.score,
      run: () => {
        onClose();
        onOpenExport();
      },
    },
    {
      id: "view.midi-export",
      label: "Quick export: MIDI",
      icon: <FileMusic size={14} />,
      group: "view",
      disabled: !engine.score,
      run: () => {
        onClose();
        onOpenExport();
      },
    },
    {
      id: "view.eye",
      label: engine.score
        ? `${engine.score.filename} — ${engine.score.keyEstimate?.key ?? "?"}`
        : "No score loaded",
      icon: <Eye size={14} />,
      group: "view",
      disabled: true,
      run: () => undefined,
    },
  ];

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/60 p-32 backdrop-blur"
      onClick={onClose}
    >
      <Command
        loop
        onClick={(e) => e.stopPropagation()}
        className="w-[560px] max-w-[90vw] overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950 text-zinc-100 shadow-2xl"
      >
        <Command.Input
          autoFocus
          value={value}
          onValueChange={setValue}
          placeholder="Type a command or search…"
          className="w-full border-b border-neutral-800 bg-transparent px-4 py-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
        />
        <Command.List className="max-h-[60vh] overflow-y-auto p-2">
          <Command.Empty className="px-3 py-4 text-sm text-zinc-500">
            No matching commands.
          </Command.Empty>
          {["project", "edit", "transport", "agent", "view"].map((group) => (
            <Command.Group
              key={group}
              heading={
                <span className="px-2 py-1 text-[10px] uppercase tracking-widest text-zinc-500">
                  {group}
                </span>
              }
              className="space-y-0.5"
            >
              {items
                .filter((i) => i.group === group)
                .map((item) => (
                  <Command.Item
                    key={item.id}
                    value={`${item.label} ${item.id}`}
                    disabled={item.disabled}
                    onSelect={() => {
                      if (!item.disabled) void item.run();
                    }}
                    className="flex cursor-pointer items-center gap-3 rounded px-2 py-1.5 text-sm text-zinc-300 transition data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-40 data-[selected=true]:bg-neon-cyan/10 data-[selected=true]:text-zinc-50"
                  >
                    <span className="text-neon-cyan">{item.icon}</span>
                    <span className="flex-1">{item.label}</span>
                    {item.shortcut && (
                      <span className="num text-[10px] text-zinc-500">{item.shortcut}</span>
                    )}
                  </Command.Item>
                ))}
            </Command.Group>
          ))}
        </Command.List>
      </Command>
    </div>
  );
}
