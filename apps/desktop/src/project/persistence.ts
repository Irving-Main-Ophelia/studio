/**
 * Thin Tauri-IPC wrappers for the Rust `persistence::*` commands.
 *
 * Every command is invoked through `@tauri-apps/api/core#invoke`; the
 * payload/return shapes are mirrored in `./types.ts`. Keep the two files in
 * sync — Rust is the source of truth.
 */

import { invoke } from "@tauri-apps/api/core";

import type {
  NewProjectSpec,
  ProjectHandle,
  RecentProject,
  SaveRequest,
  SaveResult,
} from "./types";

export const projectPersistence = {
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
};
