# Phase 0 — Foundations

> **Status:** ✅ Complete (May 13, 2026 — accelerated single-session sprint).
> **Duration target:** ~4 weeks part-time. **Actual:** one full evening.
> **Outcome:** A working "Hello, composer" demo that proves the end-to-end architecture on the maintainer's MacBook Air M2.

---

## 0.1 Goal

By the end of Phase 0, the maintainer should be able to:

1. Open the Stockhausen desktop app on macOS.
2. Load a MusicXML file. See it rendered as notation in the center pane.
3. Press play. Hear it through the system audio (via Tone.js + a free SoundFont).
4. Type into the agent panel: *"What key is this in?"* — and the agent answers using a real tool call to `theory.analyze_key`.
5. Type: *"Transpose this to F♯ minor"* — and the score updates.
6. Plug in a guitar/MIDI device. See input levels show up in a small monitor.

That's the demo. No styling polish, no extra features. **Architecture proof.**

## 0.2 Success criteria (Definition of Done)

- [x] `apps/desktop` builds and launches a Tauri 2 window on macOS Apple Silicon (the maintainer's M2 Air).
- [x] The window renders a React 19 + TypeScript UI with the three-pane shell from `docs/UI_DESIGN.md`.
- [x] Design-system tokens (colors, typography, spacing) are wired into Tailwind config from `docs/UI_DESIGN.md`.
- [x] A `.musicxml` file from `apps/desktop/public/fixtures/` loads via the file menu and renders with OpenSheetMusicDisplay (OSMD).
- [x] A "Play" button triggers a Web Audio engine (smplr + SplendidGrandPiano) to play the loaded score. Tone.js is in the bundle and ready to host the Phase-1 transport.
- [x] CPAL captures audio from the default macOS input device and shows a peak meter in the bottom rail.
- [x] Web MIDI shows a list of available MIDI inputs.
- [x] `backend/agent` runs as a local FastAPI server (`uvicorn`) and exposes:
  - `GET /health` — returns `{"status":"ok"}`
  - `POST /transpose` — accepts MusicXML + target key, returns transposed MusicXML using `music21`.
  - `POST /score/notes` — flat note list with tempo for browser playback.
  - `POST /score/key` — key estimation.
  - `POST /agent/chat` — Claude tool-use loop with `theory.analyze_key` + `score.transpose` tools.
- [x] The desktop app talks to the local backend over `127.0.0.1:8000`.
- [x] All code is committed to the local git repository with conventional-commit messages.
- [x] `ADR-0002` through `ADR-0008` are written.
- [ ] A `phase-0-demo.mov` screen recording exists in `docs/demos/` — *manual maintainer task; run `pnpm tauri:dev`, walk through the flow, capture with QuickTime, drop into `docs/demos/`*.

## 0.3 Scope

In Phase 0 we build the **thinnest end-to-end vertical slice** that proves every layer of the architecture. We do *not* polish, we do not feature-complete anything, we do not optimize.

What we touch:
- The Tauri shell.
- The React UI shell (just structure, not rich UX).
- The Tailwind theme.
- The audio engine (the most basic Tone.js wiring).
- The Rust core (just CPAL audio capture + MIDI enumeration).
- The Python backend (FastAPI + music21).
- The agent loop (one tool, one model).
- The IPC: UI ↔ Rust core, UI ↔ Python backend.

What we *don't* touch in Phase 0 (parked to later phases):
- Note entry (clicking on a staff to add notes).
- Multi-track recording.
- Mixing.
- Audio file export.
- PDF export.
- Anything from Pillars 1, 3, 6, 8, 9, 10, 11, 12.
- Voice agent.

## 0.4 Stack lockdown (decided)

These are decisions for Phase 0 specifically. Captured in ADRs.

| Area | Choice | ADR |
|---|---|---|
| Desktop shell | Tauri 2 (Rust 1.80+) | [`adr/0001-tauri-vs-electron.md`](../adr/0001-tauri-vs-electron.md) |
| UI framework | React 19 + Vite 5 + TypeScript 5 (strict) | ADR-0002 |
| Styling | Tailwind CSS 4 + shadcn/ui (Radix primitives) | ADR-0003 |
| Notation rendering | OpenSheetMusicDisplay 1.9.7 | ADR-0004 |
| Audio engine (browser side) | Tone.js + a single SoundFont SF2 via `WebAudioFont` or `soundfont-player` | ADR-0005 |
| Audio I/O (native side) | CPAL 0.17.3 (via Tauri command) | (no new ADR; covered in 0001) |
| Backend | FastAPI 0.115+ on Python 3.12, `uvicorn`, `music21` 9+ | ADR-0006 |
| LLM | Claude Sonnet 4.6 via Anthropic API (cheaper than Opus for Phase 0) | ADR-0007 |
| Package manager (JS) | `pnpm` | ADR-0008 |
| Monorepo layout | `apps/desktop` + `backend/agent` + `packages/*` + `tools/*` | (described in README) |

If during Phase 0 we find we need to reverse any of these, we write a new ADR superseding the prior one — never silently change.

## 0.5 Repository scaffold

```
stockhausen/
├── apps/
│   └── desktop/                         # Tauri 2 desktop app
│       ├── src-tauri/                   # Rust core
│       │   ├── Cargo.toml
│       │   ├── tauri.conf.json
│       │   └── src/
│       │       ├── main.rs
│       │       ├── audio.rs             # CPAL wiring
│       │       └── midi.rs              # midir wiring
│       ├── src/                         # React + TypeScript UI
│       │   ├── main.tsx
│       │   ├── App.tsx
│       │   ├── shell/                   # 3-pane layout
│       │   ├── notation/                # OSMD wrapper
│       │   ├── audio/                   # Tone.js wiring
│       │   ├── agent/                   # Chat panel
│       │   ├── ipc/                     # Tauri commands wrappers
│       │   └── styles/
│       │       └── tokens.css           # Design-system CSS variables
│       ├── public/
│       │   ├── fixtures/
│       │   │   ├── bach-invention-1.musicxml
│       │   │   └── musyng-kite.sf2       # General-MIDI SoundFont
│       │   └── ...
│       ├── package.json
│       ├── tsconfig.json
│       ├── tailwind.config.ts
│       ├── vite.config.ts
│       └── index.html
├── backend/
│   └── agent/                           # FastAPI agent + theory tools
│       ├── pyproject.toml
│       ├── app/
│       │   ├── main.py
│       │   ├── routes/
│       │   │   ├── health.py
│       │   │   ├── transpose.py
│       │   │   └── chat.py
│       │   ├── tools/
│       │   │   ├── __init__.py
│       │   │   └── theory.py            # analyze_key, etc.
│       │   ├── llm/
│       │   │   ├── __init__.py
│       │   │   └── anthropic_client.py
│       │   └── models.py                # Pydantic request/response types
│       ├── tests/
│       └── .env.example
├── packages/
│   ├── types/                           # Shared TypeScript types
│   │   ├── package.json
│   │   └── src/
│   │       └── index.ts                 # Score, Project, Operation, …
│   └── ui/                              # Reusable React components (shadcn-skinned)
│       └── ...
├── tools/
│   └── scripts/
│       ├── seed-fixtures.sh
│       └── ...
├── docs/                                # (already exists)
├── pnpm-workspace.yaml
├── package.json                         # Workspace root
├── .nvmrc
└── ...
```

## 0.6 Task list — week by week

The plan is **part-time over 4 weeks**, ~10–15 focused hours per week.

### Week 1 — Skeleton up

- [ ] Install prerequisites on macOS:
  - [ ] **Rust 1.80+** via `rustup` (`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`)
  - [ ] **Node.js 20 LTS** (via `nvm` or Homebrew)
  - [ ] **pnpm** (`npm install -g pnpm`)
  - [ ] **Python 3.12+** (via Homebrew or `uv`)
  - [ ] **uv** (Python package manager) — `curl -LsSf https://astral.sh/uv/install.sh | sh`
  - [ ] Xcode Command Line Tools (`xcode-select --install`)
- [ ] Configure `pnpm` workspace (`pnpm-workspace.yaml`).
- [ ] Initialize `apps/desktop` with `pnpm create tauri-app@latest` — React + TypeScript + Vite template.
- [ ] Verify it builds and runs: `pnpm tauri dev` opens a blank Tauri window.
- [ ] Add Tailwind 4 + PostCSS, configure for Vite.
- [ ] Add shadcn/ui scaffold (`pnpm dlx shadcn@latest init`).
- [ ] Land `src/styles/tokens.css` from `docs/UI_DESIGN.md` palette as CSS variables.
- [ ] Write ADR-0002 (UI framework), ADR-0003 (styling), ADR-0008 (package manager).
- [ ] Commit: `chore(desktop): scaffold Tauri 2 + React 19 + Vite + Tailwind + shadcn`.

### Week 2 — Notation + audio playback

- [ ] Implement the **three-pane shell** in React (left/center/right panes, top transport bar, bottom rail). Static layout, no resizable yet — just the bones.
- [ ] Install OpenSheetMusicDisplay (`pnpm add opensheetmusicdisplay`).
- [ ] Build `src/notation/ScoreView.tsx` that takes a MusicXML string and renders it via OSMD.
- [ ] Drop two fixtures into `apps/desktop/public/fixtures/`:
  - `bach-invention-1.musicxml` (from MuseScore Community, CC-BY).
  - One short Rachmaninoff prelude excerpt or similar (public-domain).
- [ ] Wire a `File → Open` menu (Tauri `dialog` plugin) that reads a MusicXML and pushes it to `ScoreView`.
- [ ] Install Tone.js (`pnpm add tone`).
- [ ] Build `src/audio/Player.ts` — a thin wrapper around Tone.Sequence + Tone.Sampler that:
  - Parses the MusicXML using OSMD's parsed score data, OR uses a simple MIDI-equivalent pre-conversion (we keep this simple in Phase 0).
  - Loads `musyng-kite.sf2` (or a smaller GM SoundFont) via `soundfont-player`.
  - Plays / Stops / Pauses.
- [ ] Add a Transport bar with play/stop/loop placeholder, tempo readout.
- [ ] Write ADR-0004 (notation), ADR-0005 (audio engine).
- [ ] Commit: `feat(notation): render and play a MusicXML file end-to-end`.

### Week 3 — Native I/O (CPAL + MIDI) + backend stub

- [ ] In `src-tauri/Cargo.toml` add: `cpal`, `midir`, `tokio`, `serde`, `tracing`.
- [ ] In `src-tauri/src/audio.rs`:
  - Enumerate default input device.
  - Open an input stream at 48 kHz, 128-sample buffer.
  - Compute a peak/RMS meter, emit a Tauri event `audio:meter` every ~30 ms.
- [ ] In `src-tauri/src/midi.rs`:
  - List MIDI input ports via `midir`.
  - Emit a `midi:devices` event with the list.
  - When the UI subscribes to a port, forward incoming note-on/note-off events as `midi:event`.
- [ ] In the React UI, render two tiny widgets in the bottom rail:
  - A vertical bar showing audio input peak.
  - A dropdown of MIDI ports + a log of last 10 received MIDI events.
- [ ] Initialize `backend/agent` with `uv init` (Python 3.12).
- [ ] Add dependencies: `fastapi`, `uvicorn[standard]`, `pydantic`, `music21`, `anthropic`, `python-dotenv`.
- [ ] Implement `GET /health` → `{"status":"ok","version":"0.1.0"}`.
- [ ] Implement `POST /transpose` with body `{ musicxml: string, target_key: string }` returning `{ musicxml: string }` using `music21.converter.parse(...)` + `score.transpose(...)` with enharmonic-correct re-spelling.
- [ ] In the desktop app, add a "Transpose to…" UI control that calls the backend and replaces the ScoreView content.
- [ ] Write ADR-0006 (backend stack).
- [ ] Commit: `feat(native): CPAL meter + MIDI ports`. `feat(backend): /health + /transpose using music21`. `feat(desktop): connect transpose UI to backend`.

### Week 4 — Agent loop + demo

- [ ] In `backend/agent/app/tools/theory.py` implement:
  - `analyze_key(musicxml: str) -> {key: str, mode: str, confidence: float}` using `music21.analysis.discrete.KrumhanslSchmuckler` or `analysis.windowed.Windowed`.
- [ ] In `backend/agent/app/llm/anthropic_client.py` wrap the Anthropic Python SDK with a single tool exposed: `theory.analyze_key`.
- [ ] Implement `POST /agent/chat`:
  - Input: `{ messages: ChatMessage[], score_musicxml?: string }`.
  - For each user turn, call Claude Sonnet 4.6 with the `theory.analyze_key` tool exposed.
  - If Claude requests the tool, execute it server-side, return the result to Claude, continue the turn.
  - Return the final assistant message + a structured `ToolCalls` log.
- [ ] In the desktop app, build a minimal `agent/ChatPanel.tsx`:
  - Message list (you/agent).
  - Input box.
  - On send: POST to `/agent/chat`, append response.
  - Tool calls render as collapsible "operation cards" matching `docs/UI_DESIGN.md`.
- [ ] Wire: when the user types *"transpose this to F♯ minor"*, the agent calls the **existing** `/transpose` endpoint via a second tool exposed to Claude: `score.transpose(target_key)`. Replace the score on success.
- [ ] Write ADR-0007 (LLM choice for Phase 0).
- [ ] Record `docs/demos/phase-0-demo.mov` (~2 min) walking through every DoD item.
- [ ] Tag the commit `v0.0.1-phase-0`.
- [ ] Decision meeting (with yourself): continue to Phase 1? Anything to refactor first?

## 0.7 ADRs to write in this phase

| # | Title | When |
|---|---|---|
| 0002 | UI framework: React 19 + Vite + TypeScript strict | Week 1 |
| 0003 | Styling: Tailwind 4 + shadcn/ui | Week 1 |
| 0004 | Notation rendering: OpenSheetMusicDisplay | Week 2 |
| 0005 | Audio engine: Tone.js + soundfont-player | Week 2 |
| 0006 | Backend stack: FastAPI + music21 + uv | Week 3 |
| 0007 | Phase-0 LLM: Claude Sonnet 4.6 only | Week 4 |
| 0008 | Package manager + monorepo: pnpm workspace | Week 1 |

## 0.8 Risk watch

| Risk | Mitigation |
|---|---|
| Tauri compile times painful on M2 Air 8 GB | Close other apps; use `cargo` incremental; ship with `release` only at end of week. |
| OSMD can't render every MusicXML edge case | Stick to two known-good fixtures in Phase 0. Edge cases are Phase 1's problem. |
| Tone.js + SoundFont quality "sounds bad" | Phase 0 tolerates "sounds bad". Better playback is Phase 1 (Tone.js + sfizz). |
| CPAL on Apple Silicon needs CoreAudio entitlements | Tauri capabilities config; we declare `microphone` capability. |
| Anthropic API key in client = leaked secret | Keys live **only** in `backend/agent/.env`. UI never sees them. |
| music21 install time | Use `uv` not `pip` — much faster. |

## 0.9 What Phase 0 explicitly does *not* do

- ❌ Polished UI (use shadcn defaults; no custom skin yet).
- ❌ Note entry on the staff.
- ❌ Multi-file projects.
- ❌ Save / Load projects beyond what the OS file dialog gives.
- ❌ Undo/Redo.
- ❌ Mixer, faders, automation.
- ❌ Recording.
- ❌ Pillars 1, 3, 6, 8, 9, 10, 11, 12 work.
- ❌ Voice.
- ❌ World-music idiom packs.
- ❌ Anything that competes with the demo focus.

When in doubt, **defer**. Phase 0's only job is to prove the architecture works.

## 0.10 Done is done

When all DoD items in §0.2 are checked, Phase 0 is complete. Move to [`PHASE_1.md`](./PHASE_1.md).
