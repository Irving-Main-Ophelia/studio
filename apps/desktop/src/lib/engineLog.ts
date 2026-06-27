import { ApiError } from "../lib/api";

/** Log technical failures to the dev console — not the score UI. */
export function logEngineFailure(scope: "edit" | "save" | "load", err: unknown): void {
  console.error(`[Stockhausen ${scope}]`, err);
}

/**
 * Short, human edit failures (e.g. "No note at beat 3.25") may appear in the UI.
 * Storage quota, network, and stack traces stay in the console only.
 */
export function userFacingEditMessage(err: unknown): string | null {
  if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
    return err.message;
  }
  logEngineFailure("edit", err);
  return null;
}
