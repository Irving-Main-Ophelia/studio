/**
 * Global keyboard listener that translates raw `keydown` events into
 * editor intents while a project is open. Yields to typable targets and
 * to ⌘-based shortcuts so the rest of the shell keeps working.
 */

import { useEffect } from "react";

import { useScoreEngine } from "../lib/ScoreEngine";
import { parseKey } from "./noteGrammar";

const isTypableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select";
};

export function useEditorKeyboard(enabled: boolean): void {
  const engine = useScoreEngine();

  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      const intent = parseKey(event, {
        inTypableTarget: isTypableTarget(event.target),
      });
      if (!intent) return;
      event.preventDefault();
      void engine.handleEditorIntent(intent);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, engine]);
}
