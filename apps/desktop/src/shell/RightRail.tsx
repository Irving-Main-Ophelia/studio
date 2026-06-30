/**
 * Right rail — tabbed panel column (Agent, Tutor, Harmony, Panel, Practice).
 */

import { BarChart3, GraduationCap, Grid3x3, Piano, Sparkles, Users } from "lucide-react";
import { useState } from "react";

import { HarmonyPanel } from "../agent/HarmonyPanel";
import { MultiAgentPanel } from "../agent/MultiAgentPanel";
import { PracticePanel } from "../agent/PracticePanel";
import { TheoryTutor } from "../agent/TheoryTutor";
import { AgentPanel } from "./AgentPanel";
import { FretboardPanel } from "./FretboardPanel";

type Tab = "agent" | "tutor" | "harmony" | "fretboard" | "panel" | "practice";

export function RightRail(): React.ReactElement {
  const [tab, setTab] = useState<Tab>("agent");

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-obsidian-700 bg-obsidian-800/40">
      <div className="flex shrink-0 flex-wrap border-b border-obsidian-700">
        <TabButton
          active={tab === "agent"}
          onClick={() => setTab("agent")}
          icon={<Sparkles size={11} className="text-neon-cyan" />}
          label="Agent"
        />
        <TabButton
          active={tab === "tutor"}
          onClick={() => setTab("tutor")}
          icon={<GraduationCap size={11} className="text-neon-cyan" />}
          label="Tutor"
        />
        <TabButton
          active={tab === "harmony"}
          onClick={() => setTab("harmony")}
          icon={<BarChart3 size={11} className="text-neon-cyan" />}
          label="Harmony"
        />
        <TabButton
          active={tab === "fretboard"}
          onClick={() => setTab("fretboard")}
          icon={<Grid3x3 size={11} className="text-neon-cyan" />}
          label="Fretboard"
        />
        <TabButton
          active={tab === "panel"}
          onClick={() => setTab("panel")}
          icon={<Users size={11} className="text-neon-cyan" />}
          label="Panel"
        />
        <TabButton
          active={tab === "practice"}
          onClick={() => setTab("practice")}
          icon={<Piano size={11} className="text-neon-cyan" />}
          label="Coach"
        />
      </div>
      <div className="min-h-0 flex-1">
        {tab === "agent" && <AgentPanel />}
        {tab === "tutor" && <TheoryTutor />}
        {tab === "harmony" && <HarmonyPanel />}
        {tab === "fretboard" && <FretboardPanel />}
        {tab === "panel" && <MultiAgentPanel />}
        {tab === "practice" && <PracticePanel />}
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
        "flex flex-1 items-center justify-center gap-1 border-b-2 px-2 py-1.5 text-[9px] font-medium uppercase tracking-widest transition-colors",
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
