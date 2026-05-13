/**
 * Phase-0 audio engine.
 *
 * A thin wrapper around smplr's SplendidGrandPiano. Phase 1 swaps this
 * out for an SFZ + Rubber Band engine; the public interface stays the
 * same so callers don't have to change.
 *
 * Web Audio note: AudioContext must be created (and resumed) from a user
 * gesture. We lazy-create it on first play.
 */

import { SplendidGrandPiano } from "smplr";

import type { NoteEvent } from "../lib/api";

export type PlayerStatus = "idle" | "loading" | "ready" | "playing" | "error";

export interface PlayerListener {
  onStatusChange?(status: PlayerStatus, error?: Error): void;
  onProgress?(positionSec: number): void;
  onEnded?(): void;
}

export class Player {
  private context: AudioContext | null = null;
  private piano: SplendidGrandPiano | null = null;
  private status: PlayerStatus = "idle";
  private listener: PlayerListener;
  private rafHandle: number | null = null;
  private playStart: number = 0;
  private playDuration: number = 0;
  private loaded = false;

  constructor(listener: PlayerListener = {}) {
    this.listener = listener;
  }

  getStatus(): PlayerStatus {
    return this.status;
  }

  private setStatus(status: PlayerStatus, error?: Error) {
    this.status = status;
    this.listener.onStatusChange?.(status, error);
  }

  private ensureContext(): AudioContext {
    if (!this.context) {
      const Ctor =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.context = new Ctor();
    }
    return this.context;
  }

  async preload(): Promise<void> {
    if (this.loaded) return;
    this.setStatus("loading");
    try {
      const ctx = this.ensureContext();
      this.piano = new SplendidGrandPiano(ctx);
      await this.piano.load;
      this.loaded = true;
      this.setStatus("ready");
    } catch (err) {
      this.setStatus("error", err as Error);
      throw err;
    }
  }

  async play(notes: NoteEvent[], totalDurationSec: number): Promise<void> {
    await this.preload();
    if (!this.piano || !this.context) return;

    if (this.context.state === "suspended") {
      await this.context.resume();
    }

    this.stop();

    const now = this.context.currentTime;
    const leadIn = 0.05;
    this.playStart = now + leadIn;
    this.playDuration = totalDurationSec;

    for (const evt of notes) {
      this.piano.start({
        note: evt.midi,
        time: this.playStart + evt.start_sec,
        duration: Math.max(0.01, evt.duration_sec),
        velocity: evt.velocity,
      });
    }

    this.setStatus("playing");
    this.tick();
  }

  private tick = () => {
    if (!this.context || this.status !== "playing") return;
    const pos = this.context.currentTime - this.playStart;
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
    if (this.status === "playing") {
      this.setStatus("ready");
      this.listener.onProgress?.(0);
    }
  }

  dispose(): void {
    this.stop();
    this.piano?.disconnect();
    this.piano = null;
    if (this.context) {
      void this.context.close();
      this.context = null;
    }
    this.loaded = false;
    this.setStatus("idle");
  }
}
