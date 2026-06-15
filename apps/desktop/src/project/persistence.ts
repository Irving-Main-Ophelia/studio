/**
 * Thin Tauri-IPC wrappers for the Rust `persistence::*` commands.
 *
 * In browser mode (dev server without Tauri), falls back to a localStorage
 * shim so that New Project, Open, Save, and Recents all work normally.
 */

import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "../lib/tauri";

import {
  PROJECT_SCHEMA_VERSION,
  type NewProjectSpec,
  type ProjectHandle,
  type RecentProject,
  type SaveRequest,
  type SaveResult,
} from "./types";

// ─── browser-mode localStorage shim ─────────────────────────────────────────

const RECENTS_KEY = "stockhausen:recents";

function _getRecents(): RecentProject[] {
  try {
    return JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]") as RecentProject[];
  } catch {
    return [];
  }
}

function _addRecent(r: RecentProject) {
  const list = _getRecents().filter((x) => x.path !== r.path);
  list.unshift(r);
  localStorage.setItem(RECENTS_KEY, JSON.stringify(list.slice(0, 20)));
}

function _getProject(path: string): ProjectHandle | null {
  try {
    const raw = localStorage.getItem(`stockhausen:project:${path}`);
    return raw ? (JSON.parse(raw) as ProjectHandle) : null;
  } catch {
    return null;
  }
}

function _putProject(handle: ProjectHandle) {
  localStorage.setItem(`stockhausen:project:${handle.path}`, JSON.stringify(handle));
}

const browserPersistence = {
  defaultRoot: (): Promise<string> => Promise.resolve("browser://projects"),

  renameProject: (path: string, newTitle: string): Promise<void> => {
    const handle = _getProject(path);
    if (!handle) return Promise.reject(new Error(`Project not found: ${path}`));
    const updated: ProjectHandle = { ...handle, meta: { ...handle.meta, title: newTitle } };
    _putProject(updated);
    const list = _getRecents().map((r) =>
      r.path === path ? { ...r, title: newTitle } : r,
    );
    localStorage.setItem(RECENTS_KEY, JSON.stringify(list));
    return Promise.resolve();
  },

  deleteProject: (path: string): Promise<void> => {
    localStorage.removeItem(`stockhausen:project:${path}`);
    localStorage.setItem(
      RECENTS_KEY,
      JSON.stringify(_getRecents().filter((r) => r.path !== path)),
    );
    return Promise.resolve();
  },

  newProject: (spec: NewProjectSpec): Promise<ProjectHandle> => {
    const now = new Date().toISOString();
    const id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}`;
    const path = `browser://projects/${id}`;
    const handle: ProjectHandle = {
      path,
      meta: {
        schema_version: PROJECT_SCHEMA_VERSION,
        id,
        title: spec.title,
        composer: spec.composer,
        created_at: now,
        updated_at: now,
        tempo_bpm: spec.tempo_bpm,
        time_signature: spec.time_signature,
        key_signature: spec.key_signature,
        instrumentation: spec.instrumentation,
        mixer: { tracks: [], master: { gain_db: 0 } },
        agent_state: { last_seen_message_count: 0, pinned_explanations: [] },
        composition_brief: null,
        last_op_index: spec.initial_operation.index,
      },
      score_musicxml: spec.initial_musicxml,
      operations: [spec.initial_operation],
      pending_operations: [],
    };
    _putProject(handle);
    _addRecent({ path, title: spec.title, last_opened: now });
    return Promise.resolve(handle);
  },

  openProject: (path: string): Promise<ProjectHandle> => {
    const handle = _getProject(path);
    if (!handle) return Promise.reject(new Error(`Project not found: ${path}`));
    _addRecent({ path, title: handle.meta.title, last_opened: new Date().toISOString() });
    return Promise.resolve(handle);
  },

  openDialog: (): Promise<string | null> => Promise.resolve(null),

  save: (req: SaveRequest): Promise<SaveResult> => {
    const now = new Date().toISOString();
    const existing = _getProject(req.path);
    const ops = existing?.operations ?? [];
    const updated: ProjectHandle = {
      path: req.path,
      meta: { ...req.meta, updated_at: now },
      score_musicxml: req.score_musicxml,
      operations: req.operation ? [...ops, req.operation] : ops,
      pending_operations: [],
    };
    _putProject(updated);
    return Promise.resolve({ updated_at: now, last_op_index: req.meta.last_op_index });
  },

  close: (_path: string): Promise<void> => Promise.resolve(),

  recentList: (): Promise<RecentProject[]> => Promise.resolve(_getRecents()),

  recentForget: (path: string): Promise<void> => {
    localStorage.setItem(
      RECENTS_KEY,
      JSON.stringify(_getRecents().filter((x) => x.path !== path)),
    );
    return Promise.resolve();
  },
};

// ─── Tauri-native implementation ─────────────────────────────────────────────

const tauriPersistence = {
  defaultRoot: () => invoke<string>("project_default_root"),
  newProject: (spec: NewProjectSpec) =>
    invoke<ProjectHandle>("project_new", { spec }),
  openProject: (path: string) =>
    invoke<ProjectHandle>("project_open", { path }),
  openDialog: () => invoke<string | null>("project_open_dialog"),
  save: (req: SaveRequest) => invoke<SaveResult>("project_save", { req }),
  close: (path: string) => invoke<void>("project_close", { path }),
  recentList: () => invoke<RecentProject[]>("project_recent_list"),
  recentForget: (path: string) => invoke<void>("project_recent_forget", { path }),
  // TODO: wire to Rust commands when added
  renameProject: (_path: string, _newTitle: string): Promise<void> =>
    Promise.resolve(),
  deleteProject: (_path: string): Promise<void> => Promise.resolve(),
};

export const projectPersistence = isTauri() ? tauriPersistence : browserPersistence;
