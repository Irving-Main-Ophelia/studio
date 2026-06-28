# Master Capability Gap Matrix

> One table to rule them. Each row is a capability seen in GarageBand (GB), Guitar Pro (GP), and/or
> Pro Tools (PT). Columns: which references have it, **our status today**, the **verdict**
> (ADOPT/ADAPT/SKIP), the **build/buy/integrate** call, the **recommended tool**, and the **track +
> phase** where it lands.
>
> Status legend: ✅ done · 🟡 partial/stub · ⛔ missing. Verdict per `README.md`.

---

## A. Notation, tablature & guitar idiom

| Capability | GB | GP | PT | Status | Verdict | B/B/I | Tool | Track · Phase |
|---|:--:|:--:|:--:|:--:|---|---|---|---|
| Standard-staff engraving | – | ● | ● | ✅ | keep | integrate | OSMD/VexFlow + Verovio | — · P1 |
| **Tablature (tab) view, synced to staff** | – | ● | – | ⛔ | **ADOPT** | integrate | OSMD (already renders tab from MusicXML) | A · P2→pull-fwd |
| Guitar articulations (bend/slide/HOPO/PM/harmonics…) | – | ● | – | ⛔ | **ADOPT** | build | music21 `<technical>` + OSMD/VexFlow | A · P2 |
| Per-string tunings / capo / 7–8-string | – | ● | – | ⛔ | **ADOPT** | build | part metadata + fret math | A · P2 |
| Interactive fretboard / keyboard viewer | ● | ● | – | ⛔ | **ADOPT** | build | React+SVG synced to playhead | A · P2 |
| Chord library / diagram builder | – | ● | – | ⛔ | **ADOPT** | build | music21 voicing engine | A · P2 |
| Scale library / fretboard scales | – | ● | – | ⛔ | **ADOPT** | build | theory engine | A · P2 |
| Rhythmic/slash notation, chord charts | – | ● | – | ⛔ | **ADAPT** | build | MusicXML slash | A · P2 |
| **Import `.gp/.gpx/.gp5` (Guitar Pro files)** | – | ● | – | ⛔ | **ADOPT** | integrate | **alphaTab** (read) → MusicXML | A · P2 |
| Export `.gp` | – | ● | – | ⛔ | **SKIP** | — | (no open writer; MusicXML covers it) | — |

## B. Audio recording & clip editing

| Capability | GB | GP | PT | Status | Verdict | B/B/I | Tool | Track · Phase |
|---|:--:|:--:|:--:|:--:|---|---|---|---|
| Multitrack **audio** recording | ● | ● | ● | ⛔ | **ADOPT** | build | CPAL (Rust) capture → takes | B · P2 |
| Multitrack **MIDI** recording | ● | ● | ● | 🟡 | extend | build | `useMidiRecorder` → take mgmt | B · P2 |
| Non-destructive clip trim/split/move | ● | ● | ● | ⛔ | **ADOPT** | integrate | wavesurfer.js regions | B · P2 |
| **Comping / playlists** (swipe comp) | – | – | ● | ⛔ | **ADAPT** | build | take lanes + comp model | B · P2 |
| **Clip gain** (per-clip level/breakpoints) | – | – | ● | ⛔ | **ADOPT** | build | Web Audio gain + UI | B · P2 |
| Fades / crossfades | ● | – | ● | ⛔ | **ADOPT** | integrate | wavesurfer envelope | B · P2 |
| **Elastic Audio / warp markers** (time/pitch to grid) | ● (Flex) | – | ● | 🟡 (RB scaffold) | **ADOPT** | integrate | Rubber Band (GPL) FFI + UI | B/D · P2 |
| **Markers / memory locations** | – | – | ● | ⛔ | **ADOPT** | build | sidecar markers; ties to form analysis | B · P1.5/P2 |
| Tempo map / beat detection | – | – | ● | ⛔ | **ADAPT** | build | onset detection (shared w/ Pillar 3) | B · P2 |
| Loop / punch recording | ● | – | ● | ⛔ | **ADAPT** | build | transport + capture | B · P2 |

## C. Mixing, routing & automation

| Capability | GB | GP | PT | Status | Verdict | B/B/I | Tool | Track · Phase |
|---|:--:|:--:|:--:|:--:|---|---|---|---|
| Per-track vol/pan/mute/solo + master | ● | ● | ● | ✅ | keep | build | `Mixer.ts` | C · P1 |
| **Buses / aux / sends** (simplified) | – | – | ● | ⛔ | **ADAPT** | build | Web Audio graph nodes | C · P2 |
| **Inserts / plugin chain** (effects) | ● | – | ● | ⛔ | **ADAPT** | integrate | **WAM 2.0 + Faust→WASM** | C · P2 |
| **Automation lanes** (draw/record any param) | ● | – | ● | ⛔ | **ADOPT** | build | sidecar curves + UI | C · P2 |
| Groups / submixes (VCA-lite) | – | – | ● | ⛔ | **ADAPT** | build | group node | C · P2 |
| **Track freeze / commit** (render to audio) | – | – | ● | ⛔ | **ADAPT** | build | OfflineAudioContext render | C · P2 |
| Per-channel metering (peak/RMS) | ● | – | ● | 🟡 | finish | build | AnalyserNode per channel (parking-lot) | C · P1.5 |
| I/O setup (interface/channel pick) | ● | ● | ● | 🟡 | extend | build | CPAL device + channel | C · P2 |
| VST3 hosting | (AU) | – | ● | ⛔ | **ADAPT** | integrate | JUCE sidecar (optional, P2) | C · P2 |
| Surround / Atmos / immersive | – | – | ● | ⛔ | **SKIP** | — | non-goal §5 | — |

## D. Instruments, tone & sound library

| Capability | GB | GP | PT | Status | Verdict | B/B/I | Tool | Track · Phase |
|---|:--:|:--:|:--:|:--:|---|---|---|---|
| **Multi-instrument sampler** | ● | ● (RSE) | ● | 🟡 (piano only) | **ADOPT (finish)** | integrate | **sfizz.wasm** + VSCO2/Sonatina/VCSL | D · P1 (M1.2) |
| **Guitar amp / cabinet / pedal modeling** | ● | – | ● | ⛔ | **ADOPT** | integrate | **Neural Amp Modeler** + GuitarML/RTNeural | D · P2 |
| **Loop browser** (key/tempo-aware, auto-conform) | ● | – | ● | ⛔ | **ADAPT** | build | CC0 loops + transpose engine + Magenta | D/E · P2 |
| Smart Controls (macro panel) | ● | – | ● | ⛔ | **ADAPT** | build | per-track macro panel | D · P2 |
| Sound packs (lazy download) | ● | ● | ● | 🟡 (planned) | keep | build | `samples.rs` installer | D · P1/P2 |
| World-music idiom packs | – | (some) | – | ⛔ | **ADOPT** | build+commission | SFZ + tuning tables (Phase-2 plan) | D · P2 |
| Tempo-without-pitch playback | – | ● | ● | 🟡 (RB scaffold) | **ADOPT (finish)** | integrate | Rubber Band FFI / SoundTouchJS preview | D · P1.5/P2 |

## E. Assistive AI, practice & learning

| Capability | GB | GP | PT | Status | Verdict | B/B/I | Tool | Track · Phase |
|---|:--:|:--:|:--:|:--:|---|---|---|---|
| **AI drummer / auto-accompaniment** | ● | – | – | ⛔ | **ADOPT** | integrate+build | Magenta **GrooVAE/Drumify** + agent | E · P2/P3 |
| Strum / arpeggiate a chord progression | ● (Smart) | ● | – | ⛔ | **ADAPT** | build | pattern generator + agent | E · P2 |
| Groove/humanize (timing/velocity feel) | ● | – | ● | ⛔ | **ADAPT** | integrate | Magenta Groove | E · P2 |
| **Speed Trainer** (progressive tempo loop) | – | ● | – | ⛔ | **ADOPT** | build | Tone.js transport | E · P1.5/P2 |
| Built-in tuner | – | ● | – | ⛔ | **ADAPT** | build | CPAL + CREPE/pYIN | E · P2 |
| Practice coach (pitch/rhythm scoring) | – | (some) | – | ⛔ | **ADOPT** | build | Pillar 10 (Phase 3) | E · P3 |
| Co-composer chat agent (theory tool-use) | – | – | – | 🟡 (10 tools) | keep/extend | build | Claude + MCP tools | — · P1→P3 |
| First-draft generation | – | – | – | 🟡 (stub) | **finish** | build/integrate | AMT/Moonbeam on Modal | — · P2 |

---

## Reading the matrix: the priority stack

If we sort by *leverage ÷ cost*, the order to attack is:

1. **Finish `sfizz.wasm` multi-instrument sound** (D, P1) — unblocks everything audible.
2. **Turn on tablature + core guitar articulations** (A) — cheap (OSMD already does it), defines the
   guitar-first identity.
3. **Markers + Speed Trainer + finish metering/tempo-without-pitch** (B/C/D/E) — small, beloved,
   mostly transport-level.
4. **Audio recording + clip editing + comping** (B) — the real "DAW" build; bigger.
5. **Buses/sends + automation lanes + WAM/Faust effects** (C) — the mixer maturation.
6. **Amp modeling, loop browser, AI drummer** (D/E) — the GarageBand-class delight layer.

Cross-cutting prerequisite, do it in Phase 1: **extend the project data model** (mixer sends,
automation lanes, clip references, markers) before we build the UIs — see
[`REFINE_AND_ERADICATE.md`](./REFINE_AND_ERADICATE.md) §"Data model".
