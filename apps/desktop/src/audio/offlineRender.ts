/**
 * Offline WAV render (M3.5.1 B3).
 *
 * Renders the score through the *real* sampler + mixer chain — the same
 * `Engine` and `Mixer` used for live playback — but on an `OfflineAudioContext`,
 * so the exported WAV matches what you hear, instrument timbres and mixer
 * settings included. This replaces the backend sine-bank as the primary WAV
 * path; the sine-bank survives only as a labelled emergency fallback in
 * `export/exporters.ts`.
 */

import { audioBufferToWav } from "smplr";

import type { NoteEvent } from "../lib/api";
import { Engine, type PartInstrument, type SamplingMode } from "./Engine";
import { Mixer, type MixerSnapshot } from "./Mixer";

export interface OfflineRenderOptions {
  notes: NoteEvent[];
  durationSec: number;
  parts: PartInstrument[];
  mixer: MixerSnapshot;
  mode?: SamplingMode;
  sampleRate?: number;
  /** Extra seconds rendered after the last note so releases ring out. */
  tailSec?: number;
}

export async function renderScoreToWav(opts: OfflineRenderOptions): Promise<Blob> {
  if (opts.notes.length === 0) {
    throw new Error("Nothing to render — the score has no notes.");
  }

  const sampleRate = opts.sampleRate ?? 44_100;
  const tail = opts.tailSec ?? 2;
  const length = Math.max(1, Math.ceil((opts.durationSec + tail) * sampleRate));

  const ctx = new OfflineAudioContext({ numberOfChannels: 2, length, sampleRate });

  const mixer = new Mixer(ctx);
  mixer.setSnapshot(opts.mixer);

  const engine = new Engine(ctx, mixer);
  engine.setMode(opts.mode ?? "multi");
  engine.setParts(opts.parts);
  await engine.preload();

  for (const evt of opts.notes) {
    engine.startNote(evt.part_index, {
      note: evt.midi,
      time: evt.start_sec,
      duration: Math.max(0.01, evt.duration_sec),
      velocity: evt.velocity,
    });
  }

  const rendered = await ctx.startRendering();
  engine.dispose();
  return audioBufferToWav(rendered);
}
