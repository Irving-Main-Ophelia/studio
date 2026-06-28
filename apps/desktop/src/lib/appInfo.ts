/**
 * Single source of truth for the app's identity strings.
 *
 * - `APP_VERSION` comes from `package.json` (kept in sync with `Cargo.toml` and
 *   `tauri.conf.json` at release time). In Tauri mode the native `app_info`
 *   command returns the built binary's version, which is authoritative there.
 * - `APP_PHASE` is the roadmap phase. It lives **only** here — the native side no
 *   longer hardcodes it (see `src-tauri/src/lib.rs`), so "what phase are we in" is
 *   a one-line edit. See docs/phases/README.md for the phase list.
 *
 * Reconciled June 27, 2026 (M3.5.0): replaces the hardcoded `phase: "0"` that
 * used to live in `App.tsx` and the stale `phase: "1"` in `lib.rs`.
 */
import pkg from "../../package.json";

export const APP_NAME = "Stockhausen";
export const APP_VERSION: string = pkg.version;
export const APP_PHASE = "3.5";
