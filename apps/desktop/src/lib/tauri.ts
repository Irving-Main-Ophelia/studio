// Tauri v2 injects window.__TAURI_INTERNALS__ (not __TAURI__ which was v1).
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
