import { useEffect, useRef, useState } from "react";
import { Music, Send, Sparkles, Wrench } from "lucide-react";

import { BACKEND_URL } from "../lib/api";
import { useScoreEngine, type ChatTurn } from "../lib/ScoreEngine";
import type { ToolCallRecord } from "../lib/api";

/**
 * Right rail — the agent chat panel.
 * Wired to POST /agent/chat with the current score attached.
 * Shows a live score context strip (key, bars, tempo) above the chat.
 */
export function AgentPanel() {
  const engine = useScoreEngine();
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-analysis: run key+progression whenever score changes
  const [autoAnalysis, setAutoAnalysis] = useState<string | null>(null);
  const prevScoreHashRef = useRef<string | null>(null);

  useEffect(() => {
    const xml = engine.score?.musicxml;
    if (!xml) { setAutoAnalysis(null); return; }
    // simple hash to detect real changes
    const hash = xml.length + xml.slice(0, 80);
    if (hash === prevScoreHashRef.current) return;
    prevScoreHashRef.current = hash;

    // Fire-and-forget: light analysis
    void (async () => {
      try {
        const [keyRes, progRes] = await Promise.all([
          fetch(`${BACKEND_URL}/theory/progression`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ musicxml: xml }),
          }),
          fetch(`${BACKEND_URL}/theory/form`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ musicxml: xml }),
          }),
        ]);
        const prog = keyRes.ok ? (await keyRes.json()) as { key?: string; mode?: string; chords?: unknown[] } : null;
        const form = progRes.ok ? (await progRes.json()) as { sections?: { label: string }[] } : null;
        const key = prog?.key ? `${prog.key} ${prog.mode ?? ""}`.trim() : null;
        const chordCount = Array.isArray(prog?.chords) ? prog!.chords.length : 0;
        const sections = form?.sections?.map((s) => s.label).join(" · ") ?? null;
        setAutoAnalysis([key, chordCount ? `${chordCount} chords` : null, sections]
          .filter(Boolean).join(" · "));
      } catch {
        // silent — analysis is best-effort
      }
    })();
  }, [engine.score]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [engine.chat, engine.chatBusy]);

  const offline = engine.backendOnline === false;

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || engine.chatBusy) return;
    setDraft("");
    await engine.sendChat(text);
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-obsidian-700 px-3 py-2 text-xs">
        <div className="flex items-center gap-2 text-zinc-400">
          <Sparkles size={12} className="text-neon-cyan" />
          <span className="font-medium tracking-wide text-zinc-200">Conversation</span>
        </div>
        <span className="num text-[10px] uppercase tracking-widest text-zinc-500">
          {engine.chatBusy ? "thinking…" : offline ? "offline" : "idle"}
        </span>
      </div>

      {/* Live score context strip — always visible when a score is loaded */}
      {engine.score && (
        <div className="shrink-0 border-b border-obsidian-700/60 bg-obsidian-800/40 px-3 py-1.5">
          <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
            <Music size={9} className="shrink-0 text-neon-violet/70" />
            <span className="truncate font-medium text-zinc-300">
              {engine.project?.meta.title ?? "Untitled"}
            </span>
            {engine.score.keyEstimate && (
              <span className="ml-1 text-neon-cyan/80">
                {engine.score.keyEstimate.key} {engine.score.keyEstimate.mode}
              </span>
            )}
          </div>
          {autoAnalysis && (
            <p className="mt-0.5 truncate text-[9px] text-zinc-500">{autoAnalysis}</p>
          )}
        </div>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto p-3 text-sm">
        <AgentBubble role="assistant">
          Welcome. What do we write today?
          <p className="mt-1 text-[11px] text-zinc-500">
            Try: <em>“what key is this in?”</em> or{" "}
            <em>“transpose to F minor”</em>
          </p>
        </AgentBubble>

        {engine.chat.map((turn, i) => (
          <ChatTurnView key={i} turn={turn} />
        ))}

        {engine.chatBusy && (
          <AgentBubble role="assistant">
            <span className="inline-block animate-pulse text-zinc-500">…</span>
          </AgentBubble>
        )}

        {engine.chatError && (
          <div className="rounded border border-danger/40 bg-danger/10 p-2 text-[11px] text-danger">
            {engine.chatError}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-obsidian-700 p-3">
        <div
          className={[
            "glass-panel flex items-start gap-2 rounded-lg px-3 py-2 text-sm focus-within:ring-1 focus-within:ring-neon-cyan/50",
            offline ? "opacity-50" : "",
          ].join(" ")}
        >
          <textarea
            ref={inputRef}
            value={draft}
            disabled={offline || engine.chatBusy}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            rows={2}
            placeholder={
              offline
                ? "Agent backend is offline — start it with `pnpm backend:dev`."
                : "Tell me about a piece…"
            }
            className="flex-1 resize-none bg-transparent text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none"
          />
          <button
            onClick={handleSend}
            disabled={!draft.trim() || engine.chatBusy || offline}
            className="mt-0.5 flex items-center justify-center rounded-md p-1 text-zinc-500 transition-colors hover:bg-obsidian-700 hover:text-zinc-200 disabled:opacity-30"
            aria-label="Send"
          >
            <Send size={12} />
          </button>
        </div>
        <p className="mt-2 text-[10px] text-zinc-600">
          Press <kbd className="num">Enter</kbd> to send · <kbd className="num">Shift+Enter</kbd>{" "}
          for newline
        </p>
      </div>
    </div>
  );
}

function ChatTurnView({ turn }: { turn: ChatTurn }) {
  if (turn.role === "user") {
    return <UserBubble>{turn.content}</UserBubble>;
  }
  return (
    <AgentBubble role="assistant">
      <div className="whitespace-pre-wrap">{turn.content}</div>
      {turn.toolCalls && turn.toolCalls.length > 0 && (
        <div className="mt-2 space-y-1">
          {turn.toolCalls.map((c, i) => (
            <ToolCallCard key={i} call={c} />
          ))}
        </div>
      )}
    </AgentBubble>
  );
}

function ToolCallCard({ call }: { call: ToolCallRecord }) {
  const summary = (() => {
    if (call.tool === "theory_analyze_key") {
      const out = call.output as { key?: string; mode?: string; confidence?: number } | undefined;
      if (out?.key) return `${out.key} ${out.mode} (conf ${Math.round((out.confidence ?? 0) * 100)}%)`;
    }
    if (call.tool === "score_transpose") {
      const out = call.output as { from_key?: string; to_key?: string; interval?: string } | undefined;
      if (out?.to_key) return `${out.from_key} → ${out.to_key} (${out.interval})`;
    }
    return call.error ? "error" : "ok";
  })();

  // Render namespaces as dots for human reading: "theory.analyze_key".
  const pretty = call.tool.replace(/_/, ".");

  return (
    <div
      className={[
        "rounded border px-2 py-1 text-[11px]",
        call.error
          ? "border-danger/40 bg-danger/10 text-danger"
          : "border-neon-violet/30 bg-neon-violet/5 text-neon-violet",
      ].join(" ")}
    >
      <div className="flex items-center gap-1.5">
        <Wrench size={10} />
        <span className="font-mono">{pretty}</span>
        <span className="ml-auto text-zinc-400">{summary}</span>
      </div>
    </div>
  );
}

function AgentBubble({ children }: { role: "assistant"; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border-l-2 border-neon-cyan bg-obsidian-700/40 px-3 py-2 text-zinc-200">
      {children}
    </div>
  );
}

function UserBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="ml-6 rounded-lg bg-neon-violet/15 px-3 py-2 text-zinc-200">
      {children}
    </div>
  );
}
