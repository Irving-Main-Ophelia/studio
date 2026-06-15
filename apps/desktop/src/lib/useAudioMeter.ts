import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { isTauri } from "./tauri";

export interface AudioMeterState {
  running: boolean;
  device: string | null;
  peak: number;
  rms: number;
  error: string | null;
}

interface MeterEvent {
  peak: number;
  rms: number;
  device: string;
}

interface MeterStartResponse {
  device: string;
  sample_rate: number;
  channels: number;
}

/**
 * Hook around the Rust CPAL audio meter.
 * Call `start()` from a user gesture (macOS will show a mic permission dialog
 * the first time).
 */
export function useAudioMeter() {
  const [state, setState] = useState<AudioMeterState>({
    running: false,
    device: null,
    peak: 0,
    rms: 0,
    error: null,
  });
  const peakRef = useRef(0);

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: UnlistenFn | null = null;
    listen<MeterEvent>("audio:meter", (evt) => {
      const next = evt.payload;
      // Hold a slow-decay peak in the UI so it doesn't feel jumpy.
      peakRef.current = Math.max(peakRef.current * 0.85, next.peak);
      setState((s) => ({
        ...s,
        peak: peakRef.current,
        rms: next.rms,
        device: next.device,
      }));
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  const start = useCallback(async () => {
    if (!isTauri()) return;
    try {
      const res = await invoke<MeterStartResponse>("start_input_meter");
      setState((s) => ({
        ...s,
        running: true,
        device: res.device,
        error: null,
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        running: false,
        error: typeof err === "string" ? err : String(err),
      }));
    }
  }, []);

  const stop = useCallback(async () => {
    if (!isTauri()) return;
    try {
      await invoke("stop_input_meter");
      peakRef.current = 0;
      setState({ running: false, device: null, peak: 0, rms: 0, error: null });
    } catch (err) {
      setState((s) => ({ ...s, error: typeof err === "string" ? err : String(err) }));
    }
  }, []);

  return { ...state, start, stop };
}
