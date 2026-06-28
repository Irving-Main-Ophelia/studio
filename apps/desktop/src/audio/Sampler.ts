/**
 * Sampler abstraction — the swappable "voice" behind the audio engine.
 *
 * ADR-0005/0010 always treated the sampler as a detail behind `Player`. This file
 * makes that explicit so the engine can mount a *different* sampler per track
 * (a violin on one part, a cello on another) without the transport, mixer, or
 * `Player` surface knowing or caring which implementation produced the sound.
 *
 * Three implementations, all behind the same `Sampler` interface:
 *
 *   - `PianoSampler`     — smplr `SplendidGrandPiano`. The Phase-0 default and the
 *                          universal fallback while other instruments load.
 *   - `SoundfontSampler` — smplr `Soundfont` (General MIDI). Gives distinct, real
 *                          timbres per instrument *today*, streaming samples the
 *                          same way the piano already does.
 *   - `SfizzSampler`     — honest stub (ADR-0017) for the high-fidelity path:
 *                          sfizz.wasm in an AudioWorklet + a local VSCO 2 / VCSL
 *                          sample set. Not available until that binary + samples
 *                          exist; `load()` rejects loudly so the engine falls back
 *                          to a Soundfont/piano rather than playing silence.
 *
 * Privacy note: Soundfont/piano samples are *instrument* recordings fetched from a
 * CDN — never composition content. This is the same posture the Phase-0
 * `SplendidGrandPiano` already shipped with; no user music leaves the machine.
 */

import { SplendidGrandPiano, Soundfont } from "smplr";

export interface SamplerStartOptions {
  /** MIDI note number. */
  note: number;
  /** AudioContext time (seconds) to start. */
  time: number;
  /** Duration in seconds. */
  duration: number;
  /** MIDI velocity 0–127. */
  velocity: number;
}

export interface Sampler {
  /** Human label for the mixer strip / load UI (e.g. "Violin"). */
  readonly displayName: string;
  /** Resolve once the sampler is ready to make sound. Rejects loudly if it can't. */
  load(): Promise<void>;
  /** Schedule a single note. */
  start(opts: SamplerStartOptions): void;
  /** Stop all currently sounding/scheduled notes. */
  stop(): void;
  /** Tear down Web Audio connections. */
  disconnect(): void;
}

// ---------------------------------------------------------------------------
// Piano (default + fallback)
// ---------------------------------------------------------------------------

export class PianoSampler implements Sampler {
  readonly displayName: string;
  private readonly ctx: BaseAudioContext;
  private readonly destination: AudioNode;
  private piano: SplendidGrandPiano | null = null;

  constructor(ctx: BaseAudioContext, destination: AudioNode, displayName = "Piano") {
    this.ctx = ctx;
    this.destination = destination;
    this.displayName = displayName;
  }

  async load(): Promise<void> {
    // smplr types its context as AudioContext but schedules into any
    // BaseAudioContext, including the OfflineAudioContext used for WAV export.
    this.piano = new SplendidGrandPiano(this.ctx as AudioContext, { destination: this.destination });
    await this.piano.load;
  }

  start(opts: SamplerStartOptions): void {
    this.piano?.start({
      note: opts.note,
      time: opts.time,
      duration: Math.max(0.01, opts.duration),
      velocity: opts.velocity,
    });
  }

  stop(): void {
    this.piano?.stop();
  }

  disconnect(): void {
    this.piano?.disconnect();
    this.piano = null;
  }
}

// ---------------------------------------------------------------------------
// General-MIDI Soundfont (real per-instrument timbres)
// ---------------------------------------------------------------------------

export class SoundfontSampler implements Sampler {
  readonly displayName: string;
  private readonly ctx: BaseAudioContext;
  private readonly destination: AudioNode;
  private readonly instrument: string;
  private readonly onProgress?: (fraction: number) => void;
  private font: Soundfont | null = null;

  constructor(
    ctx: BaseAudioContext,
    destination: AudioNode,
    instrument: string,
    displayName: string,
    onProgress?: (fraction: number) => void,
  ) {
    this.ctx = ctx;
    this.destination = destination;
    this.instrument = instrument;
    this.displayName = displayName;
    this.onProgress = onProgress;
  }

  async load(): Promise<void> {
    // smplr types its context as AudioContext but schedules into any
    // BaseAudioContext, including the OfflineAudioContext used for WAV export.
    const font = new Soundfont(this.ctx as AudioContext, {
      instrument: this.instrument,
      destination: this.destination,
      kit: "FluidR3_GM",
      onLoadProgress: this.onProgress
        ? (p) => {
            const total = p.total || 1;
            this.onProgress?.(Math.min(1, p.loaded / total));
          }
        : undefined,
    });
    await font.load;
    this.font = font;
  }

  start(opts: SamplerStartOptions): void {
    this.font?.start({
      note: opts.note,
      time: opts.time,
      duration: Math.max(0.01, opts.duration),
      velocity: opts.velocity,
    });
  }

  stop(): void {
    this.font?.stop();
  }

  disconnect(): void {
    this.font?.disconnect();
    this.font = null;
  }
}

// ---------------------------------------------------------------------------
// sfizz.wasm — honest stub for the high-fidelity path (ADR-0010 / ADR-0017)
// ---------------------------------------------------------------------------

/**
 * Placeholder for the sfizz.wasm AudioWorklet sampler. It deliberately fails
 * `load()` until the WASM binary and a local SFZ sample set exist, so the engine
 * falls back to a Soundfont/piano instead of silently playing nothing.
 *
 * When the sfizz.wasm build lands (compile sfizz with Emscripten → public/sfizz/),
 * and VSCO 2 CE / VCSL are installed locally, this class wires the worklet into
 * `destination` and implements start/stop against it — *without* changing the
 * `Sampler` interface or anything above it.
 */
export class SfizzSampler implements Sampler {
  readonly displayName: string;

  constructor(_ctx: BaseAudioContext, _destination: AudioNode, displayName = "sfizz") {
    this.displayName = displayName;
  }

  load(): Promise<void> {
    return Promise.reject(
      new Error(
        "sfizz.wasm sampler not available — requires the compiled sfizz WASM binary " +
          "and a local VSCO 2 CE / VCSL sample set (PHASE_3_5.md §3.5.4 B). " +
          "Falling back to a Soundfont/piano voice.",
      ),
    );
  }

  start(): void {
    /* unreachable until load() succeeds */
  }

  stop(): void {
    /* no-op */
  }

  disconnect(): void {
    /* no-op */
  }
}

// ---------------------------------------------------------------------------
// Instrument-name → General-MIDI mapping
// ---------------------------------------------------------------------------

/**
 * Map a MusicXML part / instrument name onto a FluidR3_GM Soundfont instrument key.
 * Keyword-matched so "Violoncello", "Cello", "Vc." all resolve. Falls back to the
 * acoustic grand piano for anything we don't recognise.
 */
const GM_KEYWORDS: Array<[RegExp, string, string]> = [
  // [match, gm-instrument-key, display name]
  [/\b(violoncello|cello|vc\.?)\b/i, "cello", "Cello"],
  [/\b(contrabass|double\s*bass|string\s*bass|cb\.?)\b/i, "contrabass", "Contrabass"],
  [/\bviola\b/i, "viola", "Viola"],
  [/\b(violin|vln\.?|vl\.?)\b/i, "violin", "Violin"],
  [/\b(string\s*(ensemble|orchestra|section)|strings)\b/i, "string_ensemble_1", "Strings"],
  [/\b(flute|flauta|fl\.?)\b/i, "flute", "Flute"],
  [/\b(piccolo)\b/i, "piccolo", "Piccolo"],
  [/\b(oboe|ob\.?)\b/i, "oboe", "Oboe"],
  [/\b(english\s*horn|cor\s*anglais)\b/i, "english_horn", "English Horn"],
  [/\b(clarinet|cl\.?)\b/i, "clarinet", "Clarinet"],
  [/\b(bassoon|bsn\.?|fagot)\b/i, "bassoon", "Bassoon"],
  [/\b(soprano\s*sax)\b/i, "soprano_sax", "Soprano Sax"],
  [/\b(alto\s*sax)\b/i, "alto_sax", "Alto Sax"],
  [/\b(tenor\s*sax)\b/i, "tenor_sax", "Tenor Sax"],
  [/\b(bari(tone)?\s*sax)\b/i, "baritone_sax", "Baritone Sax"],
  [/\b(sax(ophone)?)\b/i, "alto_sax", "Saxophone"],
  [/\b(trumpet|tpt\.?|trompeta)\b/i, "trumpet", "Trumpet"],
  [/\b(french\s*horn|\bhorn\b|cor\b)\b/i, "french_horn", "French Horn"],
  [/\b(trombone|tbn\.?|tromb[oó]n)\b/i, "trombone", "Trombone"],
  [/\b(tuba)\b/i, "tuba", "Tuba"],
  [/\b(nylon|classical\s*guitar|guitarra)\b/i, "acoustic_guitar_nylon", "Nylon Guitar"],
  [/\b(steel\s*guitar|acoustic\s*guitar)\b/i, "acoustic_guitar_steel", "Steel Guitar"],
  [/\b(electric\s*guitar|guitar)\b/i, "electric_guitar_clean", "Electric Guitar"],
  [/\b(electric\s*bass|bass\s*guitar)\b/i, "electric_bass_finger", "Electric Bass"],
  [/\b(harp|arpa)\b/i, "orchestral_harp", "Harp"],
  [/\b(organ)\b/i, "church_organ", "Organ"],
  [/\b(harpsichord|clavecin)\b/i, "harpsichord", "Harpsichord"],
  [/\b(choir|chorus|voice|vocal|coro|voz)\b/i, "choir_aahs", "Choir"],
  [/\b(marimba)\b/i, "marimba", "Marimba"],
  [/\b(vibraphone|vibes)\b/i, "vibraphone", "Vibraphone"],
  [/\b(xylophone)\b/i, "xylophone", "Xylophone"],
  [/\b(piano|pno\.?|keyboard|teclado)\b/i, "acoustic_grand_piano", "Piano"],
];

export interface ResolvedInstrument {
  /** FluidR3_GM instrument key, or null to use the piano fallback. */
  gm: string | null;
  /** Display label for the mixer strip. */
  displayName: string;
}

export function resolveInstrument(instrumentName: string | null | undefined): ResolvedInstrument {
  const name = (instrumentName ?? "").trim();
  if (!name) return { gm: null, displayName: "Piano" };
  for (const [re, gm, displayName] of GM_KEYWORDS) {
    if (re.test(name)) {
      // The piano keyword resolves to the universal fallback (gm: null) so we use
      // the higher-fidelity SplendidGrandPiano rather than the GM piano sample.
      return { gm: gm === "acoustic_grand_piano" ? null : gm, displayName };
    }
  }
  return { gm: null, displayName: name };
}
