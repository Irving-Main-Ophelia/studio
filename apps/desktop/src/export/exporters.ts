/**
 * Phase-1 exporters (M1.5): MusicXML, MIDI, WAV, PDF.
 *
 * Wire format:
 *   - MusicXML & MIDI flow through the backend (`/export/*`) so music21
 *     stays the canonical encoder.
 *   - WAV uses the Web Audio OfflineAudioContext driven by our existing
 *     Player/Mixer chain. The backend route is a fallback used only by
 *     headless tests.
 *   - PDF runs entirely in the browser: Verovio renders MusicXML to SVG,
 *     jsPDF + svg2pdf.js converts the SVG into a multi-page PDF.
 *
 * Each exporter returns a Blob (and an inferred filename) ready for the
 * Tauri dialog plugin to save to disk.
 */

import { jsPDF } from "jspdf";
import "svg2pdf.js";
import { BACKEND_URL } from "../lib/api";

export interface ExportArtifact {
  blob: Blob;
  filename: string;
  mime: string;
}

function isoStamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} → ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

function base64ToBlob(base64: string, mime: string): Blob {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export async function exportMusicXml(
  musicxml: string,
  projectTitle: string,
): Promise<ExportArtifact> {
  const body = await postJson<{ musicxml: string }>("/export/musicxml", { musicxml });
  return {
    blob: new Blob([body.musicxml], { type: "application/vnd.recordare.musicxml" }),
    filename: `${slug(projectTitle)}_${isoStamp()}.musicxml`,
    mime: "application/vnd.recordare.musicxml",
  };
}

export async function exportMidi(
  musicxml: string,
  projectTitle: string,
): Promise<ExportArtifact> {
  const body = await postJson<{ midi_base64: string; byte_count: number }>("/export/midi", {
    musicxml,
  });
  return {
    blob: base64ToBlob(body.midi_base64, "audio/midi"),
    filename: `${slug(projectTitle)}_${isoStamp()}.mid`,
    mime: "audio/midi",
  };
}

export async function exportWav(
  renderReal: () => Promise<Blob>,
  musicxml: string,
  projectTitle: string,
): Promise<ExportArtifact> {
  // Primary path (M3.5.1 B3): render through the real sampler + mixer chain on an
  // OfflineAudioContext, so the WAV matches what you hear. The backend sine-bank is
  // a clearly-labelled emergency fallback used only if the real render fails
  // (e.g. instrument samples could not be fetched).
  let blob: Blob;
  try {
    blob = await renderReal();
  } catch (err) {
    console.warn("WAV export: real offline render failed; using backend sine-bank fallback:", err);
    const body = await postJson<{ wav_base64: string }>("/export/wav", { musicxml });
    blob = base64ToBlob(body.wav_base64, "audio/wav");
  }
  return {
    blob,
    filename: `${slug(projectTitle)}_${isoStamp()}.wav`,
    mime: "audio/wav",
  };
}

let verovioModulePromise: Promise<unknown> | null = null;

async function getVerovioToolkit(): Promise<unknown> {
  if (!verovioModulePromise) {
    verovioModulePromise = (async () => {
      const wasmFactory = (await import("verovio/wasm")).default as () => Promise<unknown>;
      const { VerovioToolkit } = await import("verovio/esm");
      const wasm = await wasmFactory();
      return new (VerovioToolkit as unknown as new (m: unknown) => unknown)(wasm);
    })();
  }
  return verovioModulePromise;
}

export async function exportPdf(
  musicxml: string,
  projectTitle: string,
): Promise<ExportArtifact> {
  const toolkit = (await getVerovioToolkit()) as {
    setOptions: (opts: Record<string, unknown>) => void;
    loadData: (xml: string) => void;
    getPageCount: () => number;
    renderToSVG: (pageNumber: number) => string;
  };
  toolkit.setOptions({
    inputFrom: "musicxml",
    pageHeight: 2970,
    pageWidth: 2100,
    pageMarginTop: 100,
    pageMarginBottom: 100,
    pageMarginLeft: 100,
    pageMarginRight: 100,
    scale: 40,
  });
  toolkit.loadData(musicxml);
  const pages = toolkit.getPageCount();

  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  for (let i = 1; i <= pages; i++) {
    const svgString = toolkit.renderToSVG(i);
    const svgDoc = new DOMParser().parseFromString(svgString, "image/svg+xml");
    const svgEl = svgDoc.documentElement as unknown as SVGElement;
    if (i > 1) pdf.addPage();
    await pdf.svg(svgEl, { width: 210, height: 297, x: 0, y: 0 });
  }
  const blob = pdf.output("blob");
  return {
    blob,
    filename: `${slug(projectTitle)}_${isoStamp()}.pdf`,
    mime: "application/pdf",
  };
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "stockhausen-project";
}
