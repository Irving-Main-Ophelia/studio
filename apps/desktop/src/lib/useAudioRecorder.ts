import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { isTauri } from "./tauri";

/** Count-in / punch window (Phase-5 B1). Mirrors `recorder::RecordOptions`. */
export interface RecordOptions {
  /** Seconds discarded at the head of the take (count-in click isn't recorded). */
  count_in_secs?: number;
  /** Don't write before this second. */
  punch_in_secs?: number | null;
  /** Stop writing at this second. */
  punch_out_secs?: number | null;
}

/** Returned by `start_recording`. Mirrors `recorder::RecordStartResponse`. */
export interface RecordStartResponse {
  take_id: string;
  path: string;
  device: string;
  sample_rate: number;
  channels: number;
}

/** Returned by `stop_recording`. Mirrors `recorder::RecordSummary`. */
export interface RecordSummary {
  take_id: string;
  path: string;
  sample_rate: number;
  channels: number;
  /** Per-channel frame count. */
  frames: number;
  duration_secs: number;
  /** Ring-overflow count; should be 0. */
  dropped_samples: number;
}

interface RecordEvent {
  take_id: string;
  frames: number;
  peak: number;
}

export interface AudioRecorderState {
  recording: boolean;
  takeId: string | null;
  /** Per-channel frames captured so far (from the `audio:record` event). */
  frames: number;
  /** Capture sample rate (from the start response); lets callers show seconds. */
  sampleRate: number | null;
  peak: number;
  lastSummary: RecordSummary | null;
  error: string | null;
}

/**
 * Hook around the native (Rust/CPAL) audio recorder (ADR-0022). Capture and
 * monitoring stay native — the browser only *displays* level + progress via the
 * `audio:record` event; it never receives the audio samples. Call
 * `start(projectPath)` from a user gesture (macOS shows a mic-permission dialog
 * the first time). The take lands in `<projectPath>/takes/`.
 */
export function useAudioRecorder() {
  const [state, setState] = useState<AudioRecorderState>({
    recording: false,
    takeId: null,
    frames: 0,
    sampleRate: null,
    peak: 0,
    lastSummary: null,
    error: null,
  });
  const peakRef = useRef(0);

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: UnlistenFn | null = null;
    listen<RecordEvent>("audio:record", (evt) => {
      const next = evt.payload;
      // Slow-decay peak so the meter doesn't flicker.
      peakRef.current = Math.max(peakRef.current * 0.85, next.peak);
      setState((s) => ({
        ...s,
        frames: next.frames,
        peak: peakRef.current,
        takeId: next.take_id,
      }));
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  const start = useCallback(async (projectPath: string, options?: RecordOptions) => {
    if (!isTauri()) return null;
    try {
      const res = await invoke<RecordStartResponse>("start_recording", {
        args: { project_path: projectPath, options: options ?? {} },
      });
      peakRef.current = 0;
      setState((s) => ({
        ...s,
        recording: true,
        takeId: res.take_id,
        frames: 0,
        sampleRate: res.sample_rate,
        peak: 0,
        error: null,
      }));
      return res;
    } catch (err) {
      setState((s) => ({
        ...s,
        recording: false,
        error: typeof err === "string" ? err : String(err),
      }));
      return null;
    }
  }, []);

  const stop = useCallback(async () => {
    if (!isTauri()) return null;
    try {
      const summary = await invoke<RecordSummary>("stop_recording");
      peakRef.current = 0;
      setState((s) => ({
        ...s,
        recording: false,
        takeId: null,
        peak: 0,
        lastSummary: summary,
        error: null,
      }));
      return summary;
    } catch (err) {
      setState((s) => ({
        ...s,
        error: typeof err === "string" ? err : String(err),
      }));
      return null;
    }
  }, []);

  return { ...state, start, stop };
}
