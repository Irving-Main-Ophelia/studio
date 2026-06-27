/**
 * Editor preference toggles — voice-leading warnings, cadence hints, import options.
 */

import { X } from "lucide-react";
import { useState } from "react";

import {
  DEFAULT_EDITOR_PREFERENCES,
  type EditorPreferences,
  loadEditorPreferences,
  saveEditorPreferences,
} from "./EditorPreferences";

interface EditorSettingsPanelProps {
  open: boolean;
  onClose: () => void;
  onChange?: (prefs: EditorPreferences) => void;
}

export function EditorSettingsPanel({
  open,
  onClose,
  onChange,
}: EditorSettingsPanelProps): React.ReactElement | null {
  const [prefs, setPrefs] = useState<EditorPreferences>(() => loadEditorPreferences());

  if (!open) return null;

  function update(patch: Partial<EditorPreferences>) {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    saveEditorPreferences(next);
    onChange?.(next);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[400px] rounded-lg border border-obsidian-600 bg-obsidian-900 p-5 text-sm text-zinc-200 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-medium">Editor Settings</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-zinc-500 hover:text-zinc-200">
            <X size={16} />
          </button>
        </div>

        <Toggle
          label="Voice-leading warnings on paste"
          hint="Parallel fifths/octaves. Off by default — contemporary music often uses them on purpose."
          checked={prefs.voiceLeadingWarnings}
          onChange={(v) => update({ voiceLeadingWarnings: v })}
        />
        <Toggle
          label="Cadence suggestions"
          hint="Suggest resolution when a phrase ends on V without I."
          checked={prefs.cadenceSuggestions}
          onChange={(v) => update({ cadenceSuggestions: v })}
        />
        <Toggle
          label="Quantize on audio import"
          hint="Snap transcribed rhythms to the beat grid (humanized keeps performance timing)."
          checked={prefs.quantizeOnImport}
          onChange={(v) => update({ quantizeOnImport: v })}
        />
        <Toggle
          label="Key suggestion after import"
          hint="Detect tonal center and offer to apply the key signature."
          checked={prefs.keySuggestionOnImport}
          onChange={(v) => update({ keySuggestionOnImport: v })}
        />

        <button
          type="button"
          className="mt-4 w-full rounded border border-obsidian-600 py-1.5 text-xs text-zinc-400 hover:bg-obsidian-800"
          onClick={() => {
            setPrefs({ ...DEFAULT_EDITOR_PREFERENCES });
            saveEditorPreferences(DEFAULT_EDITOR_PREFERENCES);
            onChange?.(DEFAULT_EDITOR_PREFERENCES);
          }}
        >
          Reset to defaults
        </button>
      </div>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="mb-3 flex cursor-pointer gap-3 rounded-md border border-obsidian-700/60 p-3 hover:bg-obsidian-800/50">
      <input
        type="checkbox"
        className="mt-0.5 accent-neon-violet"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="block text-sm text-zinc-200">{label}</span>
        <span className="mt-0.5 block text-[11px] text-zinc-500">{hint}</span>
      </span>
    </label>
  );
}
