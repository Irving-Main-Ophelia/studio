# ADR-0004 — Notation rendering: OpenSheetMusicDisplay (over VexFlow)

- **Status:** Accepted, May 13, 2026
- **Phase:** 0 — Week 2
- **Supersedes:** —

## Context

Stockhausen needs a notation engine that:

- renders standard Western notation (treble + bass clef, key sigs, accidentals, beaming, articulations, dynamics) at *engraving* quality,
- accepts **MusicXML 4.0** directly,
- runs in the WebView,
- is actively maintained,
- has TypeScript types,
- gives us a programmatic cursor for playback synchronization in Phase 1.

## Decision

**OpenSheetMusicDisplay (OSMD) 1.9.9**, which wraps **VexFlow 5** for low-level glyph rendering. We render as SVG (not Canvas) so we can style with CSS, animate with Framer Motion, and inspect via DOM tools.

## Alternatives considered

- **VexFlow alone** — gives finer control over the layout pipeline but forces us to write the MusicXML parser ourselves. Out of budget for Phase 0.
- **Verovio** — best-in-class engraving via WASM (the Bärenreiter-grade pillar of musical typesetting). We **will** add Verovio for the *PDF export* path in Phase 1, but it's heavier for live interactive editing.
- **abcjs** — ABC-only, not MusicXML; great for sketches but wrong format.
- **Roll our own** — years of work.

## Consequences

- Live editing works against the OSMD `MusicSheet` tree, then we re-render.
- Verovio joins the stack in Phase 1 for publication-quality PDFs.
- OSMD's cursor API (`osmd.cursor`) is the integration point for playback sync in Phase 1.
- We avoid OSMD's built-in `PlaybackManager` for now — we want the audio engine on the Rust/JS side under our control. The backend's `/score/notes` endpoint extracts a flat event list using `music21`, which we feed to `smplr`. This separation buys us simpler code in Phase 0 and a clean swap to sfizz.wasm in Phase 1.
