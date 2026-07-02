/**
 * Thin Tauri-IPC wrappers for the Rust `persistence::*` commands.
 *
 * In browser mode (dev server without Tauri), projects live in IndexedDB
 * (large MusicXML). Recents list stays in localStorage.
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
import {
  deleteBrowserProject,
  getBrowserProject,
  putBrowserProject,
} from "./browserProjectStore";

// ─── browser-mode IndexedDB shim ────────────────────────────────────────────

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

const browserPersistence = {
  defaultRoot: (): Promise<string> => Promise.resolve("browser://projects"),

  renameProject: async (path: string, newTitle: string): Promise<void> => {
    const handle = await getBrowserProject(path);
    if (!handle) throw new Error(`Project not found: ${path}`);
    const updated: ProjectHandle = { ...handle, meta: { ...handle.meta, title: newTitle } };
    await putBrowserProject(updated);
    const list = _getRecents().map((r) =>
      r.path === path ? { ...r, title: newTitle } : r,
    );
    localStorage.setItem(RECENTS_KEY, JSON.stringify(list));
  },

  deleteProject: async (path: string): Promise<void> => {
    await deleteBrowserProject(path);
    localStorage.setItem(
      RECENTS_KEY,
      JSON.stringify(_getRecents().filter((r) => r.path !== path)),
    );
  },

  newProject: async (spec: NewProjectSpec): Promise<ProjectHandle> => {
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
        audio_clips: [],
        markers: [],
        last_op_index: spec.initial_operation.index,
      },
      score_musicxml: spec.initial_musicxml,
      operations: [spec.initial_operation],
      pending_operations: [],
    };
    await putBrowserProject(handle);
    _addRecent({ path, title: spec.title, last_opened: now });
    return handle;
  },

  openProject: async (path: string): Promise<ProjectHandle> => {
    const handle = await getBrowserProject(path);
    if (!handle) throw new Error(`Project not found: ${path}`);
    _addRecent({ path, title: handle.meta.title, last_opened: new Date().toISOString() });
    return handle;
  },

  openDialog: (): Promise<string | null> => Promise.resolve(null),

  save: async (req: SaveRequest): Promise<SaveResult> => {
    const now = new Date().toISOString();
    const existing = await getBrowserProject(req.path);
    const ops = existing?.operations ?? [];
    const updated: ProjectHandle = {
      path: req.path,
      meta: { ...req.meta, updated_at: now },
      score_musicxml: req.score_musicxml,
      operations: req.operation ? [...ops, req.operation] : ops,
      pending_operations: [],
    };
    await putBrowserProject(updated);
    return { updated_at: now, last_op_index: req.meta.last_op_index };
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
  renameProject: (_path: string, _newTitle: string): Promise<void> =>
    Promise.resolve(),
  deleteProject: (_path: string): Promise<void> => Promise.resolve(),
};

export const projectPersistence = isTauri() ? tauriPersistence : browserPersistence;
