import { useState } from "react";
import { Circle, Flag, Mic, MicOff, Minus, Music3, Plus, Square, Trash2 } from "lucide-react";

import { WaveformView } from "../audio/WaveformView";
import { useScoreEngine } from "../lib/ScoreEngine";
import { countInSeconds } from "../project/audioEdits";
import { isTauri } from "../lib/tauri";
import { useAudioMeter } from "../lib/useAudioMeter";
import { useAudioRecorder } from "../lib/useAudioRecorder";
import { useMidi } from "../lib/useMidi";
import { MixerPane } from "./MixerPane";

/**
 * Bottom rail:
 *   - Mixer rail (per-track gain/pan/mute/solo + master + click + count-in).
 *   - Capture: audio input meter + native CPAL record → take → clip (Phase 5).
 *   - Takes / clips / markers list (non-destructive clip model, Phase 5 B2/B5/B7).
 *   - Web MIDI device list + recent events log.
 */
export function BottomRail() {
  return (
    <footer className="grid h-36 shrink-0 grid-cols-[1.7fr_1fr_1.1fr_1fr] gap-3 border-t border-obsidian-700 bg-obsidian-800/60 px-3 py-2 text-xs text-zinc-300">
      <MixerPane />
      <CaptureTile />
      <TakesTile />
      <MidiTile />
    </footer>
  );
}

function CaptureTile() {
  const meter = useAudioMeter();
  const rec = useAudioRecorder();
  const engine = useScoreEngine();
  const peakPct = Math.min(100, (rec.recording ? rec.peak : meter.peak) * 140);
  const rmsPct = Math.min(100, meter.rms * 200);

  const projectPath = engine.project?.path ?? null;
  const canRecord = isTauri() && projectPath !== null;
  const elapsed =
    rec.recording && rec.sampleRate ? rec.frames / rec.sampleRate : 0;

  async function toggleRecord() {
    if (!canRecord) return;
    if (rec.recording) {
      const summary = await rec.stop();
      if (summary && summary.frames > 0) {
        await engine.addTakeClip({
          take_id: summary.take_id,
          duration_secs: summary.duration_secs,
        });
      }
    } else {
      const meta = engine.project?.meta;
      const countIn = meta
        ? countInSeconds(engine.countInBars, meta.tempo_bpm, meta.time_signature)
        : 0;
      await rec.start(projectPath!, countIn > 0 ? { count_in_secs: countIn } : undefined);
    }
  }

  return (
    <section className="flex flex-col rounded-md border border-obsidian-700/60 bg-obsidian-900/40 px-3 py-2">
      <div className="flex items-center justify-between">
        <span className="num uppercase tracking-widest text-zinc-500">Capture</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => (meter.running ? void meter.stop() : void meter.start())}
            title="Toggle input meter"
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-zinc-300 transition-colors hover:bg-obsidian-700"
          >
            {meter.running ? <Mic size={11} className="text-neon-emerald" /> : <MicOff size={11} />}
          </button>
          <button
            onClick={() => void toggleRecord()}
            disabled={!canRecord}
            title={canRecord ? "Record a take" : "Open a project (native app) to record"}
            className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] transition-colors hover:bg-obsidian-700 disabled:opacity-40"
          >
            {rec.recording ? (
              <Square size={11} className="text-danger" fill="currentColor" />
            ) : (
              <Circle size={11} className="text-danger" fill="currentColor" />
            )}
            {rec.recording ? "stop" : "rec"}
          </button>
        </div>
      </div>
      <div className="mt-1 truncate text-[10px] text-zinc-500">
        {rec.error ? (
          <span className="text-danger">{rec.error}</span>
        ) : rec.recording ? (
          <span className="text-danger">● recording {elapsed.toFixed(1)}s</span>
        ) : meter.error ? (
          <span className="text-danger">{meter.error}</span>
        ) : (
          meter.device ?? "idle"
        )}
      </div>
      <div className="mt-2 space-y-1">
        <Meter label="peak" value={peakPct} accent="from-neon-cyan to-neon-magenta" />
        <Meter label="rms" value={rmsPct} accent="from-neon-emerald to-neon-cyan" />
      </div>
    </section>
  );
}

function TakesTile() {
  const engine = useScoreEngine();
  const clips = engine.project?.meta.audio_clips ?? [];
  const markers = engine.project?.meta.markers ?? [];
  const hasProject = engine.project !== null;
  const projectPath = engine.project?.path ?? null;
  const [openClipId, setOpenClipId] = useState<string | null>(null);
  const openClip = clips.find((c) => c.id === openClipId) ?? null;

  return (
    <section className="flex flex-col rounded-md border border-obsidian-700/60 bg-obsidian-900/40 px-3 py-2">
      <div className="flex items-center justify-between">
        <span className="num uppercase tracking-widest text-zinc-500">Takes / markers</span>
        <button
          onClick={() =>
            void engine.addMarker(`Marker ${markers.length + 1}`, engine.positionSec)
          }
          disabled={!hasProject}
          title="Drop a marker at the playhead"
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-zinc-300 transition-colors hover:bg-obsidian-700 disabled:opacity-40"
        >
          <Flag size={10} /> mark
        </button>
      </div>

      <div className="mt-1 flex-1 space-y-1 overflow-y-auto pr-1">
        {clips.length === 0 && markers.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[10px] text-zinc-600">
            record a take to create a clip
          </div>
        ) : (
          <>
            {clips.map((clip) => (
              <div
                key={clip.id}
                className="flex items-center gap-1 rounded bg-obsidian-700/40 px-1.5 py-0.5 text-[10px]"
              >
                <button
                  onClick={() =>
                    setOpenClipId((cur) => (cur === clip.id ? null : clip.id))
                  }
                  className={`flex-1 truncate text-left hover:text-neon-cyan ${
                    openClipId === clip.id ? "text-neon-cyan" : "text-zinc-300"
                  }`}
                  title={`${clip.take_id} — show waveform`}
                >
                  {clip.length.toFixed(1)}s
                </button>
                <button
                  onClick={() => void engine.setClipGain(clip.id, clip.gain_db - 1)}
                  className="rounded p-0.5 hover:bg-obsidian-600"
                  title="Clip gain −1 dB"
                >
                  <Minus size={9} />
                </button>
                <span className="num w-10 text-right text-zinc-400">
                  {clip.gain_db > 0 ? "+" : ""}
                  {clip.gain_db} dB
                </span>
                <button
                  onClick={() => void engine.setClipGain(clip.id, clip.gain_db + 1)}
                  className="rounded p-0.5 hover:bg-obsidian-600"
                  title="Clip gain +1 dB"
                >
                  <Plus size={9} />
                </button>
                <button
                  onClick={() => void engine.removeAudioClip(clip.id)}
                  className="rounded p-0.5 text-zinc-500 hover:bg-obsidian-600 hover:text-danger"
                  title="Delete clip"
                >
                  <Trash2 size={9} />
                </button>
              </div>
            ))}
            {markers.map((marker) => (
              <div
                key={marker.id}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-zinc-400"
              >
                <Flag size={9} className="shrink-0 text-neon-violet/80" />
                <span className="flex-1 truncate">{marker.name}</span>
                <span className="num text-zinc-500">{marker.position.toFixed(1)}s</span>
                <button
                  onClick={() => void engine.removeMarker(marker.id)}
                  className="rounded p-0.5 text-zinc-500 hover:bg-obsidian-600 hover:text-danger"
                  title="Delete marker"
                >
                  <Trash2 size={9} />
                </button>
              </div>
            ))}
          </>
        )}
      </div>

      {openClip && projectPath && (
        <div className="mt-1 border-t border-obsidian-700/60 pt-1">
          <WaveformView
            key={openClip.id}
            takePath={`${projectPath}/takes/${openClip.take_id}.wav`}
            height={26}
          />
        </div>
      )}
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
