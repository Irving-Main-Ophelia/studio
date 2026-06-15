# Research Notes — May 2026

> Snapshot of the state-of-the-art landscape that informed the choices in `../NORTH_STAR.md`. Re-evaluated quarterly.
> Last reviewed: **May 13, 2026**.

---

## 1. Symbolic music generation (text/concept → score)

| Model | Released | License | Best for | Notes |
|---|---|---|---|---|
| **Anticipatory Music Transformer** | 2023, updated | Open weights, code | Infilling, accompaniment, in-the-loop edits | Best fit for "modify this region without breaking the rest" |
| **Moonbeam** | May 2025 | Open weights | MIDI foundation model, downstream tasks | 81.6k hours; Multidimensional Relative Attention; strong base for fine-tuning |
| **Hi-ACG** | Apr 2026 | Research | Long-sequence coherence | 34.7% reduction in cosine drift; novel for full-piece generation |
| **MusicGen** (Meta) | 2023+ | CC-BY-NC for weights | Audio generation, not symbolic | Useful for *sketches*, not editable; commercial license unclear |
| **MuseMorphose** | 2021 | Research | Bar-level style transfer (piano) | Useful reference; older but proven |
| **ImprovNet** | Feb 2025 | Research | Improvisation, controllable corruption-refinement | Interesting for the live-jam use case |
| **ComposerX** | Apr 2024 | Research | Multi-agent symbolic composition | Validates the multi-agent direction |

**Decision:** Moonbeam as base → Anticipatory Music Transformer for in-context editing → Composer Vector for style steering. Multi-agent orchestration following ComposerX pattern.

---

## 2. Style transfer to specific composers

| Approach | Year | What | Why it matters |
|---|---|---|---|
| **Composer Vector** | 2026 | Inference-time steering in latent space; continuous coefficient; blends multiple composers | No retraining needed; works with our base model |
| **Two-stage "Generality to Mastery"** | 2025 | Pre-train on broad corpus + lightweight per-composer adapters | Data-efficient for our small reference roster |
| **MuseMorphose VAE** | 2021 | Transformer VAE for piano with bar-level attribute control | Older but solid foundation |

**Decision:** Composer Vector at inference + lightweight LoRA adapters per composer.

---

## 3. Audio → MIDI transcription (incl. live guitar)

| Tool | Type | Real-time? | Quality | Notes |
|---|---|---|---|---|
| **MIDI Guitar 3** (Jam Origin) | Commercial | Yes (~10 ms) | Best polyphonic guitar | $40–60 license; MPE; no special pickup |
| **MiGiC NX** | Commercial | Yes | Excellent | $40 one-time; AI-driven 5-sec calibration |
| **Fishman TriplePlay** | Hardware + SW | Yes (sub-5 ms) | Excellent | $400 hex pickup; world's fastest |
| **Basic Pitch** (Spotify) | Open, MIT | Batch (FR proposal Jan 2026) | Good polyphonic | <20 MB; great for clean audio |
| **YourMT3+** | Research, code open | Batch | SOTA multi-instrument | Hierarchical transformer + MoE |
| **MT3** (Magenta) | Research, code open | Batch | Strong baseline | T5-style; multi-task |
| **contrapunk** | Open | Yes | Improving | 2026 work on 256-sample hops + harmonic templates |

**Decision:**
- T1 (Phase 2): integrate MIDI Guitar 3 (best UX, fastest to ship).
- T2 (Phase 3): build in-house using contrapunk-inspired pipeline + small ONNX model on guitar tones.
- T3 (optional): support TriplePlay for pros.

---

## 4. Notation rendering libraries

| Library | Type | License | Strengths |
|---|---|---|---|
| **OpenSheetMusicDisplay 1.9.7** | TS, MIT, built on VexFlow | MIT | MusicXML in/out; playback in development; active community |
| **VexFlow 5.0** | TS, MIT | MIT | Lower-level; full control over engraving |
| **Verovio** | C++/JS, LGPL | LGPL | Scholarly engraving quality; MEI native; PDF output |
| **abcjs** | JS, MIT | MIT | Quick ABC text → notation; great for live input UX |

**Decision:**
- **OSMD** for primary editor rendering.
- **VexFlow** direct for custom widgets.
- **Verovio** for export-quality PDFs.
- **abcjs** for an optional "type ABC, see notation" power-user surface.

---

## 5. Web audio frameworks

| Framework | Purpose | Maturity | License |
|---|---|---|---|
| **Tone.js** | Transport, scheduling, synths, FX | Mature | MIT |
| **Web Audio Modules 2.0** | Plugin standard for web ("VST for the web") | 2021+, growing | MIT |
| **SoundTouchJS** | Time/pitch stretch | Mature | LGPL |
| **WebAudioFont** | SoundFont playback | OK | MIT |
| **sfizz-wasm** | SFZ player | Experimental | ISC |
| **fluidsynth-wasm** | SF2 player | Experimental | LGPL |

**Decision:** Tone.js for transport; sfizz/fluidsynth in WASM for sample playback; WAM 2.0 for plugin hosting.

---

## 6. Native audio (Tauri + Rust path)

| Crate | Purpose |
|---|---|
| **cpal 0.17.3** (Feb 2026) | Cross-platform audio I/O (CoreAudio / WASAPI / ASIO / ALSA / JACK / Web Audio) |
| **midir** | Cross-platform MIDI |
| **rubato** | Sample-rate conversion |
| **fundsp / kira** | DSP graphs |
| **ort** (ONNX Runtime) | On-device inference |
| **candle** | Pure-Rust ML inference |
| **Rubber Band (C++ FFI)** | Pitch/time stretch (commercial license needed for distribution) |

---

## 7. Music theory engines (Python)

| Library | Latest | Strengths |
|---|---|---|
| **music21** | mature | The de-facto standard; massive feature surface |
| **partitura 1.8.0** (Feb 2026) | active | Modern, ML-friendly; clean Score API |
| **symusic 0.6.0** (Apr 2026) | active | C++20 core; very fast for large symbolic ops |
| **gingo 2.0.1** (Mar 2026) | newer | Pitch-class / harmony primitives; MIDI 2.0 support |
| **musif** | active | Feature extraction for ML pipelines |

**Decision:** music21 as primary; partitura for ML data loading; symusic for performance-critical bulk operations.

---

## 8. Cloud GPU pricing (May 2026)

| Vendor | H100 | A100 80GB | Billing | Best for |
|---|---|---|---|---|
| **Modal** | $3.95/hr ($0.0011/sec) | $2.50/hr | per-second, no idle | Our serverless ML inference |
| **RunPod (Pods)** | $3.35/hr | $2.17/hr | hourly | Long-running training |
| **RunPod (Serverless)** | ~$4.18/hr equiv. | — | per-sec + $0.25 base | Bursty traffic |
| **Replicate** | $5.49/hr | $5.04/hr | per-sec, includes idle | Quick public-model serving |
| **Fly.io GPU** | varies | varies | per-second | Co-located with our orchestrator |

**Decision:** Modal for primary inference; Fly.io for the orchestrator API (proximity); RunPod Pods for training/fine-tuning bursts.

---

## 9. LLM landscape for music tool-use

- **Claude Opus 4.7 / Sonnet 4.6** — currently strongest for music21 tool-use; `mcp-score` open-source project demonstrates this (18 MCP tools for MuseScore/Dorico/Sibelius).
- **GPT-5.5** — fast, great function calling, voice via Realtime API.
- **Gemini 3.1 Pro** — long context useful for analyzing full scores.

**Decision:** Claude Opus 4.7 (primary planner + theory tools) + GPT-5.5 (fast paths + voice) + Gemini 3.1 (long-context analysis).

---

## 10. Voice agents

- **OpenAI Realtime API** (`gpt-realtime-2`, `gpt-4o-realtime-preview-2026-01-21`) — WebRTC, 300–500 ms latency, function calling.
- Pricing roughly **$0.06–0.10 per minute of input audio**.
- Tool-call support is native.

**Decision:** OpenAI Realtime for voice in Phase 2.

---

## 11. Existing platforms we may embed / partner with

| Platform | What | API | Cost |
|---|---|---|---|
| **Soundslice** | Score + audio sync, embeddable player + data API | REST + JS player API | Free embeds; data API requires Teacher/Licensing plan |
| **Flat.io** | Embeddable editor + 66-method JS SDK v2 | TS SDK | Free for personal; tiered API |
| **MuseScore Studio** | Desktop notation, free | Limited integration | Free |
| **Dorico** | Pro notation; has Remote Control + Scripting API | Documented (limited) | Commercial license |
| **Sibelius Cloud** | Cloud notation + OAuth2 API | REST | Tiered |

**Decision:** Embed Soundslice/Flat for public sharing; provide one-click export to MuseScore/Dorico for users who already use them.

---

## 12. Sample libraries (free, redistributable)

| Library | License | Coverage |
|---|---|---|
| **VSCO 2 Community Edition** | CC0 | Orchestra (3 GB) |
| **Sonatina Symphonic Orchestra** | Open | Strings, brass, woodwinds (v4.0 Dec 2024) |
| **Versilian Community Sample Library** | CC0 | Orchestral + world + experimental (5 GB) |
| **Persa.sf2** | Free | Persian tar/setar/santur/ney/kamancheh |
| **Various Ancient Sounds packs** | Royalty-free | Setar, ney, santur (per-instrument) |

**Decision:** Bundle VSCO 2 CE + Sonatina + VCSL for the free tier (~10 GB). Add Persa.sf2 + commissioned/licensed Persian samples for the Radif Starter Pack. Premium users can route to their own VST3 instruments.

---

## 13. Training datasets

| Dataset | License | Use |
|---|---|---|
| **MAESTRO V3** | CC BY-NC 4.0 | Research only |
| **Lakh MIDI v0.1** | CC-BY 4.0 | Symbolic pre-training (commercial OK with attribution) |
| **Slakh2100** | CC-BY 4.0 | Transcription training |
| **RWC 2.0** | CC BY-NC 4.0 | Research only |
| **POP909** | CC BY-NC | Research only |

**Decision:** Pre-train on Lakh + Slakh2100 (commercial-friendly). For per-composer adapters, use public-domain compositions (most pre-1925 classical) performed by us or licensed performers — never train on copyrighted recordings.

---

## 14. Desktop framework: Tauri 2 vs Electron

| Aspect | Tauri 2 | Electron |
|---|---|---|
| Bundle size | 10–100× smaller | Heavy |
| RAM usage | Native WebView | Bundled Chromium |
| Performance | Native | OK |
| Audio I/O | Excellent via Rust + CPAL | OK |
| Native modules | Rust ecosystem | Node.js ecosystem |
| Auto-update | Built-in | Mature |
| Ecosystem maturity | Growing fast | Massive |

**Decision:** Tauri 2 for the right blend of small binary, native performance, and React UX. Electron only if a hard dependency forces us.

---

## 15. Real-time collaboration

- **Yjs** is the de-facto CRDT for collaborative apps.
- Strudel (live-coding) ships Yjs-based collab in 2026 — proves the pattern for music tools.
- RiffScore is an embeddable React notation editor we could learn from (no Yjs yet but on the radar).

**Decision:** Yjs in Phase 3.

---

## 16. Notation interchange formats

- **MusicXML 4.0** (W3C, 2021) — 250+ apps; canonical interchange. Backward-compatible with 1.0–3.1.
- **MEI 5.1** (Jan 2025) — scholarly XML; great for critical editions.
- **MIDI** — performance only, no notation.
- **ABC** — text-based; great for power users.

**Decision:** MusicXML 4.0 internal; MEI export for scholarly use cases; ABC for power-user entry.

---

## 17. Pitch/time stretching for transposition

| Tool | Quality | License | Notes |
|---|---|---|---|
| **Rubber Band** | Excellent | Commercial / GPL | Industry-standard; commercial license $5k+ |
| **zplane élastique** | Broadcast-grade | Commercial only | Higher cost; used by DAWs |
| **SoundTouchJS** | OK in browser | LGPL | Quick preview |
| **signalsmith-stretch** | Fast, open | Open | Promising for in-browser |

**Decision:** Rubber Band (licensed) for final-quality renders; SoundTouchJS for instant previews in the browser.

---

## Updates log

- **2026-05-13** — initial draft. Captures state of art at project kickoff.
