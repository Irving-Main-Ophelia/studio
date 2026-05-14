import { Mic, MicOff, Music3 } from "lucide-react";

import { useAudioMeter } from "../lib/useAudioMeter";
import { useMidi } from "../lib/useMidi";
import { MixerPane } from "./MixerPane";

/**
 * Bottom rail — Phase 1:
 *   - Mixer rail (per-track gain/pan/mute/solo + master + click + count-in).
 *   - Audio input meter (CPAL → Rust → Tauri event).
 *   - Web MIDI device list + recent events log.
 */
export function BottomRail() {
  return (
    <footer className="grid h-36 shrink-0 grid-cols-[2fr_1fr_1fr] gap-3 border-t border-obsidian-700 bg-obsidian-800/60 px-3 py-2 text-xs text-zinc-300">
      <MixerPane />
      <AudioMeterTile />
      <MidiTile />
    </footer>
  );
}

function AudioMeterTile() {
  const meter = useAudioMeter();
  const peakPct = Math.min(100, meter.peak * 140);
  const rmsPct = Math.min(100, meter.rms * 200);
  return (
    <section className="flex flex-col rounded-md border border-obsidian-700/60 bg-obsidian-900/40 px-3 py-2">
      <div className="flex items-center justify-between">
        <span className="num uppercase tracking-widest text-zinc-500">Audio input</span>
        <button
          onClick={() => (meter.running ? void meter.stop() : void meter.start())}
          className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] text-zinc-300 transition-colors hover:bg-obsidian-700"
        >
          {meter.running ? <Mic size={11} className="text-neon-emerald" /> : <MicOff size={11} />}
          {meter.running ? "stop" : "enable"}
        </button>
      </div>
      <div className="mt-1 truncate text-[10px] text-zinc-500">
        {meter.error
          ? <span className="text-danger">{meter.error}</span>
          : meter.device
            ? meter.device
            : meter.running
              ? "starting…"
              : "off"}
      </div>
      <div className="mt-2 space-y-1">
        <Meter label="peak" value={peakPct} accent="from-neon-cyan to-neon-magenta" />
        <Meter label="rms" value={rmsPct} accent="from-neon-emerald to-neon-cyan" />
      </div>
    </section>
  );
}

function Meter({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="num w-8 shrink-0 text-[9px] uppercase text-zinc-500">{label}</span>
      <div className="relative h-2 flex-1 overflow-hidden rounded bg-obsidian-700/70">
        <div
          className={`h-full origin-left bg-gradient-to-r ${accent} transition-[width] duration-75`}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="num w-9 shrink-0 text-right text-[9px] text-zinc-500">
        {value.toFixed(0)}%
      </span>
    </div>
  );
}

function MidiTile() {
  const midi = useMidi();
  return (
    <section className="flex flex-col rounded-md border border-obsidian-700/60 bg-obsidian-900/40 px-3 py-2">
      <div className="flex items-center justify-between">
        <span className="num uppercase tracking-widest text-zinc-500">MIDI</span>
        <span className="num text-[10px] text-zinc-500">
          {midi.supported
            ? midi.permission === "denied"
              ? "permission denied"
              : `${midi.inputs.length} input(s)`
            : "unsupported"}
        </span>
      </div>
      <div className="mt-1 min-h-[1rem] truncate text-[10px] text-zinc-500">
        {midi.inputs.length > 0 ? (
          midi.inputs.map((i) => i.name).join(", ")
        ) : (
          <span className="text-zinc-600">Plug in a MIDI device to see it here.</span>
        )}
      </div>
      <div className="mt-2 flex-1 overflow-y-auto rounded bg-obsidian-700/40 px-2 py-1 text-[10px] font-mono text-zinc-400">
        {midi.recent.length === 0 ? (
          <div className="flex h-full items-center justify-center text-zinc-600">
            <Music3 size={12} className="mr-2 opacity-50" /> waiting for MIDI events…
          </div>
        ) : (
          midi.recent.map((e, i) => (
            <div key={i} className="truncate">
              <span className="text-neon-violet/80">{midiName(e.status)}</span>{" "}
              <span className="text-zinc-300">
                {midiNote(e.data1)} vel {e.data2}
              </span>{" "}
              <span className="text-zinc-600">on {e.device}</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function midiName(status: number): string {
  const high = status & 0xf0;
  switch (high) {
    case 0x90: return "note-on ";
    case 0x80: return "note-off";
    case 0xa0: return "aftertch";
    case 0xb0: return "cc      ";
    case 0xc0: return "program ";
    case 0xd0: return "ch-press";
    case 0xe0: return "pitchbnd";
    default:   return "midi    ";
  }
}

function midiNote(midi: number): string {
  if (midi < 0 || midi > 127) return "—";
  const names = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
  const octave = Math.floor(midi / 12) - 1;
  return `${names[midi % 12]}${octave}`;
}
