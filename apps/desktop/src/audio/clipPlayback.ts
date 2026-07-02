/**
 * Sample-accurate scheduling of audio clips against the transport (Phase-5 B1).
 *
 * This is the *pure* half: given the clips and the transport state (where the
 * cursor is, when it maps to in wall-clock, and the playback rate), it computes
 * exactly when each clip source should start, from what offset into its take,
 * for how long, and its gain/fade envelope. The Web-Audio half (creating buffer
 * sources, connecting to the mixer) lives in `Player`, which can't run in CI —
 * so the timing logic is isolated here and unit-tested.
 *
 * A clip plays its take from the head; `offset` is the clip's position on the
 * timeline. Positions scale by `1/rate` (matching `Player.scheduleNotes`); the
 * take audio itself plays at natural pitch (time-stretch is Rubber Band / B6).
 */

import type { AudioClip } from "../project/types";

export interface ScheduledClip {
  clipId: string;
  takeId: string;
  /** Wall-clock time (AudioContext seconds) to start the source. */
  when: number;
  /** Offset into the take buffer to start from (seconds). */
  sourceOffsetSec: number;
  /** How long to play (seconds), trimmed to the clip and the cursor. */
  durationSec: number;
  gainDb: number;
  fadeInSec: number;
  fadeOutSec: number;
}

export interface ClipScheduleContext {
  /** Wall-clock time the score cursor (`offsetSec`) maps to. */
  playStart: number;
  /** Score-seconds cursor: playback starts here on the timeline. */
  offsetSec: number;
  /** Playback rate (practice tempo). Timeline gaps scale by `1/rate`. */
  rate: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Linear amplitude for a dB gain (matches `Mixer.dbToLinear`). */
export function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

/**
 * Compute the schedule for `clips` given the transport context. Clips that end
 * before the cursor are dropped; a clip straddling the cursor starts mid-take.
 */
export function scheduleClips(
  clips: readonly AudioClip[],
  ctx: ClipScheduleContext,
): ScheduledClip[] {
  const rate = ctx.rate > 0 ? ctx.rate : 1;
  const out: ScheduledClip[] = [];

  for (const clip of clips) {
    if (clip.length <= 0) continue;
    const clipEnd = clip.offset + clip.length;
    if (clipEnd <= ctx.offsetSec) continue; // entirely before the cursor

    const startsBeforeCursor = clip.offset < ctx.offsetSec;
    const sourceOffsetSec = startsBeforeCursor ? ctx.offsetSec - clip.offset : 0;
    const durationSec = clip.length - sourceOffsetSec;
    if (durationSec <= 0) continue;

    const when = startsBeforeCursor
      ? ctx.playStart
      : ctx.playStart + (clip.offset - ctx.offsetSec) / rate;

    // Fades clamp to fit the audible span. A clip we join mid-take has no fade-in.
    const half = durationSec / 2;
    const fadeInSec = startsBeforeCursor ? 0 : clamp(clip.fades?.fade_in ?? 0, 0, half);
    const fadeOutSec = clamp(clip.fades?.fade_out ?? 0, 0, half);

    out.push({
      clipId: clip.id,
      takeId: clip.take_id,
      when,
      sourceOffsetSec,
      durationSec,
      gainDb: clip.gain_db ?? 0,
      fadeInSec,
      fadeOutSec,
    });
  }

  return out;
}
