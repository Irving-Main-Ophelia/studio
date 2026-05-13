/**
 * Central app state: current project, current score, player, agent chat,
 * autosave, and crash-recovery.
 *
 * Wrapped as a Context so any shell pane can read/dispatch. M1.0 added the
 * project slice (`project`, `operations`, `pendingRecovery`, …) on top of
 * the Phase-0 surface.
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
import { OperationLogState, buildScoreTransposeOp } from "../project/OperationLog";
import { projectPersistence } from "../project/persistence";
import type {
  NewProjectSpec,
  OperationRecord,
  ProjectHandle,
  RecentProject,
} from "../project/types";
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

  /* --- project slice (M1.0) --------------------------------------- */
  project: ProjectHandle | null;
  recents: RecentProject[];
  pendingRecovery: OperationRecord[] | null;
  isDirty: boolean;
  lastSavedAt: string | null;
  saving: boolean;
  saveError: string | null;
  canUndo: boolean;
  canRedo: boolean;

  loadFromXml: (filename: string, musicxml: string) => Promise<void>;
  loadFromUrl: (url: string, filename?: string) => Promise<void>;
  play: () => void;
  stop: () => void;
  transpose: (target_key: string) => Promise<void>;
  sendChat: (text: string) => Promise<void>;
  resetChat: () => void;

  refreshRecents: () => Promise<void>;
  newProject: (spec: NewProjectSpec) => Promise<void>;
  openProject: (path: string) => Promise<void>;
  openProjectViaDialog: () => Promise<void>;
  closeProject: () => Promise<void>;
  saveProject: () => Promise<void>;
  acceptPendingRecovery: () => Promise<void>;
  discardPendingRecovery: () => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

const ScoreEngineContext = createContext<ScoreEngineValue | null>(null);

export function useScoreEngine(): ScoreEngineValue {
  const ctx = useContext(ScoreEngineContext);
  if (!ctx) throw new Error("useScoreEngine must be used inside <ScoreEngineProvider/>");
  return ctx;
}

const AUTOSAVE_INTERVAL_MS = 30_000;

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

  // -- project slice --------------------------------------------------
  const [project, setProject] = useState<ProjectHandle | null>(null);
  const [recents, setRecents] = useState<RecentProject[]>([]);
  const [pendingRecovery, setPendingRecovery] = useState<OperationRecord[] | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [opVersion, setOpVersion] = useState(0); // bump to re-derive canUndo/canRedo

  const playerRef = useRef<Player | null>(null);
  const opLogRef = useRef<OperationLogState>(new OperationLogState());

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

  const refreshRecents = useCallback(async () => {
    try {
      const list = await projectPersistence.recentList();
      setRecents(list);
    } catch (err) {
      console.warn("could not refresh recent projects:", err);
    }
  }, []);

  // Load recent-projects list on mount.
  useEffect(() => {
    void refreshRecents();
  }, [refreshRecents]);

  /* ------------------------ score helpers --------------------------- */

  const ingestMusicXml = useCallback(
    async (filename: string, musicxml: string): Promise<LoadedScore> => {
      const extracted = await api.extractNotes(musicxml);
      let keyEstimate: KeyEstimate | undefined;
      try {
        keyEstimate = await api.analyzeKey(musicxml);
      } catch {
        keyEstimate = undefined;
      }
      return { filename, musicxml, extracted, keyEstimate };
    },
    [],
  );

  const loadFromXml = useCallback(
    async (filename: string, musicxml: string) => {
      setLoading(true);
      setLoadError(null);
      playerRef.current?.stop();
      try {
        const next = await ingestMusicXml(filename, musicxml);
        setScore(next);
        setPositionSec(0);
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : String(err);
        setLoadError(msg);
      } finally {
        setLoading(false);
      }
    },
    [ingestMusicXml],
  );

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

  /* ------------------------ project lifecycle ----------------------- */

  const persistProjectSave = useCallback(
    async (
      handle: ProjectHandle,
      musicxml: string,
      operation: OperationRecord | null,
    ): Promise<ProjectHandle> => {
      setSaving(true);
      setSaveError(null);
      try {
        const result = await projectPersistence.save({
          path: handle.path,
          meta: handle.meta,
          score_musicxml: musicxml,
          operation,
        });
        const next: ProjectHandle = {
          ...handle,
          meta: { ...handle.meta, updated_at: result.updated_at, last_op_index: result.last_op_index },
          score_musicxml: musicxml,
          operations: operation
            ? [...handle.operations, operation]
            : handle.operations,
        };
        setProject(next);
        setLastSavedAt(result.updated_at);
        setIsDirty(false);
        return next;
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : String(err);
        setSaveError(msg);
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  const hydrateFromHandle = useCallback(
    async (
      handle: ProjectHandle,
      derivedScore: LoadedScore,
      newLog: OperationLogState,
    ) => {
      setProject(handle);
      setScore(derivedScore);
      opLogRef.current = newLog;
      setOpVersion((n) => n + 1);
      setPendingRecovery(
        handle.pending_operations.length > 0 ? handle.pending_operations : null,
      );
      setLastSavedAt(handle.meta.updated_at);
      setIsDirty(false);
      setSaveError(null);
      void refreshRecents();
    },
    [refreshRecents],
  );

  const newProject = useCallback(
    async (spec: NewProjectSpec) => {
      setLoading(true);
      setLoadError(null);
      playerRef.current?.stop();
      try {
        const handle = await projectPersistence.newProject(spec);
        const derived = await ingestMusicXml(
          `${handle.meta.title}.musicxml`,
          handle.score_musicxml,
        );
        const log = new OperationLogState(handle.operations);
        await hydrateFromHandle(handle, derived, log);
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : String(err);
        setLoadError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [ingestMusicXml, hydrateFromHandle],
  );

  const openProject = useCallback(
    async (path: string) => {
      setLoading(true);
      setLoadError(null);
      playerRef.current?.stop();
      try {
        const handle = await projectPersistence.openProject(path);
        const derived = await ingestMusicXml(
          `${handle.meta.title}.musicxml`,
          handle.score_musicxml,
        );
        const log = new OperationLogState(handle.operations);
        await hydrateFromHandle(handle, derived, log);
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : String(err);
        setLoadError(msg);
      } finally {
        setLoading(false);
      }
    },
    [ingestMusicXml, hydrateFromHandle],
  );

  const openProjectViaDialog = useCallback(async () => {
    try {
      const path = await projectPersistence.openDialog();
      if (path) {
        await openProject(path);
      }
    } catch (err) {
      setLoadError(String(err));
    }
  }, [openProject]);

  const closeProject = useCallback(async () => {
    if (project) {
      try {
        await projectPersistence.close(project.path);
      } catch (err) {
        console.warn("project_close failed:", err);
      }
    }
    setProject(null);
    setPendingRecovery(null);
    setIsDirty(false);
    setLastSavedAt(null);
    setScore(null);
    setPositionSec(0);
    opLogRef.current = new OperationLogState();
    setOpVersion((n) => n + 1);
    void refreshRecents();
  }, [project, refreshRecents]);

  const saveProject = useCallback(async () => {
    if (!project || !score) return;
    await persistProjectSave(project, score.musicxml, null);
  }, [project, score, persistProjectSave]);

  /* --------------------- 30 s autosave timer ------------------------ */

  useEffect(() => {
    if (!project) return;
    const id = window.setInterval(() => {
      if (!isDirty) return;
      void persistProjectSave(project, score?.musicxml ?? project.score_musicxml, null);
    }, AUTOSAVE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [project, score, isDirty, persistProjectSave]);

  /* ------------------------ transport ------------------------------- */

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

  /* ------------------------ operations ------------------------------ */

  const applyAndPersistOperation = useCallback(
    async (
      nextMusicXml: string,
      operation: OperationRecord,
    ) => {
      const derived = await ingestMusicXml(score?.filename ?? `${operation.kind}.musicxml`, nextMusicXml);
      setScore(derived);
      opLogRef.current.append(operation);
      setOpVersion((n) => n + 1);
      if (project) {
        try {
          await persistProjectSave(project, nextMusicXml, operation);
        } catch {
          setIsDirty(true);
        }
      }
    },
    [ingestMusicXml, score, project, persistProjectSave],
  );

  const transpose = useCallback(
    async (target_key: string) => {
      if (!score) return;
      setLoading(true);
      setLoadError(null);
      try {
        const result = await api.transpose(score.musicxml, target_key);
        const op = buildScoreTransposeOp(
          {
            previousMusicXml: score.musicxml,
            nextMusicXml: result.musicxml,
            fromKey: result.from_key,
            toKey: result.to_key,
            interval: result.interval,
          },
          opLogRef.current.nextIndex,
        );
        await applyAndPersistOperation(result.musicxml, op);
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : String(err);
        setLoadError(msg);
      } finally {
        setLoading(false);
      }
    },
    [score, applyAndPersistOperation],
  );

  /* ------------------------ recovery -------------------------------- */

  const acceptPendingRecovery = useCallback(async () => {
    if (!project || !pendingRecovery || pendingRecovery.length === 0) return;
    setLoading(true);
    setLoadError(null);
    try {
      // Apply each pending op in order. Each one carries a payload that
      // either updates the score (kinds with `musicxml`) or leaves it alone
      // (e.g. meta updates).
      let musicxml = project.score_musicxml;
      let lastIndex = project.meta.last_op_index;
      for (const op of pendingRecovery) {
        const data = op.data as { musicxml?: unknown };
        if (typeof data.musicxml === "string") {
          musicxml = data.musicxml;
        }
        lastIndex = op.index;
      }
      // Persist a single consolidated save: bump last_op_index past the tail.
      const handle: ProjectHandle = {
        ...project,
        meta: { ...project.meta, last_op_index: lastIndex },
      };
      await persistProjectSave(handle, musicxml, null);
      const derived = await ingestMusicXml(`${project.meta.title}.musicxml`, musicxml);
      setScore(derived);
      // Reset the in-memory log to include the recovered tail.
      opLogRef.current = new OperationLogState(project.operations);
      setOpVersion((n) => n + 1);
      setPendingRecovery(null);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : String(err);
      setLoadError(msg);
    } finally {
      setLoading(false);
    }
  }, [project, pendingRecovery, persistProjectSave, ingestMusicXml]);

  const discardPendingRecovery = useCallback(() => {
    setPendingRecovery(null);
  }, []);

  /* ------------------------ undo/redo ------------------------------- */

  const undo = useCallback(async () => {
    if (!opLogRef.current.canUndo()) return;
    const undone = opLogRef.current.undo();
    if (!undone || !undone.inverse) return;
    const state = opLogRef.current.replay({ musicxml: "" });
    const nextXml = state.musicxml || score?.musicxml || "";
    if (!nextXml) return;
    const derived = await ingestMusicXml(
      score?.filename ?? `${undone.kind}.musicxml`,
      nextXml,
    );
    setScore(derived);
    setOpVersion((n) => n + 1);
    // Persist the inverse as a brand-new op (append-only journal discipline).
    if (project) {
      const inverseOp: OperationRecord = {
        ...undone.inverse,
        index: opLogRef.current.nextIndex,
      };
      try {
        await persistProjectSave(project, nextXml, inverseOp);
      } catch {
        setIsDirty(true);
      }
    }
  }, [score, project, ingestMusicXml, persistProjectSave]);

  const redo = useCallback(async () => {
    if (!opLogRef.current.canRedo()) return;
    const redone = opLogRef.current.redo();
    if (!redone) return;
    const data = redone.data as { musicxml?: unknown };
    if (typeof data.musicxml !== "string") return;
    const nextXml = data.musicxml;
    const derived = await ingestMusicXml(
      score?.filename ?? `${redone.kind}.musicxml`,
      nextXml,
    );
    setScore(derived);
    setOpVersion((n) => n + 1);
    if (project) {
      const op: OperationRecord = {
        ...redone,
        id: crypto.randomUUID(),
        index: opLogRef.current.nextIndex,
        description: redone.description ? `Redo: ${redone.description}` : "Redo",
      };
      try {
        await persistProjectSave(project, nextXml, op);
      } catch {
        setIsDirty(true);
      }
    }
  }, [score, project, ingestMusicXml, persistProjectSave]);

  /* ------------------------ chat ------------------------------------ */

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

        // If a transposition tool ran, fold it into the project as an operation.
        const transposeCall = reply.tool_calls.find(
          (c) => c.tool === "score_transpose" && !c.error,
        );
        if (transposeCall && score) {
          const output = transposeCall.output as
            | { musicxml?: string; from_key?: string; to_key?: string; interval?: string }
            | undefined;
          if (output?.musicxml) {
            const op = buildScoreTransposeOp(
              {
                previousMusicXml: score.musicxml,
                nextMusicXml: output.musicxml,
                fromKey: output.from_key ?? null,
                toKey: output.to_key ?? "?",
                interval: output.interval ?? null,
              },
              opLogRef.current.nextIndex,
            );
            await applyAndPersistOperation(output.musicxml, op);
          }
        }
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : String(err);
        setChatError(msg);
        setChat((prev) => [
          ...prev,
          { role: "assistant", content: `(error: ${msg})` },
        ]);
      } finally {
        setChatBusy(false);
      }
    },
    [chat, score, applyAndPersistOperation],
  );

  const resetChat = useCallback(() => {
    setChat([]);
    setChatError(null);
  }, []);

  const canUndo = useMemo(() => {
    void opVersion; // re-derive when ops change
    return opLogRef.current.canUndo();
  }, [opVersion]);

  const canRedo = useMemo(() => {
    void opVersion;
    return opLogRef.current.canRedo();
  }, [opVersion]);

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
      project,
      recents,
      pendingRecovery,
      isDirty,
      lastSavedAt,
      saving,
      saveError,
      canUndo,
      canRedo,
      loadFromXml,
      loadFromUrl,
      play,
      stop,
      transpose,
      sendChat,
      resetChat,
      refreshRecents,
      newProject,
      openProject,
      openProjectViaDialog,
      closeProject,
      saveProject,
      acceptPendingRecovery,
      discardPendingRecovery,
      undo,
      redo,
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
      project,
      recents,
      pendingRecovery,
      isDirty,
      lastSavedAt,
      saving,
      saveError,
      canUndo,
      canRedo,
      loadFromXml,
      loadFromUrl,
      play,
      stop,
      transpose,
      sendChat,
      resetChat,
      refreshRecents,
      newProject,
      openProject,
      openProjectViaDialog,
      closeProject,
      saveProject,
      acceptPendingRecovery,
      discardPendingRecovery,
      undo,
      redo,
    ],
  );

  return <ScoreEngineContext.Provider value={value}>{children}</ScoreEngineContext.Provider>;
}
