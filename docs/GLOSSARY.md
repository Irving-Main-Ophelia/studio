# Glossary

> Terms a non-musician engineer (and a non-engineer musician) needs to know to work on Stockhausen.

## Music terms

- **DAW** — Digital Audio Workstation. Pro Tools, Logic, Ableton, Cubase, Reaper, etc.
- **MIDI** — Musical Instrument Digital Interface. *Symbolic* events: "note C4 on, velocity 100, at time T". Not audio.
- **MusicXML** — W3C standard XML format for exchanging sheet music.
- **MEI** — Music Encoding Initiative. Scholarly XML for music.
- **ABC notation** — Text-based shorthand for music: `|: C D E F | G A B c :|`.
- **SFZ / SF2** — Open / SoundFont sample-library formats.
- **VST3 / AU / AAX / CLAP / LV2** — Plugin formats (Steinberg / Apple / Avid / open / Linux).
- **Voice-leading** — How individual melodic lines move from chord to chord. A correctness criterion.
- **Modulation** — Changing key during a piece.
- **Transposition** — Moving all notes up/down by the same interval.
- **Enharmonic** — Same pitch, different name (F♯ = G♭).
- **Reharmonization** — Same melody, different chords.
- **Counterpoint** — Multiple independent melodic lines (Bach, fugue).
- **Articulation** — *How* a note is played (legato, staccato, marcato, …).
- **Dynamics** — *How loudly* (pp, p, mp, mf, f, ff, ...).
- **Tempo** — How fast (BPM).
- **Tonality / Key** — The "home" pitch class and mode (C major, F♯ minor, …).
- **Roman numeral analysis** — Labeling chords by function (I, IV, V, vi, …).
- **Form** — The architecture of a piece (sonata-allegro, rondo, fugue, AABA, …).
- **Motif** — A short recurring musical idea.
- **Orchestration** — Deciding which instruments play which lines.
- **Idiomatic** — Natural to a specific instrument or style.
- **Radif** — The traditional repertoire and modal system of Persian classical music.
- **Dastgāh** — A Persian modal system (akin to a mode/scale + characteristic motifs).
- **Polyphonic** — Multiple notes sounding at once. (Vs. monophonic.)

## Engineering & ML terms

- **Onset detection** — Finding when a new note starts in audio.
- **Pitch detection / tracking** — Finding what pitch is sounding at each moment.
- **Quantization** — Snapping performed timings to a grid (16th notes, 8th notes, etc.).
- **DSP** — Digital Signal Processing.
- **DDSP** — Differentiable DSP. ML technique that learns synthesizer parameters end-to-end.
- **AudioWorklet** — Web standard for low-latency, dedicated-thread DSP in browsers.
- **CRDT** — Conflict-free Replicated Data Type. The math behind real-time collab (e.g., Yjs).
- **MCP** — Model Context Protocol. Anthropic's open standard for exposing tools to LLMs.
- **LoRA** — Low-Rank Adaptation. Lightweight fine-tuning method.
- **ONNX** — Open Neural Network Exchange. Cross-framework model format.
- **Tauri** — Rust-based desktop app framework using the system WebView.
- **CPAL** — Cross-Platform Audio Library (Rust).
- **JUCE** — C++ framework for audio plugins / apps.
- **SOTA** — State Of The Art.
- **Score** (audio engineering sense) — A musical document with notation.
- **Stem** — An isolated audio track for one element (drums, vocals, bass, …).
- **VST host** — A program that loads VST plugins (instruments and effects).

## Project-specific terms

- **Pillar** — One of the seven (or fifteen, with our additions) major capabilities Stockhausen targets. See [`NORTH_STAR.md`](../NORTH_STAR.md) §3–§4.
- **OperationLog** — Event-sourced record of every change to a Project.
- **Composer Vector** — A learned latent direction that, when added, nudges generated music toward a composer's style.
- **Idiom Library** — A curated rules + examples bundle for an orchestration/genre context (e.g., "Romantic Orchestra", "Persian Radif", "Hard Rock", "Big Band").
- **Theory Engine** — The validation layer that gates every AI musical change.
