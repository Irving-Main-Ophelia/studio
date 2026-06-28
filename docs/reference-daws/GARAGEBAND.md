# Teardown — GarageBand (Apple)

> **Why this teardown.** GarageBand is the reference for *approachable music-making* and *assistive
> creation*: the Drummer, Smart Controls, amps & pedalboards, Apple Loops, and Flex. Stockhausen is
> not a beat-making toy, but GarageBand's "the tool helps you sound good fast" ethos maps directly
> onto our agent-assisted, composer-first promise. The standout lessons: **AI accompaniment**,
> **guitar tone**, and **a great loop/sound browser**.

---

## 1. What GarageBand is

A consumer DAW: audio + MIDI multitrack recording, a large free Sound Library, software instruments,
guitar/voice presets with amp & pedalboard modeling, the **Drummer** virtual session player, **Flex
Time / Flex Pitch** editing, **Groove Track** timing alignment, **Smart Controls**, and **Apple
Loops**. On iPad/iPhone it adds **Smart Instruments** (auto-strum/auto-play). It is the gateway drug
to Logic Pro.

---

## 2. Feature inventory → verdict

### 2.1 Assistive creation

| Feature | What it does | Stockhausen today | Verdict | Tech path |
|---|---|---|---|---|
| **Drummer** | AI session drummer: 28 drummers/6 genres, signature kits, groove/fill dials, *follows* a chosen Groove Track | ✗ | **ADOPT** | Magenta **GrooVAE/Groove** + **Drumify** (drum part from a melody/bassline rhythm); the agent picks style. Track E. |
| **Smart Instruments** (iOS) | auto-strum/arpeggiate from chords | ✗ | **ADAPT** | "Strum/arpeggiate this chord progression" as an agent tool + a strum-pattern generator. Ties to guitar (Track A/E). |
| **Groove Track** | nominate one track; others snap to its timing feel | ✗ | **ADAPT** | Useful once we have multi-track MIDI/audio. Phase 2. |
| **Flex Time** | drag note timing in audio; quantize-by-feel | ✗ | **ADAPT** | Audio warp = Rubber Band markers (Track B). Symbolic quantize already feasible via theory engine. |
| **Flex Pitch** | per-note pitch editing of monophonic audio | ✗ | **ADAPT (mono only)** | Monophonic pitch (CREPE/pYIN) → editable note overlay → re-render. Polyphonic DNA is **SKIP** (see Pro Tools §ARA). |

### 2.2 Instruments, tone & sound library

| Feature | Stockhausen today | Verdict | Tech path |
|---|---|---|---|
| Software instruments (sampled + modeled) | `smplr` piano stopgap | **ADOPT (finish)** | `sfizz.wasm` + curated SFZ packs (Track D). Highest-leverage plumbing. |
| **Amp designer + pedalboard** (guitar tone) | ✗ | **ADOPT** | **Neural Amp Modeler (MIT)** + **GuitarML Proteus / RTNeural** (LSTM, ~2% CPU). Run native (Rust/CPAL path) or WASM/AudioWorklet. 6,500+ free NAM profiles exist (Tone3000). Track D. |
| **Smart Controls** (one panel of the *right* knobs per instrument/fx) | ✗ | **ADAPT** | A small "macro panel" per track that surfaces the few parameters that matter; the agent can set them. |
| **Apple Loops** browser (tag/key/tempo-aware, auto-conform) | ✗ | **ADAPT** | Build an open **Loop Browser** over CC0 packs + agent/Magenta-generated loops; auto-transpose to project key (we already transpose). Track D/E. |
| Sound Packs (downloadable) | sample install plan exists (M1.2) | keep | Lazy install to App Support (already planned). |

### 2.3 Recording & editing

| Feature | Stockhausen today | Verdict | Notes |
|---|---|---|---|
| Multitrack **audio** recording | meter only (CPAL); no takes | **ADOPT** | Track B. Pillar 2/Phase-2 recording was named but never specced. |
| Multitrack **MIDI** recording | `useMidiRecorder` exists | keep/extend | Promote to real take management. |
| Audio regions, trim, loop, fades | ✗ | **ADOPT** | Track B (wavesurfer.js regions/envelope). |
| Automation (volume/pan/plugin) | ✗ | **ADOPT** | Track C. |
| Quantize / transpose / tempo | symbolic transpose ✓ | keep | — |

### 2.4 Things GarageBand has that we SKIP

- **Live Loops grid / DJ-style performance** — performance tool; North Star §5.1 non-goal.
- **Sound-pack store / social** — §5.3/§5.6.
- **"Beat-making from a prompt" novelty** — we are theory-correct and editable, not Suno/Udio (§5.2).

---

## 3. The three lessons worth internalizing

1. **Assistive accompaniment is a force multiplier, not a gimmick.** A composer with a guitar +
   melody wants drums/bass/keys *now*. Drummer proves the pattern. Our version is the agent +
   Magenta + the theory engine, so the output is editable and explainable (North Star §2). →
   **Track E**.

2. **A guitar-first tool must sound like a guitar.** Sampled SFZ gets us orchestral instruments;
   **neural amp modeling** gets us believable electric/acoustic guitar tone. NAM + GuitarML are
   open, MIT-class, real-time, and 2026-current. This is genuinely new vs. our roadmap. →
   **Track D**.

3. **Browsing > building, for raw material.** A tagged, key/tempo-aware **loop & sound browser**
   that auto-conforms to the project is how GarageBand removes friction. We already transpose
   losslessly, so auto-conform is nearly free. → **Track D/E**.

---

## 4. Net new work this teardown creates

- **Track D — Instruments, Tone & Sound Library** (sfizz finish, NAM/GuitarML amp modeling, Smart
  Controls macro panel, Loop Browser).
- **Track E — Assistive / AI Creation** (AI drummer via Magenta, strum/arpeggiate, groove/humanize).
- Reinforces **Track B** (audio recording/editing) and **Track C** (automation).

---

## Sources

- [GarageBand for Mac — Apple](https://www.apple.com/mac/garageband/) · [GarageBand — Wikipedia](https://en.wikipedia.org/wiki/GarageBand) · [GarageBand release notes](https://support.apple.com/en-us/109515)
- [Flex tool in GarageBand (time-stretch / pitch-shift)](https://www.productlondon.com/flex-tool-in-garageband/)
- [Neural Amp Modeler — official](https://www.neuralampmodeler.com/) · [GuitarML](https://guitarml.com/) · [NAM explained](https://www.necrogrooves.com/insights/what-is-neural-amp-modeler-nam)
- [Magenta GrooVAE](https://magenta.tensorflow.org/groovae) · [Magenta Studio (Drumify/Groove/Generate)](https://magenta.withgoogle.com/studio/) · [@magenta/music JS](https://magenta.github.io/magenta-js/music/)
