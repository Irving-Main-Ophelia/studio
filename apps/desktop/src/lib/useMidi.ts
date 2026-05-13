import { useEffect, useState } from "react";

export interface MidiDevice {
  id: string;
  name: string;
  manufacturer: string;
  state: string;
}

export interface MidiEvent {
  device: string;
  status: number;
  data1: number;
  data2: number;
  timestamp: number;
}

export interface MidiState {
  supported: boolean;
  permission: "granted" | "denied" | "prompt" | "unknown";
  inputs: MidiDevice[];
  recent: MidiEvent[];
  error: string | null;
}

const MAX_RECENT = 12;

/**
 * Web MIDI access via the browser's `navigator.requestMIDIAccess()`.
 *
 * WKWebView (Tauri's macOS WebView) supports Web MIDI on macOS Ventura+.
 * If unsupported, `supported` becomes false and the UI degrades gracefully.
 */
export function useMidi() {
  const [state, setState] = useState<MidiState>({
    supported: typeof navigator !== "undefined" && "requestMIDIAccess" in navigator,
    permission: "unknown",
    inputs: [],
    recent: [],
    error: null,
  });

  useEffect(() => {
    if (!state.supported) return;

    let access: MIDIAccess | null = null;
    let cancelled = false;

    (async () => {
      try {
        access = await navigator.requestMIDIAccess({ sysex: false });
        if (cancelled) return;
        setState((s) => ({ ...s, permission: "granted" }));
        const updateInputs = () => {
          if (!access) return;
          const inputs: MidiDevice[] = [];
          access.inputs.forEach((input) => {
            inputs.push({
              id: input.id,
              name: input.name ?? "(unnamed)",
              manufacturer: input.manufacturer ?? "",
              state: input.state,
            });
          });
          setState((s) => ({ ...s, inputs }));
        };

        const attachHandlers = () => {
          if (!access) return;
          access.inputs.forEach((input) => {
            input.onmidimessage = (msg) => {
              const data = msg.data ?? new Uint8Array();
              const evt: MidiEvent = {
                device: input.name ?? "midi",
                status: data[0] ?? 0,
                data1: data[1] ?? 0,
                data2: data[2] ?? 0,
                timestamp: msg.timeStamp,
              };
              setState((s) => ({
                ...s,
                recent: [evt, ...s.recent].slice(0, MAX_RECENT),
              }));
            };
          });
        };

        updateInputs();
        attachHandlers();
        access.onstatechange = () => {
          updateInputs();
          attachHandlers();
        };
      } catch (err) {
        if (cancelled) return;
        setState((s) => ({
          ...s,
          permission: "denied",
          error: String(err),
        }));
      }
    })();

    return () => {
      cancelled = true;
      if (access) {
        access.inputs.forEach((input) => {
          input.onmidimessage = null;
        });
      }
    };
  }, [state.supported]);

  return state;
}
