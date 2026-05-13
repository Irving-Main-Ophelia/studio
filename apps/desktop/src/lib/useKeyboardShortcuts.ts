/**
 * Global keyboard-shortcut registry. M1.0 wires the project lifecycle keys;
 * future milestones extend the registry (note-input grammar in M1.1,
 * transport keys in M1.2, ⌘K command palette in M1.5).
 *
 * On macOS we listen to `Meta` (⌘); on Windows/Linux we listen to `Control`.
 * Both shortcuts are accepted everywhere so the maintainer's external
 * keyboard preferences are honoured.
 */

import { useEffect } from "react";

export type ShortcutHandler = (event: KeyboardEvent) => void | Promise<void>;

export interface ShortcutSpec {
  /** Lowercase letter ("n", "o", "s") or special keys ("z", "y", "k"). */
  key: string;
  /** ⌘ on macOS, Ctrl elsewhere. */
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  handler: ShortcutHandler;
  /** Defaults to true; when true, `event.preventDefault()` is called. */
  preventDefault?: boolean;
}

const isTypableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select";
};

export function useKeyboardShortcuts(shortcuts: ShortcutSpec[]): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // ⌘+S on a focused input is *also* a save. ⌘+N, ⌘+O likewise — those
      // are project-level commands and should beat the browser default. So
      // we only skip typable targets for non-meta keys (e.g. raw "Z").
      const cmd = event.metaKey || event.ctrlKey;
      if (!cmd && isTypableTarget(event.target)) return;
      for (const spec of shortcuts) {
        const matchKey = spec.key.toLowerCase() === event.key.toLowerCase();
        const matchMeta = (spec.meta ?? false) === cmd;
        const matchShift = (spec.shift ?? false) === event.shiftKey;
        const matchAlt = (spec.alt ?? false) === event.altKey;
        if (matchKey && matchMeta && matchShift && matchAlt) {
          if (spec.preventDefault ?? true) event.preventDefault();
          void spec.handler(event);
          return;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcuts]);
}
