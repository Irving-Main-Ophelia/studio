# Teardown — Guitar Pro 8 (Arobas Music)

> **Why this is the most important teardown.** Stockhausen's founding scene (North Star §0) is *a
> composer sitting with a guitar*. Guitar Pro is the world's reference for guitar-centric notation,
> tablature, and practice. Almost everything here is **ADOPT** or **ADAPT**, and most of it is
> currently **missing** from Stockhausen.

---

## 1. What Guitar Pro is

A tab-and-notation editor + realistic playback engine + practice tool, organized around the
guitarist's mental model (frets, strings, techniques, tunings) rather than the engraver's. It reads
and writes its own `.gp` family plus MusicXML/MIDI, and ships giant chord/scale libraries and a
"Realistic Sound Engine" (RSE) of 200+ soundbanks.

---

## 2. Feature inventory → verdict

### 2.1 Notation & tablature

| Feature | Stockhausen today | Verdict | Notes |
|---|---|---|---|
| **Dual view: tablature + standard staff** synced | Standard staff only (OSMD) | **ADOPT** | OSMD already renders tab from MusicXML (string/fret, bends, glissandi). Lowest-cost high-impact win. Track A. |
| **Rhythmic (slash) notation** | ✗ | **ADAPT** | Useful for lead sheets / chord charts. MusicXML supports it. |
| Multi-track (guitars, bass, drums, keys, strings) | Multi-part MusicXML supported in model | **ADOPT** | Already in the data model; needs tab-aware UI + multi-instrument sound (Track D). |
| **Per-string tunings & capo** (drop D, DADGAD, 7/8-string, custom) | ✗ | **ADOPT** | Core guitar feature. Store on the part; affects tab fret math + transposition. |
| Drum tablature / percussion view | ✗ | **ADAPT** | alphaTab + OSMD both render drum tab from MusicXML. Phase 2 (rhythm section). |
| Grand staff (piano) | Supported | keep | — |

### 2.2 Guitar articulations (the heart of guitar notation)

| Technique | Stockhausen today | Verdict |
|---|---|---|
| Bend / pre-bend / release (with curve + target) | ✗ | **ADOPT** |
| Slide (legato / shift / in / out) | ✗ | **ADOPT** |
| Hammer-on / pull-off (HOPO) | ✗ | **ADOPT** |
| Vibrato (light / wide) | partial (articulation set has none guitar-specific) | **ADOPT** |
| Palm mute / let ring | ✗ | **ADOPT** |
| Tapping / slapping / popping | ✗ | **ADAPT** |
| Harmonics (natural / artificial / pinch) | ✗ | **ADOPT** |
| Dead/ghost notes, rakes | ✗ | **ADOPT** |
| Whammy/tremolo bar dives | ✗ | **ADAPT** |
| Strumming direction / brush / arpeggio stroke | ✗ | **ADOPT** |

> These are not cosmetic. They're how a guitarist *thinks* and how the agent must read/write guitar
> parts (Pillars 3–4). MusicXML 4.0 encodes all of them; OSMD/VexFlow render most; our music21 edit
> pipeline can emit them. This is the bulk of **Track A**.

### 2.3 Libraries & assistants

| Feature | Stockhausen today | Verdict | Tech |
|---|---|---|---|
| **Chord library / diagram builder** (thousands of voicings) | ✗ | **ADOPT** | Generate voicings algorithmically (music21 + fretboard model) rather than ship a static DB. The agent already "knows" theory. |
| **Scale library / fretboard scale viewer** | ✗ | **ADOPT** | Same engine; ties to Theory Tutor (Pillar 8). |
| **Interactive fretboard / keyboard view** (shows what's playing) | ✗ | **ADOPT** | Custom React+SVG component synced to playhead + selection. |
| Chord diagrams auto-shown above staff | ✗ | **ADAPT** | Derive from harmony; user toggles density (GP8 lets you customize). |

### 2.4 Playback & sound

| Feature | Stockhausen today | Verdict | Notes |
|---|---|---|---|
| **RSE — realistic per-instrument soundbanks (200+)** | `smplr` piano stopgap | **ADAPT** | Our equivalent = `sfizz.wasm` + curated SFZ packs (Track D). Don't license RSE; build the open path. |
| Per-track instrument assignment, mixer | mixer v1 (vol/pan/mute/solo) | keep/extend | Track C. |
| Tone shaping for guitar (amp/dist) | ✗ | **ADOPT** | Neural Amp Modeler / GuitarML — see `GARAGEBAND.md` §2.4 and Track D. |
| Count-in, metronome, looping, solo/mute | **shipped** | keep | Already in Phase 1. |

### 2.5 Practice (Guitar Pro's signature)

| Feature | Stockhausen today | Verdict | Notes |
|---|---|---|---|
| **Speed Trainer (progressive tempo 10–300% over repeats)** | ✗ | **ADOPT** | Small, beloved feature. Drive from the Tone.js transport. Track E / Pillar 10. |
| Loop a passage + tempo-without-pitch | loop ✓; tempo-w/o-pitch = Rubber Band scaffold only | **ADOPT (finish)** | Finish Rubber Band FFI (Track D / parking-lot). |
| Visual count-in | partial | **ADOPT** | — |
| Built-in tuner (line-in) | ✗ | **ADAPT** | CPAL input + monophonic pitch (CREPE/pYIN). Cheap, guitar-friendly. |
| Backing-track / minus-one practice | ✗ | **ADAPT** | Already named in Pillar 12 (Phase 3 exports). |

### 2.6 File interchange

| Feature | Stockhausen today | Verdict | Tech |
|---|---|---|---|
| **Import `.gp`, `.gpx`, `.gp5`, GP3-5, PowerTab, TablEdit** | ✗ | **ADOPT (import)** | **alphaTab** (`@coderline/alphatab`, MPL-2.0) reads GP3–8 + MusicXML and can hand us a parsed model. |
| Import MusicXML / MIDI / ASCII tab | MusicXML ✓, MIDI ✓ | keep | — |
| Export MusicXML / MIDI / PDF / PNG / SVG / audio | MusicXML/MIDI/PDF/WAV ✓ | keep/extend | Add PNG/SVG of the engraving; tab in PDF. |
| Export `.gp` | ✗ | **SKIP (for now)** | alphaTab **cannot write** `.gp`. Writing the proprietary format is low value for personal use; MusicXML round-trip covers interchange. Revisit only on demand. |

---

## 3. The critical build-vs-buy call: alphaTab vs OSMD

This is the decision that shapes Track A.

- **alphaTab** (`@coderline/alphatab`): cross-platform **renderer + player** for tab/notation. Reads
  Guitar Pro 3–8, MusicXML, and its own `alphaTex`. Plays via a built-in SoundFont2 synth
  (`alphaSynth`) over Web Audio. **Render/play only — it is not an editor and cannot write files.**
- **OSMD** (already shipped): renders MusicXML (incl. tablature, bends, glissandi) via VexFlow.
  Also display-only; our edits go through music21 → reload (ADR-0015).

**Recommendation:**
- **Primary renderer stays OSMD.** It already does tab, it's already wired to our edit pipeline, and
  keeping one renderer avoids a fork in the display layer.
- **Add alphaTab as an *importer* only** — to ingest `.gp/.gpx/.gp5` files that musicians actually
  trade, convert alphaTab's parsed model → MusicXML → our pipeline. Optionally use alphaTab's
  player as a quick **preview** for imported tabs before conversion.
- **Author/edit tab through our existing music21 pipeline**, extended to emit `<technical>` and
  `<notations>` guitar elements. Neither alphaTab nor OSMD edits; our backend already owns editing.

This keeps one source of truth (MusicXML in `ScoreEngine`) and one edit path, while still letting the
maintainer open the entire Guitar Pro ecosystem of files.

---

## 4. What to SKIP and why

- **`.gp` export** — proprietary, write-unsupported by open libs, low personal-use value. MusicXML
  is our interchange truth (North Star §6.3). Revisit only if a collaborator demands `.gp`.
- **mySongBook / online tab store** — content marketplace; out of scope (North Star §5.3).
- **GP's social/sharing** — local-first posture (§5.6).

---

## 5. Net new work this teardown creates

- **Track A — Tablature & Guitar-Centric Notation** (tab+staff view, tunings/capo, the full guitar
  articulation set, fretboard component, chord/scale engine, alphaTab GP import).
- Feeds **Track D** (guitar tone) and **Track E** (speed trainer, tuner).
- Pulls a meaningful slice of **Phase 2** (guitar) forward, because tablature + articulations make
  the eventual live guitar→score capture (Pillar 3) legible.

---

## Sources

- [Guitar Pro 8 — features](https://www.guitar-pro.com/c/14-guitar-pro-features)
- [Guitar Pro 8 — what's new](https://www.guitar-pro.com/c/10-guitar-pro-new-features)
- [alphaTab — GitHub](https://github.com/CoderLine/alphaTab) · [alphaTab docs — introduction](https://alphatab.net/docs/introduction) · [alphaTab — Guitar Pro 8 format](https://alphatab.net/docs/formats/guitar-pro-8)
- [VexFlow — repo (tablature support: TabStave/TabNote)](https://github.com/vexflow/vexflow) · [VexTab tutorial](https://www.vexflow.com/vextab/tutorial.html)
- [OpenSheetMusicDisplay — GitHub](https://github.com/opensheetmusicdisplay/opensheetmusicdisplay) (renders tab + bends/glissandi from MusicXML)
