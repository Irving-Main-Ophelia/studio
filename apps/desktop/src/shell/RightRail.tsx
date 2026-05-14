/**
 * Right rail — holds the agent chat (always) plus a tabbable Theory Tutor.
 * The tutor lives in the same column to preserve the three-pane layout
 * from UI_DESIGN.md §5 while still surfacing Pillar-8 (M1.4).
 */

import { GraduationCap, Sparkles } from "lucide-react";
import { useState } from "react";

import { TheoryTutor } from "../agent/TheoryTutor";
import { AgentPanel } from "./AgentPanel";

type Tab = "agent" | "tutor";

export function RightRail(): React.ReactElement {
  const [tab, setTab] = useState<Tab>("agent");

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-obsidian-700 bg-obsidian-800/40">
      <div className="flex shrink-0 border-b border-obsidian-700">
        <TabButton
          active={tab === "agent"}
          onClick={() => setTab("agent")}
          icon={<Sparkles size={12} className="text-neon-cyan" />}
          label="Agent"
        />
        <TabButton
          active={tab === "tutor"}
          onClick={() => setTab("tutor")}
          icon={<GraduationCap size={12} className="text-neon-cyan" />}
          label="Tutor"
        />
      </div>
      <div className="min-h-0 flex-1">
        {tab === "agent" ? <AgentPanel /> : <TheoryTutor />}
      </div>
    </aside>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex flex-1 items-center justify-center gap-2 border-b-2 px-3 py-2 text-xs font-medium uppercase tracking-widest transition-colors",
        active
          ? "border-neon-cyan text-zinc-100"
          : "border-transparent text-zinc-500 hover:text-zinc-200",
      ].join(" ")}
    >
      {icon}
      {label}
    </button>
  );
}
