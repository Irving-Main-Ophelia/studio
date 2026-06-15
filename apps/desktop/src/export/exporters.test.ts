/**
 * Exporter unit tests.
 *
 * All network calls are intercepted with vi.stubGlobal. PDF (Verovio + jsPDF)
 * and WAV (OfflineAudioContext) are too heavy for unit tests and are omitted
 * here — they are covered by the backend integration tests.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const { exportMusicXml, exportMidi } = await import("./exporters");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function okJson(payload: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    statusText: "OK",
    json: () => Promise.resolve(payload),
  } as unknown as Response);
}

function errorResponse(status: number) {
  return Promise.resolve({
    ok: false,
    status,
    statusText: "Error",
    json: () => Promise.resolve({}),
  } as unknown as Response);
}

const SAMPLE_XML = `<?xml version="1.0"?><score-partwise version="4.0"></score-partwise>`;
// btoa of pure ASCII bytes — safe in all environments
const SAFE_B64 = btoa("AABBCCDD");

// ---------------------------------------------------------------------------
// MusicXML export
// ---------------------------------------------------------------------------

describe("exportMusicXml", () => {
  afterEach(() => fetchMock.mockReset());

  it("returns a Blob with the correct MIME type", async () => {
    fetchMock.mockReturnValue(okJson({ musicxml: SAMPLE_XML }));
    const art = await exportMusicXml(SAMPLE_XML, "Piece");
    expect(art.mime).toBe("application/vnd.recordare.musicxml");
    expect(art.blob.size).toBeGreaterThan(0);
  });

  it("filename is a slug of the project title with a timestamp suffix", async () => {
    fetchMock.mockReturnValue(okJson({ musicxml: SAMPLE_XML }));
    const art = await exportMusicXml(SAMPLE_XML, "My Étude");
    // slug normalises to ascii-lower; É → e (decompose then strip combining char)
    expect(art.filename).toMatch(/^my-etude_\d{4}-\d{2}-\d{2}.*\.musicxml$/);
  });

  it("falls back to 'stockhausen-project' slug when title is empty", async () => {
    fetchMock.mockReturnValue(okJson({ musicxml: SAMPLE_XML }));
    const art = await exportMusicXml(SAMPLE_XML, "");
    expect(art.filename).toMatch(/^stockhausen-project_/);
  });

  it("throws on a backend error", async () => {
    fetchMock.mockReturnValue(errorResponse(500));
    await expect(exportMusicXml(SAMPLE_XML, "Piece")).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// MIDI export
// ---------------------------------------------------------------------------

describe("exportMidi", () => {
  afterEach(() => fetchMock.mockReset());

  it("returns a Blob with audio/midi MIME type", async () => {
    fetchMock.mockReturnValue(okJson({ midi_base64: SAFE_B64, byte_count: 8 }));
    const art = await exportMidi(SAMPLE_XML, "Piece");
    expect(art.mime).toBe("audio/midi");
    expect(art.blob.size).toBeGreaterThan(0);
  });

  it("filename ends with .mid", async () => {
    fetchMock.mockReturnValue(okJson({ midi_base64: SAFE_B64, byte_count: 8 }));
    const art = await exportMidi(SAMPLE_XML, "Etude");
    expect(art.filename).toMatch(/\.mid$/);
  });

  it("throws on a backend error", async () => {
    fetchMock.mockReturnValue(errorResponse(422));
    await expect(exportMidi(SAMPLE_XML, "Piece")).rejects.toThrow();
  });
});
