/**
 * Editor UX preferences — persisted in localStorage (browser mode) so they
 * survive hot-reload during localhost development.
 */

export interface EditorPreferences {
  /** Warn on parallel fifths/octaves when pasting a fragment. */
  voiceLeadingWarnings: boolean;
  /** Suggest cadence completions at phrase endings. */
  cadenceSuggestions: boolean;
  /** Quantize imported audio to the rhythmic grid (vs keep humanized timing). */
  quantizeOnImport: boolean;
  /** Show key-signature suggestion after audio/MIDI import. */
  keySuggestionOnImport: boolean;
}

const STORAGE_KEY = "stockhausen:editor-preferences";

export const DEFAULT_EDITOR_PREFERENCES: EditorPreferences = {
  voiceLeadingWarnings: false,
  cadenceSuggestions: true,
  quantizeOnImport: false,
  keySuggestionOnImport: true,
};

export function loadEditorPreferences(): EditorPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_EDITOR_PREFERENCES };
    const parsed = JSON.parse(raw) as Partial<EditorPreferences>;
    return { ...DEFAULT_EDITOR_PREFERENCES, ...parsed };
  } catch {
    return { ...DEFAULT_EDITOR_PREFERENCES };
  }
}

export function saveEditorPreferences(prefs: EditorPreferences): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export function patchEditorPreferences(
  patch: Partial<EditorPreferences>,
): EditorPreferences {
  const next = { ...loadEditorPreferences(), ...patch };
  saveEditorPreferences(next);
  return next;
}
