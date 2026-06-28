# Parking Lot

Ideas that surface during Phase-1 work but belong to Phase 2 or 3. We log
them here so they're not lost; we **do not** implement them.

Format: one bullet per item. Each carries the milestone where it surfaced
and a one-line note about why it was deferred.

---

## Shipped (no longer deferred) — reconciled June 27, 2026 (M3.5.0 truth pass)

These were logged here as deferred, but the code shipped them ahead of the doc.
Verified in `backend/agent/app/agent_tools.py`; kept here only as a record so the
parking lot tells the truth.

- **`score.reharmonize` — SHIPPED.** Claude-assisted chord substitution
  (`score_reharmonize`, ≈L466) applies secondary dominants / borrowed chords / modal
  interchange to inner voices while preserving the melody. Returns a typed
  `no_substitutions` `TheoryWarning` when nothing changes — not a silent empty diff.
- **`score.add_section` — SHIPPED.** Real generation via Claude + music21
  (`score_add_section`, ≈L539 → `app/generator.py`); the new section is appended to the
  score, with a `generation_failed` warning on fallback. The AMT/Moonbeam-on-Modal path is
  an optional future upgrade, not a blocker.
- **`theory.analyze_form` — SHIPPED.** Real cadence-based phrase detection + A/B/A′ section
  grouping (`theory_analyze_form`, ≈L146). No longer returns a single `undivided` section.

---

- **Mouse note-entry on imported scores (M1.7, partially built — BLOCKED).** `EditLayer`, hit-test, context menu, pitch drag, and `/score/edit/note/resolve` ship (ADR-0015), but the maintainer reports the staff still does not update after edits on real imports (June 2026). Keyboard + MIDI cover scratch composition; imported-score mouse edit must be fixed before closing M1.7.
- **Lasso & range selection (M1.1, deferred).** Multi-note selection,
  cut/copy/paste, all-of-pitch-class. Belongs in the same OSMD-overlay PR as
  mouse entry.
- **Slurs and crescendo/diminuendo hairpins (M1.1, deferred).** Both rely on
  multi-note selection, which we don't yet have. The agent in M1.4 will
  still be able to add them through `score.add_slur` / `score.add_hairpin`
  proposed-as-diff tools.
- **Voice splitting per staff (M1.1, deferred).** Backend accepts a `voice`
  parameter; UI currently keeps everything on voice 1. Real multi-voice UX
  needs a voice selector — Phase 2.
- **Cross-staff beaming (M1.1, deferred).** Belongs with multi-voice grand
  staff piano UX.
- **sfizz.wasm AudioWorklet sampler (M1.2 → M3.5.1: superseded for now by a Soundfont bank).**
  M3.5.1 shipped multi-instrument sound via a `Sampler` interface (`audio/Sampler.ts`) with smplr
  `Soundfont`/`Versilian` voices + `Engine.ts`, behind the unchanged `Player` surface. The literal
  **sfizz.wasm + VSCO 2 CE** path (highest fidelity) remains deferred: it needs an external
  Emscripten build of sfizz + a 3–4 GB local sample download. It is scaffolded as `SfizzSampler` and
  drops in behind the same interface. See `docs/phases/PHASE_3_5.md` §3.5.4 B.
- **Rubber Band GPL FFI implementation (M1.2, deferred).** Scaffold + Tauri
  command shipped. Real C++ link drops in behind the same surface.
- **Per-track output meters in the mixer (M1.2, deferred).** Need AnalyserNodes
  per channel; slipping to M1.5 polish.
- **Stale-diff UI prompt (M1.4, partial).** The diff already carries
  `base_score_hash`; the M1.4 UI does not yet detect a mismatch and prompt
  "this proposal is based on an older version". Land in M1.5 polish.
- **In-app WAV render via `OfflineAudioContext` (M1.5 → SHIPPED in M3.5.1).** `audio/offlineRender.ts`
  renders through the real `Engine` (samplers) + `Mixer` on an `OfflineAudioContext` and encodes via
  smplr `audioBufferToWav`. The backend sine-bank (`/export/wav`) is now only a labelled emergency
  fallback in `export/exporters.ts`.
- **Self-hosted typography pass (M1.5, deferred).** Geist Sans / JetBrains
  Mono / Cormorant Garamond / Bravura need to live under
  `apps/desktop/public/fonts/`; the visual design is functional today with
  system fonts. Pure styling work.
- **Framer-Motion choreography variants (M1.5, deferred).** UI works without
  animation today; the variants from `UI_DESIGN.md §4` (panel fades,
  marquee shimmer, beat-line pulse) layer on top.
- **Parchment ↔ Night score-theme switcher (M1.5, deferred).** OSMD style
  override + a single toggle in Settings. Mechanically small but
  ergonomically polish-only.
- **e2e Tauri test (M1.5, deferred).** PHASE_1.md §1.2 calls for a
  `@tauri-apps/test` driven flow: new project → 8 bars → save → reopen →
  transpose → export PDF. Today the same flow is covered by the unit +
  integration test surface; the e2e harness will be wired alongside the
  Phase-1 demo recording (`docs/demos/phase-1-demo.mov`).
