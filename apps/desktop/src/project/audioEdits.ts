/**
 * Audio-clip and marker edits as event-sourced Operations (Phase-5 B2/B5/B7).
 *
 * Clips and markers are project *metadata* (`project.json.audio_clips` /
 * `markers`, ADR-0021), not score body — so, like `score_meta_update`, these
 * operations are journalled for history/undo but their canonical state is the
 * saved `meta`, not a MusicXML replay. Each op carries an inverse so the
 * existing undo/redo log applies. Takes are never mutated: a clip only
 * references one by `take_id` (ADR-0022).
 */

import type {
  AudioClip,
  ClipFades,
  Marker,
  OperationRecord,
  ProjectMeta,
} from "./types";
import { newOperationId, nowIso } from "./types";

/** A clip with no fades on either edge. */
export const NO_FADES: ClipFades = { fade_in: 0, fade_out: 0 };

/** The subset of a finished recording (`RecordSummary`) a clip needs. */
export interface TakeRef {
  take_id: string;
  duration_secs: number;
}

/** The operation kinds that mutate `meta` (clips/markers) rather than the score. */
export const AUDIO_EDIT_KINDS: ReadonlySet<string> = new Set([
  "audio_clip_add",
  "audio_clip_remove",
  "audio_clip_set_gain",
  "marker_add",
  "marker_remove",
  "marker_move",
]);

export function isAudioEditKind(kind: string): boolean {
  return AUDIO_EDIT_KINDS.has(kind);
}

/** A full-length clip that drops a freshly recorded take at `offset` (seconds). */
export function clipFromTake(take: TakeRef, offset = 0): AudioClip {
  return {
    id: newOperationId(),
    take_id: take.take_id,
    offset,
    length: take.duration_secs,
    gain_db: 0,
    fades: { ...NO_FADES },
  };
}

/** A named marker at a song position (seconds). */
export function makeMarker(name: string, position: number): Marker {
  return { id: newOperationId(), name, position };
}

/**
 * Convert a count-in of `bars` to seconds for the native recorder (B1). Uses the
 * time-signature numerator as beats-per-bar and the tempo as the beat rate — a
 * simple-meter approximation, enough to drop the click bars from the take.
 */
export function countInSeconds(
  bars: number,
  tempoBpm: number,
  timeSignature: string,
): number {
  if (bars <= 0 || tempoBpm <= 0) return 0;
  const beatsPerBar = Number.parseInt(timeSignature.split("/")[0], 10) || 4;
  return (bars * beatsPerBar * 60) / tempoBpm;
}

/* ----------------------------- builders ------------------------------ */

/** Construct the paired inverse op. `index + 1` is a placeholder that the
 *  undo path rewrites to the real next index when the inverse actually fires. */
function inverseOp(
  kind: OperationRecord["kind"],
  index: number,
  data: Record<string, unknown>,
  description: string,
): OperationRecord {
  return {
    id: newOperationId(),
    kind,
    timestamp: nowIso(),
    index: index + 1,
    data,
    inverse: null,
    description,
  };
}

export function buildAudioClipAddOp(clip: AudioClip, index: number): OperationRecord {
  return {
    id: newOperationId(),
    kind: "audio_clip_add",
    timestamp: nowIso(),
    index,
    data: { clip },
    inverse: inverseOp("audio_clip_remove", index, { clip }, "Undo: add clip"),
    description: `Added audio clip from ${clip.take_id}`,
  };
}

export function buildAudioClipRemoveOp(clip: AudioClip, index: number): OperationRecord {
  return {
    id: newOperationId(),
    kind: "audio_clip_remove",
    timestamp: nowIso(),
    index,
    data: { clip },
    inverse: inverseOp("audio_clip_add", index, { clip }, "Undo: remove clip"),
    description: `Removed audio clip ${clip.id}`,
  };
}

export function buildAudioClipSetGainOp(
  clipId: string,
  prevGainDb: number,
  nextGainDb: number,
  index: number,
): OperationRecord {
  return {
    id: newOperationId(),
    kind: "audio_clip_set_gain",
    timestamp: nowIso(),
    index,
    data: { clip_id: clipId, gain_db: nextGainDb },
    inverse: inverseOp(
      "audio_clip_set_gain",
      index,
      { clip_id: clipId, gain_db: prevGainDb },
      "Undo: clip gain",
    ),
    description: `Set clip gain to ${nextGainDb} dB`,
  };
}

export function buildMarkerAddOp(marker: Marker, index: number): OperationRecord {
  return {
    id: newOperationId(),
    kind: "marker_add",
    timestamp: nowIso(),
    index,
    data: { marker },
    inverse: inverseOp("marker_remove", index, { marker }, "Undo: add marker"),
    description: `Added marker "${marker.name}"`,
  };
}

export function buildMarkerRemoveOp(marker: Marker, index: number): OperationRecord {
  return {
    id: newOperationId(),
    kind: "marker_remove",
    timestamp: nowIso(),
    index,
    data: { marker },
    inverse: inverseOp("marker_add", index, { marker }, "Undo: remove marker"),
    description: `Removed marker "${marker.name}"`,
  };
}

export function buildMarkerMoveOp(
  markerId: string,
  prevPos: number,
  nextPos: number,
  index: number,
): OperationRecord {
  return {
    id: newOperationId(),
    kind: "marker_move",
    timestamp: nowIso(),
    index,
    data: { marker_id: markerId, position: nextPos },
    inverse: inverseOp(
      "marker_move",
      index,
      { marker_id: markerId, position: prevPos },
      "Undo: move marker",
    ),
    description: `Moved marker to ${nextPos.toFixed(2)}s`,
  };
}

/* ----------------------------- reducer ------------------------------- */

/** Markers are kept sorted by song position for stable display/loop-between. */
function byPosition(a: Marker, b: Marker): number {
  return a.position - b.position;
}

/**
 * Apply a clip/marker operation to `meta`, returning a new meta. Unknown ops
 * pass through unchanged. Pure — the same function powers a user edit and the
 * replay of an inverse (undo) or a redo.
 */
export function applyAudioEdit(meta: ProjectMeta, op: OperationRecord): ProjectMeta {
  const clips = meta.audio_clips ?? [];
  const markers = meta.markers ?? [];
  switch (op.kind) {
    case "audio_clip_add": {
      const { clip } = op.data as { clip: AudioClip };
      if (clips.some((c) => c.id === clip.id)) return meta;
      return { ...meta, audio_clips: [...clips, clip] };
    }
    case "audio_clip_remove": {
      const { clip } = op.data as { clip: AudioClip };
      return { ...meta, audio_clips: clips.filter((c) => c.id !== clip.id) };
    }
    case "audio_clip_set_gain": {
      const { clip_id, gain_db } = op.data as { clip_id: string; gain_db: number };
      return {
        ...meta,
        audio_clips: clips.map((c) => (c.id === clip_id ? { ...c, gain_db } : c)),
      };
    }
    case "marker_add": {
      const { marker } = op.data as { marker: Marker };
      if (markers.some((m) => m.id === marker.id)) return meta;
      return { ...meta, markers: [...markers, marker].sort(byPosition) };
    }
    case "marker_remove": {
      const { marker } = op.data as { marker: Marker };
      return { ...meta, markers: markers.filter((m) => m.id !== marker.id) };
    }
    case "marker_move": {
      const { marker_id, position } = op.data as { marker_id: string; position: number };
      return {
        ...meta,
        markers: markers
          .map((m) => (m.id === marker_id ? { ...m, position } : m))
          .sort(byPosition),
      };
    }
    default:
      return meta;
  }
}
