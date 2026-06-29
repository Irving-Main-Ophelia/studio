/**
 * Mixer rail — one channel-strip per part + a master at the right. Lives in
 * the bottom rail (PHASE_1.md §1.4-C).
 *
 *   ┌─Piano───┐ ┌─Strings─┐  …  ┌─Master─┐
 *   │ ▲ │ ◀ ▶ │ │ ▲ │ ◀ ▶ │     │  ▲    │
 *   │ ▲ │     │ │ ▲ │     │ …   │  ▲    │
 *   │ ░░░░░░░░│ │ ░░░░░░░░│     │ ░░░░░ │
 *   │  M │ S  │ │  M │ S  │     │        │
 *   │ Piano   │ │ Strings │     │ Master │
 *   └─────────┘ └─────────┘     └────────┘
 */

import { Repeat, Volume2, VolumeX } from "lucide-react";

import { useScoreEngine } from "../lib/ScoreEngine";

export function MixerPane() {
  const engine = useScoreEngine();
  const tracks = engine.mixer.tracks;
  const master = engine.mixer.master;
  const click = engine.clickEnabled;
  const countIn = engine.countInBars;
  const pianoOnly = engine.samplingMode === "piano-only";
  const load = engine.samplerLoad;
  const practice = engine.practiceTempo;
  // Cycle 100% → 75% → 50% → 100% … for a quick practice-tempo slow-down.
  const nextPractice = practice >= 1 ? 0.75 : practice >= 0.75 ? 0.5 : 1;

  return (
    <section className="flex h-full flex-col rounded-md border border-obsidian-700/60 bg-obsidian-900/40 px-3 py-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="num uppercase tracking-widest text-zinc-500">Mixer</span>
        <div className="flex items-center gap-2 text-[10px]">
          {load && (
            <span className="num flex items-center gap-1 rounded bg-neon-violet/15 px-1.5 py-0.5 text-neon-violet">
              loading {load.label} {load.done}/{load.total}
            </span>
          )}
          <button
            onClick={() => engine.setPracticeTempo(nextPractice)}
            title="Practice tempo — playback speed without pitch change. Click to cycle 100/75/50%."
            className={`num rounded px-1.5 py-0.5 transition-colors ${
              practice < 1
                ? "bg-neon-cyan/15 text-neon-cyan"
                : "text-zinc-500 hover:bg-obsidian-700"
            }`}
          >
            tempo {Math.round(practice * 100)}%
          </button>
          <button
            onClick={() => engine.setSamplingMode(pianoOnly ? "multi" : "piano-only")}
            title="Use a single piano for every part (low RAM). Off = a distinct instrument per part."
            className={`num rounded px-1.5 py-0.5 transition-colors ${
              pianoOnly
                ? "bg-neon-amber/15 text-neon-amber"
                : "text-zinc-500 hover:bg-obsidian-700"
            }`}
          >
            piano only
          </button>
          <Toggle
            label="click"
            active={click}
            onClick={() => engine.setClick(!click)}
          />
          <button
            onClick={() => engine.setCountIn(countIn > 0 ? 0 : 1)}
            className={`num rounded px-1.5 py-0.5 transition-colors ${
              countIn > 0
                ? "bg-neon-cyan/15 text-neon-cyan"
                : "text-zinc-500 hover:bg-obsidian-700"
            }`}
          >
            count-in {countIn}
          </button>
          {engine.loop && (
            <span className="num flex items-center gap-1 rounded bg-neon-amber/15 px-1.5 py-0.5 text-neon-amber">
              <Repeat size={9} />
              loop {engine.loop.start_sec.toFixed(1)}–{engine.loop.end_sec.toFixed(1)}s
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-1 gap-2 overflow-x-auto">
        {tracks.map((t) => (
          <ChannelStrip
            key={t.id}
            label={t.name ?? prettifyTrack(t.id)}
            gain_db={t.gain_db}
            pan={t.pan}
            mute={t.mute}
            solo={t.solo}
            onGain={(db) => engine.setTrackGain(t.id, db)}
            onPan={(p) => engine.setTrackPan(t.id, p)}
            onMute={(m) => engine.setTrackMute(t.id, m)}
            onSolo={(s) => engine.setTrackSolo(t.id, s)}
          />
        ))}
        <ChannelStrip
          isMaster
          label="Master"
          gain_db={master.gain_db}
          pan={0}
          mute={false}
          solo={false}
          onGain={(db) => engine.setMasterGain(db)}
        />
      </div>
    </section>
  );
}

function ChannelStrip({
  label,
  gain_db,
  pan,
  mute,
  solo,
  onGain,
  onPan,
  onMute,
  onSolo,
  isMaster,
}: {
  label: string;
  gain_db: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  onGain: (db: number) => void;
  onPan?: (p: number) => void;
  onMute?: (m: boolean) => void;
  onSolo?: (s: boolean) => void;
  isMaster?: boolean;
}) {
  const dbLabel = gain_db === 0 ? "0.0" : gain_db.toFixed(1);
  return (
    <div
      className={`flex w-20 shrink-0 flex-col items-center rounded border px-2 py-1 ${
        isMaster
          ? "border-neon-cyan/40 bg-neon-cyan/5"
          : "border-obsidian-700 bg-obsidian-900/50"
      }`}
    >
      <span className="num mb-1 text-[9px] uppercase tracking-widest text-zinc-500">
        {label}
      </span>
      <input
        type="range"
        min={-40}
        max={6}
        step={0.5}
        value={gain_db}
        onChange={(e) => onGain(Number(e.target.value))}
        className="strip-fader h-16"
        aria-label={`${label} volume`}
      />
      <span className="num mt-1 text-[9px] text-zinc-300">{dbLabel} dB</span>

      {!isMaster && onPan && (
        <input
          type="range"
          min={-1}
          max={1}
          step={0.05}
          value={pan}
          onChange={(e) => onPan(Number(e.target.value))}
          className="strip-pan mt-1 h-1 w-full"
          aria-label={`${label} pan`}
        />
      )}

      {!isMaster && onMute && onSolo && (
        <div className="mt-1 flex w-full items-center gap-1">
          <Toggle label="M" active={mute} onClick={() => onMute(!mute)} compact />
          <Toggle
            label="S"
            active={solo}
            onClick={() => onSolo(!solo)}
            compact
            tone="amber"
          />
        </div>
      )}
    </div>
  );
}

function Toggle({
  label,
  active,
  onClick,
  compact,
  tone = "cyan",
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  compact?: boolean;
  tone?: "cyan" | "amber";
}) {
  const colors = active
    ? tone === "amber"
      ? "bg-neon-amber/20 text-neon-amber"
      : "bg-neon-cyan/20 text-neon-cyan"
    : "text-zinc-500 hover:bg-obsidian-700";
  return (
    <button
      onClick={onClick}
      className={`num flex flex-1 items-center justify-center rounded ${
        compact ? "px-1 py-0.5 text-[9px]" : "px-1.5 py-0.5 text-[10px]"
      } transition-colors ${colors}`}
      title={label}
    >
      {active && tone === "cyan" ? <Volume2 size={8} /> : null}
      {active && tone === "amber" ? <VolumeX size={8} /> : null}
      <span className="ml-1">{label}</span>
    </button>
  );
}

function prettifyTrack(id: string): string {
  if (id === "piano") return "Piano";
  return id[0]?.toUpperCase() + id.slice(1);
}
