import { TopBar } from "./TopBar";
import { ProjectTree } from "./ProjectTree";
import { ScorePane } from "./ScorePane";
import { AgentPanel } from "./AgentPanel";
import { BottomRail } from "./BottomRail";

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
  return (
    <div className="flex h-full w-full flex-col bg-obsidian-900 text-zinc-100">
      <TopBar info={info} />
      <div className="flex flex-1 min-h-0">
        <ProjectTree />
        <main className="flex flex-1 min-w-0 flex-col">
          <ScorePane />
          <BottomRail />
        </main>
        <AgentPanel />
      </div>
    </div>
  );
}
