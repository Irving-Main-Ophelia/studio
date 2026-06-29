/**
 * Guitar Pro import entry (Track A, A7 — ADR-0019).
 *
 * alphaTab parses the `.gp/.gpx/.gp5` (and GP3–5) bytes into its `Score` model;
 * we convert that to MusicXML and hand it to the normal import pipeline. alphaTab
 * is import-only and never becomes a second renderer — OSMD stays canonical.
 */

import { alphaTabScoreToMusicXml, type GuitarProConversion } from "./alphaTabToMusicXml";

// alphaTab is loaded lazily (dynamic import) so its ~1 MB runtime stays out of the
// startup bundle and is fetched only when the maintainer actually opens a GP file.
async function loadAlphaTab() {
  return import("@coderline/alphatab");
}

/** Convert raw Guitar Pro file bytes to MusicXML + tuning metadata + warnings. */
export async function importGuitarProBytes(bytes: Uint8Array): Promise<GuitarProConversion> {
  const { importer, Settings } = await loadAlphaTab();
  const score = importer.ScoreLoader.loadScoreFromBytes(bytes, new Settings());
  return alphaTabScoreToMusicXml(score);
}

/** Convert an alphaTex string (text tab) — used for tests and quick paste-import. */
export async function importAlphaTex(tex: string): Promise<GuitarProConversion> {
  const { importer, Settings } = await loadAlphaTab();
  const imp = new importer.AlphaTexImporter();
  imp.initFromString(tex, new Settings());
  return alphaTabScoreToMusicXml(imp.readScore());
}

/** True for filenames alphaTab can read as Guitar Pro. */
export function isGuitarProFile(filename: string): boolean {
  return /\.(gp|gpx|gp3|gp4|gp5)$/i.test(filename);
}
