import { useEffect, useState } from "react";
import { Send, Sparkles } from "lucide-react";

/**
 * Right rail — the agent chat panel.
 *
 * Phase 0 (Week 4) wires this to the FastAPI /agent/chat endpoint.
 * For now we render the welcome message from docs/UI_DESIGN.md §13.
 */
export function AgentPanel() {
  const [cursor, setCursor] = useState(true);

  useEffect(() => {
    const id = window.setInterval(() => setCursor((c) => !c), 600);
    return () => window.clearInterval(id);
  }, []);

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-obsidian-700 bg-obsidian-800/40">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-obsidian-700 px-3 py-2 text-xs">
        <div className="flex items-center gap-2 text-zinc-400">
          <Sparkles size={12} className="text-neon-cyan" />
          <span className="font-medium tracking-wide text-zinc-200">Agent</span>
        </div>
        <span className="num text-[10px] uppercase tracking-widest text-zinc-500">
          Idle
        </span>
      </div>

      {/* Conversation */}
      <div className="flex-1 space-y-3 overflow-y-auto p-3 text-sm">
        <AgentBubble>
          Welcome. What do we write today?
        </AgentBubble>
      </div>

      {/* Composer */}
      <div className="border-t border-obsidian-700 p-3">
        <div className="glass-panel flex items-center rounded-lg px-3 py-2 text-sm">
          <span className="text-zinc-500">Tell me about a piece…</span>
          <span
            aria-hidden
            className={`ml-1 inline-block h-3 w-px translate-y-px bg-neon-cyan transition-opacity ${
              cursor ? "opacity-100" : "opacity-0"
            }`}
          />
          <button
            className="ml-auto flex items-center justify-center rounded-md p-1 text-zinc-500 transition-colors hover:bg-obsidian-700 hover:text-zinc-200"
            aria-label="Send"
            disabled
          >
            <Send size={12} />
          </button>
        </div>
        <p className="mt-2 text-[10px] text-zinc-600">
          Chat is wired in Phase&nbsp;0 · Week&nbsp;4.
        </p>
      </div>
    </aside>
  );
}

function AgentBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border-l-2 border-neon-cyan bg-obsidian-700/40 px-3 py-2 text-zinc-200">
      {children}
    </div>
  );
}
