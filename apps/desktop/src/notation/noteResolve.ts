import type { ListedNoteRow } from "../lib/api";
import type { SelectedNote } from "../editor/SelectionState";

/** Quarter-note beats per measure from a time signature like "4/4" or "6/8". */
export function quartersPerMeasure(timeSignature: string): number {
  const m = timeSignature.trim().match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!m) return 4;
  const num = Number(m[1]);
  const den = Number(m[2]);
  if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) return 4;
  return num * (4 / den);
}

/**
 * OSMD measure timestamps are whole-note fractions; music21 offsets are quarter-note beats.
 */
export function osmdTimestampToBeatQuarters(
  wholeNoteFraction: number,
  timeSignature: string,
): number {
  return wholeNoteFraction * quartersPerMeasure(timeSignature);
}

function pitchMatches(rowPitch: string, hitPitch: string): boolean {
  if (rowPitch === hitPitch) return true;
  const primary = hitPitch.split("-")[0]?.trim() ?? hitPitch;
  if (rowPitch === primary) return true;
  if (rowPitch.startsWith(`${primary}-`)) return true;
  return rowPitch.split("-").some((p) => p.trim() === primary);
}

/** OSMD may report beats as quarters or whole-note fractions — compare both. */
export function beatHintDistance(rowBeat: number, hintBeat: number): number {
  const hints = [hintBeat, hintBeat * 4, hintBeat / 4];
  return Math.min(...hints.map((h) => Math.abs(rowBeat - h)));
}

export function findBestListRow(
  notes: ListedNoteRow[],
  hit: SelectedNote,
): ListedNoteRow | null {
  if (notes.length === 0) return null;

  const inMeasure = notes.filter((n) => n.measure_number === hit.measure_number);
  const pool = inMeasure.length > 0 ? inMeasure : notes;

  let best: ListedNoteRow | null = null;
  let bestCost = Infinity;

  for (const row of pool) {
    let cost = beatHintDistance(row.beat_offset, hit.beat_offset);
    if (!pitchMatches(row.pitch, hit.pitch)) cost += 100;
    if (row.part_index !== hit.part_index) cost += 0.25;
    if (cost < bestCost) {
      bestCost = cost;
      best = row;
    }
  }

  if (hit.pitch && best && !pitchMatches(best.pitch, hit.pitch) && bestCost >= 100) {
    return null;
  }
  return best;
}

export function rowToSelectedNote(row: ListedNoteRow): SelectedNote {
  return {
    part_index: row.part_index,
    measure_number: row.measure_number,
    beat_offset: row.beat_offset,
    voice: row.voice,
    pitch: row.pitch,
    duration_quarters: row.duration_quarters,
    part_name: row.part_name,
    midi: row.midi,
  };
}

/** Map a hit (OSMD or SVG) to authoritative list_notes coordinates. */
export function resolveNoteForEdit(
  hit: SelectedNote,
  notes: ListedNoteRow[],
): SelectedNote {
  const row = findBestListRow(notes, hit);
  return row ? rowToSelectedNote(row) : hit;
}

/** First time signature in MusicXML, or 4/4. */
export function timeSignatureFromMusicXml(musicxml: string): string {
  const m = musicxml.match(
    /<time[^>]*>[\s\S]*?<beats>(\d+)<\/beats>[\s\S]*?<beat-type>(\d+)<\/beat-type>/i,
  );
  if (m) return `${m[1]}/${m[2]}`;
  return "4/4";
}
