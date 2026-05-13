/**
 * Central app state: current score, player, agent chat.
 * Wrapped as a Context so any shell pane can read/dispatch.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Player, type PlayerStatus } from "../audio/Player";
import {
  ApiError,
  api,
  type ChatMessage,
  type ExtractedScore,
  type KeyEstimate,
  type ToolCallRecord,
} from "./api";

export interface LoadedScore {
  filename: string;
  musicxml: string;
  extracted: ExtractedScore;
  keyEstimate?: KeyEstimate;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCallRecord[];
}

interface ScoreEngineValue {
  score: LoadedScore | null;
  loading: boolean;
  loadError: string | null;

  playerStatus: PlayerStatus;
  positionSec: number;

  chat: ChatTurn[];
  chatBusy: boolean;
  chatError: string | null;

  backendOnline: boolean | null;

  loadFromXml: (filename: string, musicxml: string) => Promise<void>;
  loadFromUrl: (url: string, filename?: string) => Promise<void>;
  play: () => void;
  stop: () => void;
  transpose: (target_key: string) => Promise<void>;
  sendChat: (text: string) => Promise<void>;
  resetChat: () => void;
}

const ScoreEngineContext = createContext<ScoreEngineValue | null>(null);

export function useScoreEngine(): ScoreEngineValue {
  const ctx = useContext(ScoreEngineContext);
  if (!ctx) throw new Error("useScoreEngine must be used inside <ScoreEngineProvider/>");
  return ctx;
}

export function ScoreEngineProvider({ children }: { children: React.ReactNode }) {
  const [score, setScore] = useState<LoadedScore | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [playerStatus, setPlayerStatus] = useState<PlayerStatus>("idle");
  const [positionSec, setPositionSec] = useState(0);

  const [chat, setChat] = useState<ChatTurn[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);

  const playerRef = useRef<Player | null>(null);

  useEffect(() => {
    const player = new Player({
      onStatusChange: (status) => setPlayerStatus(status),
      onProgress: (pos) => setPositionSec(pos),
    });
    playerRef.current = player;
    return () => {
      player.dispose();
      playerRef.current = null;
    };
  }, []);

  // Backend health probe on mount.
  useEffect(() => {
    let cancelled = false;
    api
      .health()
      .then(() => !cancelled && setBackendOnline(true))
      .catch(() => !cancelled && setBackendOnline(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const loadFromXml = useCallback(async (filename: string, musicxml: string) => {
    setLoading(true);
    setLoadError(null);
    playerRef.current?.stop();
    try {
      const extracted = await api.extractNotes(musicxml);
      let keyEstimate: KeyEstimate | undefined;
      try {
        keyEstimate = await api.analyzeKey(musicxml);
      } catch {
        keyEstimate = undefined;
      }
      setScore({ filename, musicxml, extracted, keyEstimate });
      setPositionSec(0);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : String(err);
      setLoadError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadFromUrl = useCallback(
    async (url: string, filename?: string) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Could not load ${url}: ${res.statusText}`);
      const text = await res.text();
      const name = filename ?? url.split("/").pop() ?? "score.musicxml";
      await loadFromXml(name, text);
    },
    [loadFromXml],
  );

  const play = useCallback(() => {
    const s = score;
    const player = playerRef.current;
    if (!s || !player) return;
    void player.play(s.extracted.notes, s.extracted.duration_sec);
  }, [score]);

  const stop = useCallback(() => {
    playerRef.current?.stop();
    setPositionSec(0);
  }, []);

  const transpose = useCallback(
    async (target_key: string) => {
      if (!score) return;
      setLoading(true);
      setLoadError(null);
      try {
        const result = await api.transpose(score.musicxml, target_key);
        await loadFromXml(score.filename, result.musicxml);
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : String(err);
        setLoadError(msg);
        setLoading(false);
      }
    },
    [score, loadFromXml],
  );

  const sendChat = useCallback(
    async (text: string) => {
      const userTurn: ChatTurn = { role: "user", content: text };
      const history: ChatTurn[] = [...chat, userTurn];
      setChat(history);
      setChatBusy(true);
      setChatError(null);
      try {
        const messages: ChatMessage[] = history.map((t) => ({
          role: t.role,
          content: t.content,
        }));
        const reply = await api.chat(messages, score?.musicxml ?? null);
        setChat((prev) => [
          ...prev,
          {
            role: "assistant",
            content: reply.reply || "(no reply)",
            toolCalls: reply.tool_calls,
          },
        ]);

        // If a transposition tool ran, refresh the score.
        const transposeCall = reply.tool_calls.find(
          (c) => c.tool === "score.transpose" && !c.error,
        );
        if (transposeCall && score) {
          const output = transposeCall.output as { musicxml?: string } | undefined;
          if (output?.musicxml) {
            await loadFromXml(score.filename, output.musicxml);
          }
        }
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : String(err);
        setChatError(msg);
        setChat((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `(error: ${msg})`,
          },
        ]);
      } finally {
        setChatBusy(false);
      }
    },
    [chat, score, loadFromXml],
  );

  const resetChat = useCallback(() => {
    setChat([]);
    setChatError(null);
  }, []);

  const value: ScoreEngineValue = useMemo(
    () => ({
      score,
      loading,
      loadError,
      playerStatus,
      positionSec,
      chat,
      chatBusy,
      chatError,
      backendOnline,
      loadFromXml,
      loadFromUrl,
      play,
      stop,
      transpose,
      sendChat,
      resetChat,
    }),
    [
      score,
      loading,
      loadError,
      playerStatus,
      positionSec,
      chat,
      chatBusy,
      chatError,
      backendOnline,
      loadFromXml,
      loadFromUrl,
      play,
      stop,
      transpose,
      sendChat,
      resetChat,
    ],
  );

  return <ScoreEngineContext.Provider value={value}>{children}</ScoreEngineContext.Provider>;
}
