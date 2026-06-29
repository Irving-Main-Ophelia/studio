/**
 * Phase-3.5 audio engine.
 *
 * Built on Web Audio with a real mixer rail in front (per-track gain/pan/mute/solo
 * + master) and a per-part sampler bank behind it (`Engine`): a distinct instrument
 * voice per score part — violin, cello, flute — instead of one piano for everything.
 * The public surface stays exactly as Phase 1 (`play / stop / preload`, loop,
 * count-in, click, play-from-cursor); the multi-instrument upgrade happens entirely
 * inside, behind the unchanged surface (ADR-0010).
 *
 *   - `setLoop(start_sec, end_sec)` to play a region on repeat
 *   - `playFrom(seconds)` to start playback at an arbitrary cursor
 *   - `setClick(enabled)` + `setCountIn(bars)` for the metronome / pre-roll
 *   - `setParts(parts)` to choose the instrument per part (M3.5.1)
 *   - `setSamplingMode("piano-only")` for the low-RAM path (M2 Air)
 *
 * The high-fidelity sfizz.wasm + VSCO 2 CE path slots into the same `Engine`
 * sampler interface when that binary/sample set lands (PHASE_3_5.md §3.5.4 B).
 *
 * Web Audio note: AudioContext must be created (and resumed) from a user
 * gesture. We lazy-create it on first play.
 */

import type { NoteEvent } from "../lib/api";
import { Engine, type PartInstrument, type SamplingMode } from "./Engine";
import { Mixer, type MixerSnapshot } from "./Mixer";

export type PlayerStatus = "idle" | "loading" | "ready" | "playing" | "error";

export interface PlayerListener {
  onStatusChange?(status: PlayerStatus, error?: Error): void;
  onProgress?(positionSec: number): void;
  onEnded?(): void;
  /** Coarse sampler-load progress for the loading UI (M3.5.1). */
  onLoadProgress?(done: number, total: number, label: string): void;
}

export interface LoopRegion {
  start_sec: number;
  end_sec: number;
}

const COUNT_IN_FREQ = 880; // A5 click
const COUNT_IN_DOWNBEAT_FREQ = 1100; // brighter on beat 1

export class Player {
  private context: AudioContext | null = null;
  private engine: Engine | null = null;
  private mixer: Mixer | null = null;
  private parts: PartInstrument[] = [];
  private samplingMode: SamplingMode = "multi";
  private status: PlayerStatus = "idle";
  private listener: PlayerListener;
  private rafHandle: number | null = null;
  private playStart = 0;
  private playDuration = 0;
  private offsetSec = 0;
  private loaded = false;
  private loopRegion: LoopRegion | null = null;
  private clickEnabled = false;
  private countInBars = 0;
  private tempoBpm = 90;
  private beatsPerBar = 4;
  private playbackRate = 1;
  private scheduledClicks: AudioBufferSourceNode[] = [];
  private cachedNotes: NoteEvent[] = [];

  constructor(listener: PlayerListener = {}) {
    this.listener = listener;
  }

  getStatus(): PlayerStatus {
    return this.status;
  }

  getMixer(): Mixer | null {
    return this.mixer;
  }

  private setStatus(status: PlayerStatus, error?: Error) {
    this.status = status;
    this.listener.onStatusChange?.(status, error);
  }

  private ensureContext(): AudioContext {
    if (!this.context) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.context = new Ctor();
      this.mixer = new Mixer(this.context);
      this.engine = new Engine(this.context, this.mixer, {
        onLoadProgress: (done, total, label) => this.listener.onLoadProgress?.(done, total, label),
      });
      this.engine.setMode(this.samplingMode);
      this.engine.setParts(this.parts);
    }
    return this.context;
  }

  /** Choose the instrument per part (M3.5.1). Reloads the sampler bank on next play/preload. */
  setParts(parts: PartInstrument[]): void {
    this.parts = parts;
    this.engine?.setParts(parts);
    // A new instrument bank must be (re)loaded before it can sound.
    this.loaded = false;
  }

  setSamplingMode(mode: SamplingMode): void {
    if (mode === this.samplingMode) return;
    this.samplingMode = mode;
    this.engine?.setMode(mode);
    this.loaded = false;
  }

  getSamplingMode(): SamplingMode {
    return this.samplingMode;
  }

  async preload(): Promise<void> {
    if (this.loaded) return;
    this.setStatus("loading");
    try {
      this.ensureContext();
      await this.engine?.preload();
      this.loaded = true;
      this.setStatus("ready");
    } catch (err) {
      this.setStatus("error", err as Error);
      throw err;
    }
  }

  setMixerSnapshot(snapshot: MixerSnapshot): void {
    this.ensureContext();
    this.mixer?.setSnapshot(snapshot);
  }

  setLoop(region: LoopRegion | null): void {
    this.loopRegion = region && region.end_sec > region.start_sec ? region : null;
  }

  setClick(enabled: boolean): void {
    this.clickEnabled = enabled;
  }

  setCountIn(bars: number): void {
    this.countInBars = Math.max(0, Math.floor(bars));
  }

  setTempo(bpm: number, beatsPerBar = 4): void {
    if (bpm > 0) this.tempoBpm = bpm;
    if (beatsPerBar > 0) this.beatsPerBar = beatsPerBar;
  }

  /**
   * Practice tempo — playback speed **without pitch change** (PHASE_3_5.md §3.5.4 B).
   *
   * With a sampler bank, tempo-without-pitch is exact and free: every voice plays
   * its sample at the natural pitch, so a slower tempo is just the note schedule
   * spread further apart in time. `rate` < 1 = slower, > 1 = faster (clamped to
   * [0.25, 2]). Time-domain stretching of *recorded audio* (Rubber Band / SoundTouch)
   * is a separate, Phase-5 concern; the `rubberband_stretch` Tauri scaffold stays for it.
   */
  setPlaybackRate(rate: number): void {
    this.playbackRate = rate > 0 ? Math.min(2, Math.max(0.25, rate)) : 1;
  }

  getPlaybackRate(): number {
    return this.playbackRate;
  }

  async play(notes: NoteEvent[], totalDurationSec: number, fromSec = 0): Promise<void> {
    await this.preload();
    if (!this.engine || !this.context) return;

    this.stop(); // clears prior playback; also suspends the AudioContext
    await this.context.resume(); // always resume — stop() suspends it
    this.cachedNotes = notes;
    this.playDuration = totalDurationSec;
    this.offsetSec = Math.max(0, fromSec);

    const now = this.context.currentTime;
    const rate = this.playbackRate;
    // beatSec is in *score* seconds; wall-clock spacing is beatSec / rate.
    const beatSec = 60 / this.tempoBpm;
    const countInSec = (this.countInBars * this.beatsPerBar * beatSec) / rate;
    const leadIn = 0.05;
    this.playStart = now + leadIn + countInSec;

    if (countInSec > 0) {
      this.scheduleClickRegion(now + leadIn, countInSec, /*include downbeat */ true);
    }
    if (this.clickEnabled) {
      this.scheduleClickRegion(this.playStart, (totalDurationSec - this.offsetSec) / rate, false);
    }

    this.scheduleNotes(notes, this.playStart, this.offsetSec, this.loopRegion);

    this.setStatus("playing");
    this.tick();
  }

  async playFrom(seconds: number): Promise<void> {
    await this.play(this.cachedNotes, this.playDuration, seconds);
  }

  private scheduleNotes(
    notes: NoteEvent[],
    startTime: number,
    offsetSec: number,
    loop: LoopRegion | null,
  ): void {
    if (!this.engine) return;
    // Score-seconds → wall-clock: divide every offset/duration by the playback rate.
    const rate = this.playbackRate;
    if (loop) {
      const loopLen = loop.end_sec - loop.start_sec;
      const repetitions = Math.max(1, Math.ceil(8 / Math.max(loopLen, 0.001)));
      for (let i = 0; i < repetitions; i++) {
        const cycleOffset = i * loopLen;
        const inLoop = notes.filter(
          (n) => n.start_sec >= loop.start_sec && n.start_sec < loop.end_sec,
        );
        for (const evt of inLoop) {
          const t = startTime + ((evt.start_sec - loop.start_sec) + cycleOffset) / rate;
          this.engine.startNote(evt.part_index, {
            note: evt.midi,
            time: t,
            duration: Math.max(0.01, evt.duration_sec) / rate,
            velocity: evt.velocity,
          });
        }
      }
      this.playDuration = repetitions * loopLen;
      this.offsetSec = 0;
      return;
    }
    for (const evt of notes) {
      if (evt.start_sec + evt.duration_sec < offsetSec) continue;
      this.engine.startNote(evt.part_index, {
        note: evt.midi,
        time: startTime + Math.max(0, evt.start_sec - offsetSec) / rate,
        duration: Math.max(0.01, evt.duration_sec) / rate,
        velocity: evt.velocity,
      });
    }
  }

  /**
   * Schedule a sequence of short bleeps over [startTime, startTime+lengthSec],
   * one per beat. The first beat of every bar is brighter when `accentDownbeat`.
   */
  private scheduleClickRegion(
    startTime: number,
    lengthSec: number,
    accentDownbeat: boolean,
  ): void {
    if (!this.context) return;
    // Wall-clock beat spacing — the click follows the practice tempo too.
    const beatSec = 60 / this.tempoBpm / this.playbackRate;
    let t = startTime;
    let beatIndex = 0;
    while (t < startTime + lengthSec - 1e-3) {
      const isDown = beatIndex % this.beatsPerBar === 0;
      const freq = accentDownbeat && isDown ? COUNT_IN_DOWNBEAT_FREQ : COUNT_IN_FREQ;
      this.scheduleClick(t, freq);
      t += beatSec;
      beatIndex += 1;
    }
  }

  private scheduleClick(time: number, freq: number): void {
    const ctx = this.context;
    if (!ctx || !this.mixer) return;
    const dur = 0.04;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, time);
    env.gain.exponentialRampToValueAtTime(0.4, time + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(env);
    env.connect(this.mixer.destination);
    osc.start(time);
    osc.stop(time + dur + 0.01);
  }

  private tick = () => {
    if (!this.context || this.status !== "playing") return;
    // Report position in *score* seconds: wall-clock elapsed × rate (so the
    // playhead and time label track the score, not the slowed-down wall clock).
    const pos = this.offsetSec + (this.context.currentTime - this.playStart) * this.playbackRate;
    if (pos >= this.playDuration) {
      this.setStatus("ready");
      this.listener.onProgress?.(this.playDuration);
      this.listener.onEnded?.();
      this.rafHandle = null;
      return;
    }
    this.listener.onProgress?.(Math.max(0, pos));
    this.rafHandle = window.requestAnimationFrame(this.tick);
  };

  stop(): void {
    if (this.rafHandle !== null) {
      window.cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
    this.engine?.stopAll();
    // Suspend the AudioContext so future-scheduled Web Audio nodes are silenced
    // immediately. play() calls context.resume() before the next playback.
    void this.context?.suspend();
    for (const node of this.scheduledClicks) {
      try {
        node.stop();
      } catch {
        /* already stopped */
      }
    }
    this.scheduledClicks = [];
    if (this.status === "playing") {
      this.setStatus("ready");
      this.listener.onProgress?.(0);
    }
  }

  dispose(): void {
    this.stop();
    this.engine?.dispose();
    this.engine = null;
    this.mixer?.dispose();
    this.mixer = null;
    if (this.context) {
      void this.context.close();
      this.context = null;
    }
    this.loaded = false;
    this.setStatus("idle");
  }
}
