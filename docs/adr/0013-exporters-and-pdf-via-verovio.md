# ADR-0013 — Exporters and PDF via Verovio in the WebView

- **Status:** Accepted, May 13, 2026
- **Phase:** 1 — M1.5 (Exports + UI polish + beta)
- **Supersedes:** —

## Context

PHASE_1.md §1.2 requires the maintainer to export the score in four
formats:

- **MusicXML 4.0** — interchange with Finale / Sibelius / Dorico / MuseScore.
- **MIDI 1.0** — standard MIDI for DAWs.
- **WAV** — offline render of the score.
- **PDF** — publication-quality engraving.

The first three have a single canonical encoder available to us:
`music21` already round-trips MusicXML, exports MIDI via `music21.midi`,
and we can render WAV either through a Web-Audio `OfflineAudioContext`
or a backend sine-bank fallback for headless tests.

PDF is the interesting one. The options are:

1. Render via the browser print dialog — quality varies by OS, no
   programmatic control.
2. Generate the PDF on the backend with `LilyPond` — heavy install,
   adds a non-trivial dependency, slow.
3. Generate via **Verovio** in the browser. Verovio is the Music
   Encoding Initiative's renderer; the maintained `verovio` npm package
   ships a WASM build that turns MusicXML into beautifully engraved
   SVG, page by page.

## Decision

Ship four exporters; PDF flows entirely through the browser.

**MusicXML, MIDI** — `POST /export/musicxml` and `POST /export/midi`
roundtrip through `music21` so the on-disk output is canonical (avoids
the maintainer accidentally writing a non-conformant MusicXML the next
notation app rejects).

**WAV** — Phase-1 fallback runs through a backend route
(`POST /export/wav`) that synthesises the extracted note list via a
sine-bank. The in-app render through the `Player` + `Mixer` chain via
`OfflineAudioContext` lands in M1.5 polish; the route ships today so
headless e2e tests (M1.5) can produce audio without a working
AudioContext.

**PDF** — `verovio` + `jspdf` + `svg2pdf.js`, all running in the Tauri
WebView. Renders MusicXML → Verovio SVG per page → embeds each SVG
into a multi-page A4 PDF document. Verovio's WASM module loads lazily
(roughly 5 MB) on first PDF export so it doesn't bloat splash-screen
launch time.

A single `ExportDialog` component (⌘⇧E or the ⌘K command palette)
fronts the four targets; each button calls into an `exporters.ts`
function and persists the result with `saveArtifact()`, which uses the
Tauri `dialog`/`fs` plugins (or a browser fallback in non-Tauri
contexts).

## Alternatives considered

1. **LilyPond on the backend.** Most beautiful engraving in the
   industry. Rejected: massive install, Mac codesigning headaches, slow
   per-render. Verovio gets us 90 % of the quality at <1 % of the
   complexity.
2. **MuseScore CLI for PDF.** Same as LilyPond — too heavy.
3. **Pure Verovio without `svg2pdf.js` — print to PDF via the OS.**
   Lower-fidelity, fonts vary by OS, harder to script for tests.
4. **Backend PDF route via Verovio's Python bindings (`verovio` PyPI).**
   The bindings exist; rejected because we'd need a headless browser
   path anyway for fonts (Bravura), and we want the export pipeline
   to work even when the backend is offline.

## Consequences

**Positive**

- Four exporters land with one ADR and no new desktop-side native
  dependencies.
- The whole export surface is local. Backend handles symbolic
  conversion (MusicXML/MIDI/fallback WAV); browser handles PDF +
  high-fidelity WAV in the M1.5 polish. Nothing crosses the network.
- The PDF engraving is genuinely publication-quality (Verovio uses
  Bravura SMuFL fonts).
- Adding a fifth target (LilyPond .ly, ABC, …) later is a 30-line
  diff to `exporters.ts`.

**Negative**

- Verovio's WASM is ~5 MB; first PDF render takes ~700 ms cold. We
  lazy-load the module so this doesn't inflate cold launch.
- `verovio` ships untyped on npm; we keep a tiny `verovio.d.ts` in
  `apps/desktop/src/export/` declaring the four methods we use. If the
  upstream API changes we update this stub.
- The backend WAV synth is a deliberate fallback — it sounds like a
  sine bank, not the in-app sampler. We mark the audio in the export
  dialog ("Phase-1 sine render"); the in-app `OfflineAudioContext`
  path through the sampler is the parking-lot M1.5 polish item.

## References

- `backend/agent/app/routes/export.py` — server-side exporters
- `apps/desktop/src/export/exporters.ts` — frontend orchestrator
- `apps/desktop/src/export/ExportDialog.tsx` — UI surface
- `apps/desktop/src/export/saveBlob.ts` — Tauri dialog/fs glue
- `apps/desktop/src/export/verovio.d.ts` — tiny type stubs
- PHASE_1.md §1.2 (DoD), §1.4-H
- NORTH_STAR.md §3 (Pillars) — Pillar 7 (Exports)
