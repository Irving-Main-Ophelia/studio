/**
 * Audio engine — the per-part sampler bank that sits between `Player` and the
 * `Mixer`.
 *
 *      NoteEvent(part_index) ─▶ Engine.startNote(part_index) ─▶ Sampler(part)
 *                                                                   │
 *                                              mixer.ensureTrack("part-N").input
 *                                                                   │
 *                                          gain ─▶ panner ─▶ outputGain ─▶ master
 *
 * The engine owns one `Sampler` per part (a violin on one, a cello on another) and
 * routes each scheduled note to the right one. `Player` keeps its existing public
 * surface; it just delegates note scheduling and preloading here instead of
 * talking to a single `SplendidGrandPiano`.
 *
 * Loading strategy ("ship sound incrementally", PHASE_3_5.md §3.5.8):
 *   1. If a high-fidelity sfizz.wasm sampler is available, use it (not yet — stub).
 *   2. Otherwise, a General-MIDI Soundfont for the resolved instrument.
 *   3. If that fails (offline, unknown instrument) or in "piano-only" low-RAM mode,
 *      fall back to the `SplendidGrandPiano`. The score always makes sound.
 */

import type { Mixer } from "./Mixer";
import {
  PianoSampler,
  type Sampler,
  type SamplerStartOptions,
  SfizzSampler,
  SoundfontSampler,
  resolveInstrument,
} from "./Sampler";

export interface PartInstrument {
  part_index: number;
  instrument_name: string;
}

/** "multi" = a distinct instrument per part; "piano-only" = one piano for all (low-RAM, M2 Air). */
export type SamplingMode = "multi" | "piano-only";

export interface EngineListener {
  /** Coarse load progress for the loading UI. `done`/`total` count samplers. */
  onLoadProgress?(done: number, total: number, label: string): void;
}

/** Stable track id for a part — must match the mixer snapshot ids built in ScoreEngine. */
export function trackIdForPart(partIndex: number): string {
  return `part-${partIndex}`;
}

/** Track id used when no part metadata is known (fresh score / scratch entry). */
export const DEFAULT_TRACK_ID = "piano";

/**
 * Whether the high-fidelity sfizz.wasm sampler is present. False until the WASM
 * binary + a local SFZ sample set are vendored (PHASE_3_5.md §3.5.4 B). Kept as a
 * single switch so the engine's load path already *prefers* sfizz the day it lands.
 */
function isSfizzAvailable(): boolean {
  return false;
}

export class Engine {
  // BaseAudioContext so the engine drives both the live AudioContext and the
  // OfflineAudioContext used for WAV export (M3.5.1 B3).
  private readonly ctx: BaseAudioContext;
  private readonly mixer: Mixer;
  private readonly listener: EngineListener;

  private parts: PartInstrument[] = [];
  private mode: SamplingMode = "multi";

  /** trackId → sampler. */
  private samplers = new Map<string, Sampler>();
  /** The signature of the currently-loaded sampler bank, to avoid redundant reloads. */
  private loadedSignature: string | null = null;
  private loadPromise: Promise<void> | null = null;

  constructor(ctx: BaseAudioContext, mixer: Mixer, listener: EngineListener = {}) {
    this.ctx = ctx;
    this.mixer = mixer;
    this.listener = listener;
  }

  /** Tell the engine which instrument each part should use. Triggers a reload on next preload(). */
  setParts(parts: PartInstrument[]): void {
    this.parts = [...parts].sort((a, b) => a.part_index - b.part_index);
    this.invalidate();
  }

  setMode(mode: SamplingMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.invalidate();
  }

  getMode(): SamplingMode {
    return this.mode;
  }

  private invalidate(): void {
    // Mark the bank stale; the next preload() rebuilds it.
    if (this.signature() !== this.loadedSignature) {
      this.loadedSignature = null;
      this.loadPromise = null;
    }
  }

  private signature(): string {
    if (this.parts.length === 0) return `default|${this.mode}`;
    return this.parts.map((p) => `${p.part_index}:${p.instrument_name}`).join(",") + `|${this.mode}`;
  }

  /**
   * Build + load the sampler bank for the current parts/mode. Idempotent: repeated
   * calls with the same parts/mode resolve immediately. Always resolves — a failed
   * instrument falls back to piano rather than rejecting.
   */
  async preload(): Promise<void> {
    const sig = this.signature();
    if (this.loadedSignature === sig && this.loadPromise) {
      return this.loadPromise;
    }
    this.disposeSamplers();
    this.loadedSignature = sig;
    this.loadPromise = this.buildBank();
    return this.loadPromise;
  }

  private async buildBank(): Promise<void> {
    // Determine the (trackId, instrumentName) set to load.
    const targets: Array<{ trackId: string; instrument: string }> =
      this.parts.length === 0
        ? [{ trackId: DEFAULT_TRACK_ID, instrument: "" }]
        : this.parts.map((p) => ({ trackId: trackIdForPart(p.part_index), instrument: p.instrument_name }));

    const total = targets.length;
    let done = 0;

    await Promise.all(
      targets.map(async ({ trackId, instrument }) => {
        const { input } = this.mixer.ensureTrack(trackId);
        const sampler = await this.loadSamplerWithFallback(input, instrument);
        this.samplers.set(trackId, sampler);
        done += 1;
        this.listener.onLoadProgress?.(done, total, sampler.displayName);
      }),
    );
  }

  /** Try sfizz (if available) → Soundfont → piano. Always resolves to a loaded sampler. */
  private async loadSamplerWithFallback(input: AudioNode, instrumentName: string): Promise<Sampler> {
    const resolved = resolveInstrument(instrumentName);

    if (isSfizzAvailable()) {
      const sfizz = new SfizzSampler(this.ctx, input, resolved.displayName);
      try {
        await sfizz.load();
        return sfizz;
      } catch {
        /* fall through to Soundfont/piano */
      }
    }

    if (this.mode === "multi" && resolved.gm) {
      const font = new SoundfontSampler(this.ctx, input, resolved.gm, resolved.displayName);
      try {
        await font.load();
        return font;
      } catch (err) {
        console.warn(`audio engine: ${resolved.displayName} soundfont failed, using piano:`, err);
      }
    }

    const piano = new PianoSampler(this.ctx, input, resolved.displayName);
    await piano.load();
    return piano;
  }

  /** Route one note to the sampler for `partIndex`, falling back to any loaded sampler. */
  startNote(partIndex: number, opts: SamplerStartOptions): void {
    const sampler =
      this.samplers.get(trackIdForPart(partIndex)) ??
      this.samplers.get(DEFAULT_TRACK_ID) ??
      this.firstSampler();
    sampler?.start(opts);
  }

  private firstSampler(): Sampler | undefined {
    for (const s of this.samplers.values()) return s;
    return undefined;
  }

  stopAll(): void {
    for (const s of this.samplers.values()) s.stop();
  }

  private disposeSamplers(): void {
    for (const s of this.samplers.values()) s.disconnect();
    this.samplers.clear();
  }

  dispose(): void {
    this.disposeSamplers();
    this.loadedSignature = null;
    this.loadPromise = null;
  }
}
