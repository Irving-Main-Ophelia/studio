/**
 * Persist an in-memory Blob to disk via Tauri's dialog + fs plugins.
 *
 * Works in both the running Tauri webview (uses the plugins) and the
 * Vite preview / vitest (falls back to the browser download API).
 */

import { writeFile } from "@tauri-apps/plugin-fs";
import { save } from "@tauri-apps/plugin-dialog";

import type { ExportArtifact } from "./exporters";

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function saveArtifact(art: ExportArtifact): Promise<string | null> {
  if (isTauri) {
    const path = await save({
      defaultPath: art.filename,
      filters: [
        {
          name: filterNameFor(art.mime),
          extensions: [extOf(art.filename)],
        },
      ],
    });
    if (!path) return null;
    const bytes = new Uint8Array(await art.blob.arrayBuffer());
    await writeFile(path, bytes);
    return path;
  }

  // Browser fallback (vitest, vite preview).
  const url = URL.createObjectURL(art.blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = art.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return art.filename;
}

function filterNameFor(mime: string): string {
  if (mime.includes("musicxml")) return "MusicXML";
  if (mime.includes("midi")) return "MIDI";
  if (mime.includes("wav")) return "WAV audio";
  if (mime.includes("pdf")) return "PDF";
  return "File";
}

function extOf(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx === -1 ? "" : filename.slice(idx + 1);
}
