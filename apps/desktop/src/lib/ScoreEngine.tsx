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

import type { MixerSnapshot } from "../audio/Mixer";
import { Player, type LoopRegion, type PlayerStatus } from "../audio/Player";
import type { EditorState } from "../editor/EditorState";
import {
  type EditorPreferences,
  loadEditorPreferences,
} from "../editor/EditorPreferences";
import {
  initialSelectionState,
  type MeasureRange,
  type SelectedNote,
  type SelectionState,
} from "../editor/SelectionState";
import {
  advanceCursor,
  bumpOctave,
  clearPendingTie,
  initialEditorState,
  markInserted,
  moveCursor,
  setDuration,
  setPendingTie,
  toggleDot,
} from "../editor/EditorState";
import {
  buildSciPitch,
  type EditorIntent,
  resolveDuration,
} from "../editor/noteGrammar";
import {
  OperationLogState,
  buildScoreReplaceOp,
  buildScoreTransposeOp,
} from "../project/OperationLog";
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
  type Articulation,
  type ChatMessage,
  type Dynamic,
  type ExtractedScore,
  type KeyEstimate,
  type ListedNoteRow,
  type ScoreDiff,
  type TieType,
  type ToolCallRecord,
} from "./api";
import { logEngineFailure, userFacingEditMessage } from "./engineLog";
import { resolveNoteForEdit } from "../notation/noteResolve";

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

  /* --- editor slice (M1.1) ----------------------------------------- */
  editor: EditorState;
  editorError: string | null;
  editorBusy: boolean;

  /* --- transport / mixer slice (M1.2) ------------------------------ */
  mixer: MixerSnapshot;
  loop: LoopRegion | null;
  clickEnabled: boolean;
  countInBars: number;

  /* --- agent diff slice (M1.4) ------------------------------------ */
  pendingDiff: ScoreDiff | null;
  acceptPendingDiff: () => Promise<void>;
  rejectPendingDiff: () => void;

  /* --- MIDI recording slice (M1.6) -------------------------------- */
  recordMode: boolean;
  setRecordMode: (active: boolean) => void;

  /* --- EditLayer slice (M1.7) ------------------------------------- */
  selection: SelectionState;
  editorPreferences: EditorPreferences;
  captureMode: boolean;
  setCaptureMode: (active: boolean) => void;
  selectNote: (note: SelectedNote | null) => void;
  setMeasureRange: (range: MeasureRange | null) => void;
  setEditorPreferences: (prefs: EditorPreferences) => void;
  editNoteDuration: (note: SelectedNote, duration_quarters: number) => Promise<void>;
  editNoteArticulation: (note: SelectedNote, articulation: Articulation) => Promise<void>;
  editNoteDynamic: (note: SelectedNote, dynamic: Dynamic) => Promise<void>;
  editNoteRespell: (note: SelectedNote) => Promise<void>;
  editNotePitch: (note: SelectedNote, pitch: string) => Promise<void>;
  transposeNote: (note: SelectedNote, semitones: number) => Promise<void>;
  removeNoteAt: (note: SelectedNote) => Promise<void>;
  applyDetectedKey: (tonic: string, mode: string) => Promise<void>;

  loadFromXml: (filename: string, musicxml: string) => Promise<void>;
  loadFromUrl: (url: string, filename?: string) => Promise<void>;
  play: () => void;
  stop: () => void;
  transpose: (target_key: string) => Promise<void>;
  transposeRegion: (
    target: { target_key?: string; interval_name?: string },
    range: { measure_start: number; measure_end: number; part_indices?: number[] },
  ) => Promise<{ warnings: number } | null>;
  sendChat: (text: string) => Promise<void>;
  resetChat: () => void;

  refreshRecents: () => Promise<void>;
  newProject: (spec: NewProjectSpec) => Promise<void>;
  replaceScore: (filename: string, musicxml: string) => Promise<void>;
  openProject: (path: string) => Promise<void>;
  openProjectViaDialog: () => Promise<void>;
  closeProject: () => Promise<void>;
  saveProject: () => Promise<void>;
  renameProject: (newTitle: string) => Promise<void>;
  deleteProject: (path: string) => Promise<void>;
  acceptPendingRecovery: () => Promise<void>;
  discardPendingRecovery: () => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;

  /* editor (M1.1) */
  handleEditorIntent: (intent: EditorIntent) => Promise<void>;
  insertNoteAtCursor: (
    pitch: string,
    duration_quarters: number,
  ) => Promise<void>;
  insertRestAtCursor: (duration_quarters: number) => Promise<void>;
  toggleArticulationOnLast: (articulation: Articulation) => Promise<void>;
  tieLastNote: () => Promise<void>;
  setDynamicAtCursor: (dynamic: Dynamic) => Promise<void>;
  appendMeasure: () => Promise<void>;
  removeLastNote: () => Promise<void>;
  moveCursorBy: (delta_beats: number) => void;
  jumpToNextMeasure: () => void;

  /* transport / mixer (M1.2) */
  setTrackGain: (id: string, gain_db: number) => void;
  setTrackPan: (id: string, pan: number) => void;
  setTrackMute: (id: string, mute: boolean) => void;
  setTrackSolo: (id: string, solo: boolean) => void;
  setMasterGain: (gain_db: number) => void;
  setLoop: (region: LoopRegion | null) => void;
  setClick: (enabled: boolean) => void;
  setCountIn: (bars: number) => void;
  playFrom: (seconds: number) => Promise<void>;
  playFromCursor: () => Promise<void>;
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

  /* M1.4 — pending agent diff. Holds at most one diff at a time so the UI
   * never shows competing previews; the next tool call replaces it. */
  const [pendingDiff, setPendingDiff] = useState<ScoreDiff | null>(null);
  const [recordMode, setRecordModeState] = useState(false);
  const [selection, setSelection] = useState<SelectionState>(initialSelectionState);
  const [editorPreferences, setEditorPreferencesState] = useState<EditorPreferences>(
    () => loadEditorPreferences(),
  );
  const [captureMode, setCaptureModeState] = useState(false);

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

  // -- editor slice ---------------------------------------------------
  const [editor, setEditor] = useState<EditorState>(initialEditorState());
  const [editorError, setEditorError] = useState<string | null>(null);
  const [editorBusy, setEditorBusy] = useState(false);

  // -- transport / mixer slice ---------------------------------------
  const [mixer, setMixer] = useState<MixerSnapshot>({
    master: { gain_db: 0 },
    tracks: [
      { id: "piano", gain_db: 0, pan: 0, mute: false, solo: false },
    ],
  });
  const [loop, setLoopState] = useState<LoopRegion | null>(null);
  const [clickEnabled, setClickEnabledState] = useState(false);
  const [countInBars, setCountInBarsState] = useState(0);

  const playerRef = useRef<Player | null>(null);
  const opLogRef = useRef<OperationLogState>(new OperationLogState());
  const scoreRef = useRef<LoadedScore | null>(null);
  const scoreNotesRef = useRef<ListedNoteRow[]>([]);
  const [scoreNotes, setScoreNotes] = useState<ListedNoteRow[]>([]);

  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  useEffect(() => {
    scoreNotesRef.current = scoreNotes;
  }, [scoreNotes]);

  const refreshNoteIndex = useCallback((musicxml: string) => {
    void api
      .listScoreNotes(musicxml)
      .then((res) => setScoreNotes(res.notes))
      .catch((err) => logEngineFailure("edit", err));
  }, []);

  useEffect(() => {
    if (!score?.musicxml) {
      setScoreNotes([]);
      return;
    }
    refreshNoteIndex(score.musicxml);
  }, [score?.musicxml, refreshNoteIndex]);

  const resolveNoteForApi = useCallback(async (note: SelectedNote): Promise<SelectedNote> => {
    const local = resolveNoteForEdit(note, scoreNotesRef.current);
    const current = scoreRef.current;
    if (!current) return local;
    try {
      const row = await api.resolveScoreNote({
        musicxml: current.musicxml,
        measure_number: local.measure_number,
        pitch: local.pitch,
        beat_hint: local.beat_offset,
      });
      return {
        part_index: row.part_index,
        measure_number: row.measure_number,
        beat_offset: row.beat_offset,
        voice: row.voice,
        pitch: row.pitch,
        duration_quarters: row.duration_quarters,
        part_name: row.part_name,
        midi: row.midi,
      };
    } catch {
      return local;
    }
  }, []);

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
        logEngineFailure("save", err);
        setIsDirty(true);
        return handle;
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
      setEditor(initialEditorState());
      setEditorError(null);
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

  const renameProject = useCallback(
    async (newTitle: string) => {
      if (!project) return;
      await projectPersistence.renameProject(project.path, newTitle);
      setProject((prev) =>
        prev ? { ...prev, meta: { ...prev.meta, title: newTitle } } : null,
      );
      void refreshRecents();
    },
    [project, refreshRecents],
  );

  const deleteProject = useCallback(
    async (path: string) => {
      await projectPersistence.deleteProject(path);
      if (project?.path === path) {
        setProject(null);
        setScore(null);
        setIsDirty(false);
        setLastSavedAt(null);
        setPendingRecovery(null);
        opLogRef.current = new OperationLogState();
        setOpVersion((n) => n + 1);
      }
      void refreshRecents();
    },
    [project, refreshRecents],
  );

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
    player.setTempo(s.extracted.tempo_bpm);
    player.setCountIn(countInBars);
    player.setClick(clickEnabled);
    player.setLoop(loop);
    player.setMixerSnapshot(mixer);
    void player.play(s.extracted.notes, s.extracted.duration_sec);
  }, [score, countInBars, clickEnabled, loop, mixer]);

  const stop = useCallback(() => {
    playerRef.current?.stop();
    setPositionSec(0);
  }, []);

  const playFrom = useCallback(
    async (seconds: number) => {
      const s = score;
      const player = playerRef.current;
      if (!s || !player) return;
      player.setTempo(s.extracted.tempo_bpm);
      player.setCountIn(countInBars);
      player.setClick(clickEnabled);
      player.setLoop(loop);
      player.setMixerSnapshot(mixer);
      await player.play(s.extracted.notes, s.extracted.duration_sec, seconds);
    },
    [score, countInBars, clickEnabled, loop, mixer],
  );

  const playFromCursor = useCallback(async () => {
    const s = score;
    if (!s) return;
    // Convert editor cursor (measure + beat) to seconds via the score's
    // tempo. M1.3 will replace this with music21-aware mapping per measure.
    const beatsPerBar = 4;
    const beatSec = 60 / Math.max(s.extracted.tempo_bpm, 1);
    const seconds =
      (editor.cursor.measure_number - 1) * beatsPerBar * beatSec +
      editor.cursor.beat_offset * beatSec;
    await playFrom(seconds);
  }, [score, editor.cursor, playFrom]);

  /* ------------------ Mixer mutators ------------------------------- */

  const updateMixer = useCallback((updater: (prev: MixerSnapshot) => MixerSnapshot) => {
    setMixer((prev) => {
      const next = updater(prev);
      playerRef.current?.setMixerSnapshot(next);
      return next;
    });
  }, []);

  const setTrackGain = useCallback(
    (id: string, gain_db: number) => {
      updateMixer((prev) => ({
        ...prev,
        tracks: prev.tracks.map((t) => (t.id === id ? { ...t, gain_db } : t)),
      }));
    },
    [updateMixer],
  );

  const setTrackPan = useCallback(
    (id: string, pan: number) => {
      updateMixer((prev) => ({
        ...prev,
        tracks: prev.tracks.map((t) => (t.id === id ? { ...t, pan } : t)),
      }));
    },
    [updateMixer],
  );

  const setTrackMute = useCallback(
    (id: string, mute: boolean) => {
      updateMixer((prev) => ({
        ...prev,
        tracks: prev.tracks.map((t) => (t.id === id ? { ...t, mute } : t)),
      }));
    },
    [updateMixer],
  );

  const setTrackSolo = useCallback(
    (id: string, solo: boolean) => {
      updateMixer((prev) => ({
        ...prev,
        tracks: prev.tracks.map((t) => (t.id === id ? { ...t, solo } : t)),
      }));
    },
    [updateMixer],
  );

  const setMasterGain = useCallback(
    (gain_db: number) => {
      updateMixer((prev) => ({ ...prev, master: { gain_db } }));
    },
    [updateMixer],
  );

  const setLoop = useCallback((region: LoopRegion | null) => {
    setLoopState(region);
    playerRef.current?.setLoop(region);
  }, []);

  const setClick = useCallback((enabled: boolean) => {
    setClickEnabledState(enabled);
    playerRef.current?.setClick(enabled);
  }, []);

  const setCountIn = useCallback((bars: number) => {
    setCountInBarsState(bars);
    playerRef.current?.setCountIn(bars);
  }, []);

  // Keep the live engine in sync with mixer / loop changes.
  useEffect(() => {
    playerRef.current?.setMixerSnapshot(mixer);
  }, [mixer]);

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

  const replaceScore = useCallback(
    async (filename: string, musicxml: string) => {
      if (!score) return;
      const op = buildScoreReplaceOp(
        {
          previousMusicXml: score.musicxml,
          nextMusicXml: musicxml,
          reason: `Imported ${filename}`,
          description: `Imported ${filename}`,
        },
        opLogRef.current.nextIndex,
      );
      await applyAndPersistOperation(musicxml, op);
    },
    [score, applyAndPersistOperation],
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

  const transposeRegion = useCallback(
    async (
      target: { target_key?: string; interval_name?: string },
      range: { measure_start: number; measure_end: number; part_indices?: number[] },
    ) => {
      if (!score) return null;
      setLoading(true);
      setLoadError(null);
      try {
        const result = await api.transposeRegion({
          musicxml: score.musicxml,
          target_key: target.target_key,
          interval_name: target.interval_name,
          measure_start: range.measure_start,
          measure_end: range.measure_end,
          part_indices: range.part_indices,
        });
        const op = buildScoreTransposeOp(
          {
            previousMusicXml: score.musicxml,
            nextMusicXml: result.musicxml,
            fromKey: result.source_key,
            toKey: result.target_key,
            interval: result.interval,
          },
          opLogRef.current.nextIndex,
        );
        await applyAndPersistOperation(result.musicxml, op);
        return { warnings: result.warnings.length };
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : String(err);
        setLoadError(msg);
        return null;
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

  /* ------------------------ editor (M1.1) -------------------------- */

  const applyEditOp = useCallback(
    async (
      nextMusicXml: string,
      description: string,
    ) => {
      const current = scoreRef.current;
      if (!current) return;
      const previousMusicXml = current.musicxml;
      const filename = current.filename;
      const op = buildScoreReplaceOp(
        {
          previousMusicXml,
          nextMusicXml,
          reason: description,
          description,
        },
        opLogRef.current.nextIndex,
      );

      setScore((prev) => (prev ? { ...prev, musicxml: nextMusicXml } : prev));
      opLogRef.current.append(op);
      setOpVersion((n) => n + 1);
      refreshNoteIndex(nextMusicXml);

      if (project) {
        try {
          await persistProjectSave(project, nextMusicXml, op);
        } catch {
          setIsDirty(true);
        }
      }

      void ingestMusicXml(filename, nextMusicXml)
        .then((derived) => {
          setScore(derived);
        })
        .catch((err) => {
          logEngineFailure("edit", err);
        });
    },
    [ingestMusicXml, project, persistProjectSave, refreshNoteIndex],
  );

  const insertNoteAtCursor = useCallback(
    async (pitch: string, duration_quarters: number) => {
      if (!score) return;
      setEditorBusy(true);
      setEditorError(null);
      try {
        const result = await api.insertNote({
          musicxml: score.musicxml,
          ...editor.cursor,
          voice: editor.cursor.voice,
          pitch,
          duration_quarters,
          replace: true,
        });
        await applyEditOp(
          result.musicxml,
          `Insert ${result.inserted_note.pitch} (${duration_quarters}q)`,
        );
        setEditor((s) => {
          const next = markInserted(s, { ...s.cursor });
          return {
            ...next,
            cursor: result.next_cursor,
            pending_tie: false,
          };
        });
      } catch (err) {
        setEditorError(userFacingEditMessage(err));
      } finally {
        setEditorBusy(false);
      }
    },
    [score, editor, applyEditOp],
  );

  const insertRestAtCursor = useCallback(
    async (duration_quarters: number) => {
      if (!score) return;
      setEditorBusy(true);
      setEditorError(null);
      try {
        const result = await api.insertRest({
          musicxml: score.musicxml,
          ...editor.cursor,
          voice: editor.cursor.voice,
          duration_quarters,
        });
        await applyEditOp(result.musicxml, `Insert rest (${duration_quarters}q)`);
        setEditor((s) => ({ ...s, cursor: result.next_cursor, pending_tie: false }));
      } catch (err) {
        setEditorError(userFacingEditMessage(err));
      } finally {
        setEditorBusy(false);
      }
    },
    [score, editor, applyEditOp],
  );

  const toggleArticulationOnLast = useCallback(
    async (articulation: Articulation) => {
      if (!score) return;
      const target = editor.last_inserted ?? editor.cursor;
      setEditorBusy(true);
      setEditorError(null);
      try {
        const result = await api.toggleArticulation({
          musicxml: score.musicxml,
          part_index: target.part_index,
          measure_number: target.measure_number,
          beat_offset: target.beat_offset,
          voice: target.voice,
          articulation,
        });
        await applyEditOp(
          result.musicxml,
          `${result.action === "added" ? "Add" : "Remove"} ${articulation}`,
        );
      } catch (err) {
        setEditorError(userFacingEditMessage(err));
      } finally {
        setEditorBusy(false);
      }
    },
    [score, editor, applyEditOp],
  );

  const tieLastNote = useCallback(async () => {
    if (!score || !editor.last_inserted) return;
    setEditorBusy(true);
    setEditorError(null);
    try {
      const result = await api.setTie({
        musicxml: score.musicxml,
        part_index: editor.last_inserted.part_index,
        measure_number: editor.last_inserted.measure_number,
        beat_offset: editor.last_inserted.beat_offset,
        voice: editor.last_inserted.voice,
        tie_type: "start" as TieType,
      });
      await applyEditOp(result.musicxml, "Tie to next");
      setEditor((s) => setPendingTie(s));
    } catch (err) {
      setEditorError(userFacingEditMessage(err));
    } finally {
      setEditorBusy(false);
    }
  }, [score, editor, applyEditOp]);

  const setDynamicAtCursor = useCallback(
    async (dynamic: Dynamic) => {
      if (!score) return;
      setEditorBusy(true);
      setEditorError(null);
      try {
        const result = await api.setDynamic({
          musicxml: score.musicxml,
          part_index: editor.cursor.part_index,
          measure_number: editor.cursor.measure_number,
          beat_offset: editor.cursor.beat_offset,
          dynamic,
        });
        await applyEditOp(result.musicxml, `Dynamic ${dynamic}`);
      } catch (err) {
        setEditorError(userFacingEditMessage(err));
      } finally {
        setEditorBusy(false);
      }
    },
    [score, editor, applyEditOp],
  );

  const appendMeasureCallback = useCallback(async () => {
    if (!score) return;
    setEditorBusy(true);
    setEditorError(null);
    try {
      const result = await api.appendMeasure({
        musicxml: score.musicxml,
        part_index: editor.cursor.part_index,
      });
      await applyEditOp(result.musicxml, `Append measure ${result.new_measure_number}`);
    } catch (err) {
      setEditorError(userFacingEditMessage(err));
    } finally {
      setEditorBusy(false);
    }
  }, [score, editor, applyEditOp]);

  const removeLastNote = useCallback(async () => {
    if (!score || !editor.last_inserted) return;
    setEditorBusy(true);
    setEditorError(null);
    try {
      const result = await api.removeNote({
        musicxml: score.musicxml,
        part_index: editor.last_inserted.part_index,
        measure_number: editor.last_inserted.measure_number,
        beat_offset: editor.last_inserted.beat_offset,
        voice: editor.last_inserted.voice,
      });
      await applyEditOp(result.musicxml, "Remove note");
      setEditor((s) => clearPendingTie({ ...s, last_inserted: null }));
    } catch (err) {
      setEditorError(userFacingEditMessage(err));
    } finally {
      setEditorBusy(false);
    }
  }, [score, editor, applyEditOp]);

  const cursorFromNote = (note: SelectedNote) => ({
    part_index: note.part_index,
    measure_number: note.measure_number,
    beat_offset: note.beat_offset,
    voice: note.voice,
  });

  const syncEditorCursor = useCallback((note: SelectedNote) => {
    setEditor((s) => ({
      ...s,
      cursor: cursorFromNote(note),
      last_inserted: cursorFromNote(note),
      duration_quarters: note.duration_quarters,
    }));
  }, []);

  const selectNote = useCallback(
    (note: SelectedNote | null) => {
      setSelection((s) => ({ ...s, note }));
      if (note) syncEditorCursor(note);
    },
    [syncEditorCursor],
  );

  const setMeasureRange = useCallback((range: MeasureRange | null) => {
    setSelection((s) => ({ ...s, measureRange: range }));
  }, []);

  const setEditorPreferences = useCallback((prefs: EditorPreferences) => {
    setEditorPreferencesState(prefs);
  }, []);

  const setCaptureMode = useCallback((active: boolean) => {
    setCaptureModeState(active);
    if (active) setRecordModeState(true);
  }, []);

  const editNoteDuration = useCallback(
    async (note: SelectedNote, duration_quarters: number) => {
      const current = scoreRef.current;
      if (!current) return;
      setEditorBusy(true);
      setEditorError(null);
      try {
        const target = await resolveNoteForApi(note);
        const result = await api.changeNoteDuration({
          musicxml: current.musicxml,
          ...cursorFromNote(target),
          duration_quarters,
        });
        await applyEditOp(result.musicxml, `Duration → ${duration_quarters}q`);
        selectNote({ ...target, duration_quarters });
      } catch (err) {
        setEditorError(userFacingEditMessage(err));
      } finally {
        setEditorBusy(false);
      }
    },
    [applyEditOp, selectNote, resolveNoteForApi],
  );

  const editNoteArticulation = useCallback(
    async (note: SelectedNote, articulation: Articulation) => {
      const current = scoreRef.current;
      if (!current) return;
      setEditorBusy(true);
      setEditorError(null);
      try {
        const target = await resolveNoteForApi(note);
        const result = await api.toggleArticulation({
          musicxml: current.musicxml,
          ...cursorFromNote(target),
          articulation,
        });
        await applyEditOp(
          result.musicxml,
          `${result.action === "added" ? "Add" : "Remove"} ${articulation}`,
        );
      } catch (err) {
        setEditorError(userFacingEditMessage(err));
      } finally {
        setEditorBusy(false);
      }
    },
    [applyEditOp, resolveNoteForApi],
  );

  const editNoteDynamic = useCallback(
    async (note: SelectedNote, dynamic: Dynamic) => {
      const current = scoreRef.current;
      if (!current) return;
      setEditorBusy(true);
      setEditorError(null);
      try {
        const target = await resolveNoteForApi(note);
        const result = await api.setDynamic({
          musicxml: current.musicxml,
          part_index: target.part_index,
          measure_number: target.measure_number,
          beat_offset: target.beat_offset,
          dynamic,
        });
        await applyEditOp(result.musicxml, `Dynamic ${dynamic}`);
      } catch (err) {
        setEditorError(userFacingEditMessage(err));
      } finally {
        setEditorBusy(false);
      }
    },
    [applyEditOp, resolveNoteForApi],
  );

  const editNoteRespell = useCallback(
    async (note: SelectedNote) => {
      const current = scoreRef.current;
      if (!current) return;
      setEditorBusy(true);
      setEditorError(null);
      try {
        const target = await resolveNoteForApi(note);
        const result = await api.respellNote({
          musicxml: current.musicxml,
          ...cursorFromNote(target),
        });
        await applyEditOp(result.musicxml, `Respell → ${result.pitch}`);
        selectNote({ ...target, pitch: result.pitch });
      } catch (err) {
        setEditorError(userFacingEditMessage(err));
      } finally {
        setEditorBusy(false);
      }
    },
    [applyEditOp, selectNote, resolveNoteForApi],
  );

  const editNotePitch = useCallback(
    async (note: SelectedNote, pitch: string) => {
      const current = scoreRef.current;
      if (!current) return;
      setEditorBusy(true);
      setEditorError(null);
      try {
        const target = await resolveNoteForApi(note);
        const result = await api.changeNotePitch({
          musicxml: current.musicxml,
          ...cursorFromNote(target),
          pitch,
        });
        await applyEditOp(result.musicxml, `Pitch → ${result.pitch}`);
        selectNote({ ...target, pitch: result.pitch });
      } catch (err) {
        setEditorError(userFacingEditMessage(err));
      } finally {
        setEditorBusy(false);
      }
    },
    [applyEditOp, selectNote, resolveNoteForApi],
  );

  const transposeNote = useCallback(
    async (note: SelectedNote, semitones: number) => {
      const current = scoreRef.current;
      if (!current) return;
      setEditorBusy(true);
      setEditorError(null);
      try {
        const target = await resolveNoteForApi(note);
        const result = await api.transposeNoteSemitones({
          musicxml: current.musicxml,
          ...cursorFromNote(target),
          semitones,
        });
        await applyEditOp(
          result.musicxml,
          `Transpose ${semitones > 0 ? "+" : ""}${semitones} st → ${result.pitch}`,
        );
        selectNote({ ...target, pitch: result.pitch });
      } catch (err) {
        setEditorError(userFacingEditMessage(err));
      } finally {
        setEditorBusy(false);
      }
    },
    [applyEditOp, selectNote, resolveNoteForApi],
  );

  const removeNoteAt = useCallback(
    async (note: SelectedNote) => {
      const current = scoreRef.current;
      if (!current) return;
      setEditorBusy(true);
      setEditorError(null);
      try {
        const target = await resolveNoteForApi(note);
        const result = await api.removeNote({
          musicxml: current.musicxml,
          ...cursorFromNote(target),
        });
        await applyEditOp(result.musicxml, "Remove note");
        selectNote(null);
      } catch (err) {
        setEditorError(userFacingEditMessage(err));
      } finally {
        setEditorBusy(false);
      }
    },
    [applyEditOp, selectNote, resolveNoteForApi],
  );

  const applyDetectedKey = useCallback(
    async (tonic: string, mode: string) => {
      if (!score) return;
      setEditorBusy(true);
      setEditorError(null);
      try {
        const result = await api.setKeySignature({
          musicxml: score.musicxml,
          tonic,
          mode,
        });
        await applyEditOp(result.musicxml, `Key signature → ${result.key}`);
        if (project) {
          setProject({
            ...project,
            meta: { ...project.meta, key_signature: result.key },
          });
        }
      } catch (err) {
        setEditorError(userFacingEditMessage(err));
      } finally {
        setEditorBusy(false);
      }
    },
    [score, project, applyEditOp],
  );

  const moveCursorBy = useCallback((delta_beats: number) => {
    setEditor((s) => moveCursor(s, delta_beats));
  }, []);

  const jumpToNextMeasure = useCallback(() => {
    setEditor((s) => moveCursor(s, 0, { next_measure: true }));
  }, []);

  const handleEditorIntent = useCallback(
    async (intent: EditorIntent) => {
      switch (intent.kind) {
        case "insert_note": {
          const pitch = buildSciPitch(intent.letter, intent.accidental, editor.octave);
          const duration = resolveDuration(editor);
          await insertNoteAtCursor(pitch, duration);
          if (editor.pending_tie) await tieLastNote();
          // advance the next cursor was already done by the backend; nothing else.
          break;
        }
        case "insert_rest": {
          const duration = resolveDuration(editor);
          await insertRestAtCursor(duration);
          break;
        }
        case "set_duration":
          setEditor((s) =>
            setDuration(s, intent.duration_quarters, { triplet: intent.triplet }),
          );
          break;
        case "toggle_duration_dot":
          setEditor((s) => toggleDot(s));
          break;
        case "octave_up":
          setEditor((s) => bumpOctave(s, 1));
          break;
        case "octave_down":
          setEditor((s) => bumpOctave(s, -1));
          break;
        case "cursor_prev":
          setEditor((s) => advanceCursor(s, -resolveDuration(s)));
          break;
        case "cursor_next":
          setEditor((s) => advanceCursor(s, resolveDuration(s)));
          break;
        case "cursor_next_measure":
          jumpToNextMeasure();
          break;
        case "remove_last":
          await removeLastNote();
          break;
        case "tie_to_next":
          await tieLastNote();
          break;
        case "toggle_articulation":
          await toggleArticulationOnLast(intent.articulation);
          break;
        case "set_dynamic":
          await setDynamicAtCursor(intent.dynamic);
          break;
      }
    },
    [
      editor,
      insertNoteAtCursor,
      insertRestAtCursor,
      jumpToNextMeasure,
      removeLastNote,
      setDynamicAtCursor,
      tieLastNote,
      toggleArticulationOnLast,
    ],
  );

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

        // Stage the latest score-mutating diff so the overlay can preview it.
        // If a chain of mutating tools ran in one turn, we present the last
        // (which is what the assistant just summarised).
        if (reply.diffs && reply.diffs.length > 0) {
          setPendingDiff(reply.diffs[reply.diffs.length - 1]);
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
    [chat, score],
  );

  const resetChat = useCallback(() => {
    setChat([]);
    setChatError(null);
    setPendingDiff(null);
  }, []);

  const acceptPendingDiff = useCallback(async () => {
    if (!pendingDiff || !score) return;
    // Map ScoreDiff into the operation-log shape. The diff already carries
    // the inverse payload, so Undo composes naturally.
    const op = buildScoreTransposeOp(
      {
        previousMusicXml: score.musicxml,
        nextMusicXml: pendingDiff.preview_musicxml,
        fromKey:
          (pendingDiff.operations[0]?.forward as { from_key?: string } | undefined)?.from_key ??
          null,
        toKey:
          (pendingDiff.operations[0]?.forward as { to_key?: string } | undefined)?.to_key ?? "?",
        interval:
          (pendingDiff.operations[0]?.forward as { interval?: string } | undefined)?.interval ??
          null,
      },
      opLogRef.current.nextIndex,
    );
    await applyAndPersistOperation(pendingDiff.preview_musicxml, op);
    setPendingDiff(null);
  }, [pendingDiff, score, applyAndPersistOperation]);

  const rejectPendingDiff = useCallback(() => {
    setPendingDiff(null);
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
      editor,
      editorError,
      editorBusy,
      mixer,
      loop,
      clickEnabled,
      countInBars,
      loadFromXml,
      loadFromUrl,
      play,
      stop,
      transpose,
      transposeRegion,
      sendChat,
      resetChat,
      refreshRecents,
      newProject,
      replaceScore,
      openProject,
      openProjectViaDialog,
      closeProject,
      saveProject,
      renameProject,
      deleteProject,
      acceptPendingRecovery,
      discardPendingRecovery,
      undo,
      redo,
      handleEditorIntent,
      insertNoteAtCursor,
      insertRestAtCursor,
      toggleArticulationOnLast,
      tieLastNote,
      setDynamicAtCursor,
      appendMeasure: appendMeasureCallback,
      removeLastNote,
      moveCursorBy,
      jumpToNextMeasure,
      setTrackGain,
      setTrackPan,
      setTrackMute,
      setTrackSolo,
      setMasterGain,
      setLoop,
      setClick,
      setCountIn,
      playFrom,
      playFromCursor,
      pendingDiff,
      acceptPendingDiff,
      rejectPendingDiff,
      recordMode,
      setRecordMode: setRecordModeState,
      selection,
      editorPreferences,
      captureMode,
      setCaptureMode,
      selectNote,
      setMeasureRange,
      setEditorPreferences,
      editNoteDuration,
      editNoteArticulation,
      editNoteDynamic,
      editNoteRespell,
      editNotePitch,
      transposeNote,
      removeNoteAt,
      applyDetectedKey,
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
      editor,
      editorError,
      editorBusy,
      loadFromXml,
      loadFromUrl,
      play,
      stop,
      transpose,
      transposeRegion,
      sendChat,
      resetChat,
      refreshRecents,
      newProject,
      replaceScore,
      openProject,
      openProjectViaDialog,
      closeProject,
      saveProject,
      renameProject,
      deleteProject,
      acceptPendingRecovery,
      discardPendingRecovery,
      undo,
      redo,
      handleEditorIntent,
      insertNoteAtCursor,
      insertRestAtCursor,
      toggleArticulationOnLast,
      tieLastNote,
      setDynamicAtCursor,
      appendMeasureCallback,
      removeLastNote,
      moveCursorBy,
      jumpToNextMeasure,
      mixer,
      loop,
      clickEnabled,
      countInBars,
      setTrackGain,
      setTrackPan,
      setTrackMute,
      setTrackSolo,
      setMasterGain,
      setLoop,
      setClick,
      setCountIn,
      playFrom,
      playFromCursor,
      pendingDiff,
      acceptPendingDiff,
      rejectPendingDiff,
      recordMode,
      selection,
      editorPreferences,
      captureMode,
      selectNote,
      setMeasureRange,
      setEditorPreferences,
      setCaptureMode,
      editNoteDuration,
      editNoteArticulation,
      editNoteDynamic,
      editNoteRespell,
      editNotePitch,
      transposeNote,
      removeNoteAt,
      applyDetectedKey,
    ],
  );

  return <ScoreEngineContext.Provider value={value}>{children}</ScoreEngineContext.Provider>;
}
