/**
 * Phase-1 audio engine.
 *
 * Built on Web Audio + smplr's SplendidGrandPiano for the actual sound, with
 * a real mixer rail in front: per-track gain/pan/mute/solo + master. The
 * public surface stays close to Phase 0 (`play / stop / preload`) and gains
 * three new controls:
 *
 *   - `setLoop(start_sec, end_sec)` to play a region on repeat
 *   - `playFrom(seconds)` to start playback at an arbitrary cursor
 *   - `setClick(enabled)` + `setCountIn(bars)` for the metronome / pre-roll
 *
 * Real multi-instrument playback (sfizz.wasm + VSCO 2 CE etc.) is the next
 * iteration of this file; see ADR-0010 for the engine-swap strategy.
 *
 * Web Audio note: AudioContext must be created (and resumed) from a user
 * gesture. We lazy-create it on first play.
 */

import { SplendidGrandPiano } from "smplr";

import type { NoteEvent } from "../lib/api";
import { Mixer, type MixerSnapshot } from "./Mixer";

export type PlayerStatus = "idle" | "loading" | "ready" | "playing" | "error";

export interface PlayerListener {
  onStatusChange?(status: PlayerStatus, error?: Error): void;
  onProgress?(positionSec: number): void;
  onEnded?(): void;
}

export interface LoopRegion {
  start_sec: number;
  end_sec: number;
}

const DEFAULT_TRACK_ID = "piano";
const COUNT_IN_FREQ = 880; // A5 click
const COUNT_IN_DOWNBEAT_FREQ = 1100; // brighter on beat 1

export class Player {
  private context: AudioContext | null = null;
  private piano: SplendidGrandPiano | null = null;
  private mixer: Mixer | null = null;
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
    }
    return this.context;
  }

  async preload(): Promise<void> {
    if (this.loaded) return;
    this.setStatus("loading");
    try {
      const ctx = this.ensureContext();
      if (!this.mixer) this.mixer = new Mixer(ctx);
      const { input } = this.mixer.ensureTrack(DEFAULT_TRACK_ID);
      this.piano = new SplendidGrandPiano(ctx, { destination: input });
      await this.piano.load;
      this.loaded = true;
      this.setStatus("ready");
    } catch (err) {
      this.setStatus("error", err as Error);
      throw err;
    }
  }

  setMixerSnapshot(snapshot: MixerSnapshot): void {
    if (!this.mixer) {
      const ctx = this.ensureContext();
      this.mixer = new Mixer(ctx);
    }
    this.mixer.setSnapshot(snapshot);
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

  async play(notes: NoteEvent[], totalDurationSec: number, fromSec = 0): Promise<void> {
    await this.preload();
    if (!this.piano || !this.context) return;
    if (this.context.state === "suspended") {
      await this.context.resume();
    }

    this.stop();
    this.cachedNotes = notes;
    this.playDuration = totalDurationSec;
    this.offsetSec = Math.max(0, fromSec);

    const now = this.context.currentTime;
    const beatSec = 60 / this.tempoBpm;
    const countInSec = this.countInBars * this.beatsPerBar * beatSec;
    const leadIn = 0.05;
    this.playStart = now + leadIn + countInSec;

    if (countInSec > 0) {
      this.scheduleClickRegion(now + leadIn, countInSec, /*include downbeat */ true);
    }
    if (this.clickEnabled) {
      this.scheduleClickRegion(this.playStart, totalDurationSec - this.offsetSec, false);
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
    if (!this.piano) return;
    if (loop) {
      const loopLen = loop.end_sec - loop.start_sec;
      const repetitions = Math.max(1, Math.ceil(8 / Math.max(loopLen, 0.001)));
      for (let i = 0; i < repetitions; i++) {
        const cycleOffset = i * loopLen;
        const inLoop = notes.filter(
          (n) => n.start_sec >= loop.start_sec && n.start_sec < loop.end_sec,
        );
        for (const evt of inLoop) {
          const t = startTime + (evt.start_sec - loop.start_sec) + cycleOffset;
          this.piano.start({
            note: evt.midi,
            time: t,
            duration: Math.max(0.01, evt.duration_sec),
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
      this.piano.start({
        note: evt.midi,
        time: startTime + Math.max(0, evt.start_sec - offsetSec),
        duration: Math.max(0.01, evt.duration_sec),
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
    const beatSec = 60 / this.tempoBpm;
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
    const pos = this.context.currentTime - this.playStart + this.offsetSec;
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
    this.piano?.stop();
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
    this.piano?.disconnect();
    this.piano = null;
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
