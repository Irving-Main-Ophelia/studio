/**
 * Tag OSMD/VexFlow SVG note groups with score positions after render.
 */

import type { OpenSheetMusicDisplay } from "opensheetmusicdisplay";

import type { SelectedNote } from "../editor/SelectionState";
import type { ListedNoteRow } from "../lib/api";
import { findBestListRow, quartersPerMeasure } from "./noteResolve";
import { collectGraphicNotes } from "./osmdHitTest";

const ATTR = {
  part: "data-sh-part",
  measure: "data-sh-measure",
  beat: "data-sh-beat",
  pitch: "data-sh-pitch",
  duration: "data-sh-duration",
  partName: "data-sh-part-name",
  midi: "data-sh-midi",
};

function pitchedStaveGroups(container: HTMLElement): SVGGElement[] {
  const groups = Array.from(container.querySelectorAll<SVGGElement>("g.vf-stavenote"));
  return groups.filter((g) => g.querySelector(".vf-notehead, path[class*='notehead']"));
}

/**
 * Stamp SVG groups using OSMD graphic positions matched to list_notes rows.
 * Falls back to DOM order only when the graphic tree is unavailable.
 */
export function annotateScoreNotes(
  osmd: OpenSheetMusicDisplay | null,
  container: HTMLElement,
  notes: ListedNoteRow[],
  timeSignature: string,
): number {
  if (osmd && notes.length > 0) {
    const qpm = quartersPerMeasure(timeSignature);
    const hits = collectGraphicNotes(osmd, container, qpm);
    let count = 0;
    for (const hit of hits) {
      const row = findBestListRow(notes, hit.note);
      if (!row) continue;
      const group = hit.element?.closest?.("g.vf-stavenote") as SVGGElement | null;
      if (!group) continue;
      stampNoteGroup(group, row);
      count++;
    }
    if (count > 0) return count;
  }

  const groups = pitchedStaveGroups(container);
  const count = Math.min(groups.length, notes.length);
  for (let i = 0; i < count; i++) {
    stampNoteGroup(groups[i], notes[i]);
  }
  return count;
}

export function stampNoteGroup(g: SVGGElement, n: ListedNoteRow): void {
  g.setAttribute(ATTR.part, String(n.part_index));
  g.setAttribute(ATTR.measure, String(n.measure_number));
  g.setAttribute(ATTR.beat, String(n.beat_offset));
  g.setAttribute(ATTR.pitch, n.pitch);
  g.setAttribute(ATTR.duration, String(n.duration_quarters));
  g.setAttribute(ATTR.partName, n.part_name);
  if (n.midi != null) g.setAttribute(ATTR.midi, String(n.midi));
  g.style.cursor = "ns-resize";
}

export function selectedNoteFromGroup(g: SVGGElement): SelectedNote | null {
  const beat = g.getAttribute(ATTR.beat);
  const measure = g.getAttribute(ATTR.measure);
  const part = g.getAttribute(ATTR.part);
  const pitch = g.getAttribute(ATTR.pitch);
  if (beat == null || measure == null || part == null || !pitch) return null;
  const midiRaw = g.getAttribute(ATTR.midi);
  return {
    part_index: Number(part),
    measure_number: Number(measure),
    beat_offset: Number(beat),
    voice: null,
    pitch,
    duration_quarters: Number(g.getAttribute(ATTR.duration) ?? 1),
    part_name: g.getAttribute(ATTR.partName) ?? `Part ${Number(part) + 1}`,
    midi: midiRaw != null && midiRaw !== "" ? Number(midiRaw) : null,
  };
}

export function hitTestAnnotatedNote(
  scoreRoot: HTMLElement,
  scrollContainer: HTMLElement,
  _notes: ListedNoteRow[],
  clientX: number,
  clientY: number,
): { note: SelectedNote; box: { x: number; y: number; width: number; height: number } } | null {
  const stack = document.elementsFromPoint(clientX, clientY);
  for (const el of stack) {
    const group = el.closest?.("g.vf-stavenote[data-sh-beat]") as SVGGElement | null;
    if (!group || !scoreRoot.contains(group)) continue;
    const note = selectedNoteFromGroup(group);
    if (!note) continue;
    const rect = scrollContainer.getBoundingClientRect();
    const gRect = group.getBoundingClientRect();
    return {
      note,
      box: {
        x: gRect.left - rect.left + scrollContainer.scrollLeft,
        y: gRect.top - rect.top + scrollContainer.scrollTop,
        width: gRect.width,
        height: gRect.height,
      },
    };
  }
  return null;
}
