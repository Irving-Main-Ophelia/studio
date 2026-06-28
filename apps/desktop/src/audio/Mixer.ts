/**
 * In-browser mixer.
 *
 * Mental model: think of each `Track` as a single channel strip on a
 * concert-hall mixing console — its own gain fader, pan knob, mute/solo
 * buttons, and a meter we'll wire later. The "master" strip on the right is
 * the conductor's final say. The Web Audio graph mirrors that physical
 * layout:
 *
 *         (sampler) ─▶ gain ─▶ panner ─▶┐
 *         (sampler) ─▶ gain ─▶ panner ─▶┼─▶ master gain ─▶ destination
 *         (sampler) ─▶ gain ─▶ panner ─▶┘
 *
 * The Mixer owns the gain/panner nodes; the sampler bank (smplr today,
 * sfizz.wasm in M1.2-extended) wires its source into `track.input` and
 * forgets about it.
 */

export interface MixerTrackConfig {
  id: string;
  /** Optional display label for the channel strip (e.g. "Violin"). Falls back to the id. */
  name?: string;
  /** dB; mapped to a linear gain in [0, 2]. */
  gain_db: number;
  /** [-1, 1]. */
  pan: number;
  mute: boolean;
  solo: boolean;
}

export interface MixerMasterConfig {
  gain_db: number;
}

export interface MixerSnapshot {
  tracks: MixerTrackConfig[];
  master: MixerMasterConfig;
}

const DEFAULT_TRACK: MixerTrackConfig = {
  id: "default",
  gain_db: 0,
  pan: 0,
  mute: false,
  solo: false,
};

const DEFAULT_MASTER: MixerMasterConfig = { gain_db: 0 };

export function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

export function linearToDb(linear: number): number {
  return 20 * Math.log10(Math.max(linear, 1e-6));
}

interface InternalTrack {
  config: MixerTrackConfig;
  input: GainNode;
  panner: StereoPannerNode;
  outputGain: GainNode;
}

export class Mixer {
  // BaseAudioContext so the same mixer graph drives both the live AudioContext
  // and the OfflineAudioContext used for WAV export (M3.5.1 B3).
  private readonly ctx: BaseAudioContext;
  private readonly master: GainNode;
  private readonly tracks = new Map<string, InternalTrack>();
  private masterConfig: MixerMasterConfig = { ...DEFAULT_MASTER };

  constructor(context: BaseAudioContext) {
    this.ctx = context;
    this.master = new GainNode(context, { gain: dbToLinear(this.masterConfig.gain_db) });
    this.master.connect(context.destination);
  }

  /** Returns the destination AudioNode that the master is connected through. */
  get destination(): AudioNode {
    return this.master;
  }

  /**
   * Lookup or create a track. New tracks default to 0 dB gain, centred pan,
   * unmuted, unsolo'd.
   */
  ensureTrack(id: string): { input: GainNode; config: MixerTrackConfig } {
    const existing = this.tracks.get(id);
    if (existing) return { input: existing.input, config: existing.config };
    const input = new GainNode(this.ctx, { gain: 1 });
    const panner = new StereoPannerNode(this.ctx, { pan: 0 });
    const outputGain = new GainNode(this.ctx, { gain: 1 });
    input.connect(panner);
    panner.connect(outputGain);
    outputGain.connect(this.master);
    const config: MixerTrackConfig = { ...DEFAULT_TRACK, id };
    const t: InternalTrack = { config, input, panner, outputGain };
    this.tracks.set(id, t);
    this.applyTrackGains();
    return { input: t.input, config: t.config };
  }

  /**
   * Atomic update: re-write the whole snapshot.
   */
  setSnapshot(snapshot: MixerSnapshot): void {
    this.masterConfig = { ...snapshot.master };
    this.master.gain.value = dbToLinear(this.masterConfig.gain_db);

    // Update or create each track.
    const incomingIds = new Set(snapshot.tracks.map((t) => t.id));
    for (const cfg of snapshot.tracks) {
      const { input } = this.ensureTrack(cfg.id);
      void input;
      const t = this.tracks.get(cfg.id);
      if (!t) continue;
      t.config = { ...cfg };
      t.panner.pan.value = clamp(cfg.pan, -1, 1);
    }
    // Drop any track that was removed.
    for (const id of [...this.tracks.keys()]) {
      if (!incomingIds.has(id)) {
        const t = this.tracks.get(id);
        t?.outputGain.disconnect();
        t?.panner.disconnect();
        t?.input.disconnect();
        this.tracks.delete(id);
      }
    }
    this.applyTrackGains();
  }

  snapshot(): MixerSnapshot {
    return {
      master: { ...this.masterConfig },
      tracks: [...this.tracks.values()].map((t) => ({ ...t.config })),
    };
  }

  setTrackGain(id: string, gain_db: number): void {
    const t = this.tracks.get(id);
    if (!t) return;
    t.config.gain_db = gain_db;
    this.applyTrackGains();
  }

  setTrackPan(id: string, pan: number): void {
    const t = this.tracks.get(id);
    if (!t) return;
    t.config.pan = clamp(pan, -1, 1);
    t.panner.pan.value = t.config.pan;
  }

  setTrackMute(id: string, mute: boolean): void {
    const t = this.tracks.get(id);
    if (!t) return;
    t.config.mute = mute;
    this.applyTrackGains();
  }

  setTrackSolo(id: string, solo: boolean): void {
    const t = this.tracks.get(id);
    if (!t) return;
    t.config.solo = solo;
    this.applyTrackGains();
  }

  setMasterGain(gain_db: number): void {
    this.masterConfig.gain_db = gain_db;
    this.master.gain.value = dbToLinear(gain_db);
  }

  dispose(): void {
    for (const t of this.tracks.values()) {
      t.input.disconnect();
      t.panner.disconnect();
      t.outputGain.disconnect();
    }
    this.tracks.clear();
    this.master.disconnect();
  }

  /**
   * Apply mute/solo and per-track gain. If any track is soloed, only soloed
   * tracks survive; everything else gets gain 0.
   */
  private applyTrackGains(): void {
    const anySolo = [...this.tracks.values()].some((t) => t.config.solo);
    for (const t of this.tracks.values()) {
      const muted = t.config.mute || (anySolo && !t.config.solo);
      const gain = muted ? 0 : dbToLinear(t.config.gain_db);
      t.outputGain.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.01);
    }
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
