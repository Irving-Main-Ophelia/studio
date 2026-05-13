# Prerequisites — What you (the maintainer) need to set up

> Everything you must install, pay, or sign up for **on your side** to enable Stockhausen across all phases. Organized by phase + topic so you can do just what's needed for the phase you're in.
>
> **Update this doc whenever a new external dependency lands.** That way you never have to hunt down credentials again.

---

## TL;DR — what you need *tonight* (Phase 0)

| Item | Required? | Cost | Where |
|---|---|---|---|
| Node.js 22 + pnpm 10 + Rust 1.80+ + Python 3.12+ + uv | ✅ Required | $0 | Already installed during scaffold |
| **Anthropic API key** | ⚠️ Required for the *chat* part of the demo | Pay-as-you-go (~$0.10–1.00 for all Phase-0 dev) | https://console.anthropic.com/settings/keys |
| Audio output (built-in speakers fine) | ✅ Required | $0 | Already there |
| Microphone (built-in mic fine) | Optional — for the input meter | $0 | macOS will prompt for permission |
| MIDI keyboard | Optional — for the MIDI tile demo | $0 (just plug it in if you have one) | — |

That's it. Phase 0 runs from your existing Mac with one paid line item (Anthropic, ~spare change).

---

## How to add your Anthropic API key

1. Go to https://console.anthropic.com/settings/keys and click **Create Key**. Name it `stockhausen-local-dev`.
2. Copy the key (it starts with `sk-ant-`). You only see it once.
3. In a terminal:

   ```bash
   cd ~/studio/backend/agent
   cp .env.example .env
   ```

4. Open `backend/agent/.env` and replace `sk-ant-...` with your real key.
5. Restart the backend (`pnpm backend:dev`) so it picks up the key.

If the Agent panel still shows *agent offline* or `503 ANTHROPIC_API_KEY not configured`, the key isn't being read — re-check the file, and that the backend was restarted.

**Privacy:** Anthropic's terms (May 2026) do not use API inputs for training by default. We additionally do not retain musical content beyond the immediate tool call. See `AGENTS.md` §11.

**Spend control:** Set a monthly budget cap in the Anthropic console (we recommend $20/month for Phase 0–1 development). You will likely use under $5/month.

---

## Phase 1 — Composer's Sketchpad

### Required

| Item | What for | Cost | Action |
|---|---|---|---|
| **Anthropic API key** (same one) | Chat agent grows from 1 → 10 tools | Pay-as-you-go (~$5–30/month at daily use) | Already done |
| **VSCO 2 Community Edition** (orchestra) | Better playback than the SplendidGrandPiano | $0 (CC-BY) | Download from https://vsco2.com/ → drop into `apps/desktop/public/samples/vsco2/` |
| **Sonatina Symphonic Orchestra v4** | Backup orchestra | $0 (CC-0) | Download from http://sso.mattiaswestlund.net → `apps/desktop/public/samples/sonatina/` |
| **VCSL** | Specialty timbres (harpsichord, organ, classical guitar) | $0 (MIT) | Download from https://github.com/sgossner/VCSL → `apps/desktop/public/samples/vcsl/` |

### Optional but recommended

| Item | What for | Cost |
|---|---|---|
| **OpenAI API key** | Cross-LLM evals; some prompts work better in GPT-5.5 | Pay-as-you-go (~$5–20/month) — https://platform.openai.com/api-keys |
| **MacBook M4 Pro 24 GB+ upgrade** | Cargo + sample libs strain 8 GB | $2,000–$4,000 — see `NORTH_STAR.md` §10.1 |

### Privacy reminder (Phase 1)

The Phase-1 chat agent receives larger chunks of your MusicXML on every turn. Same rule applies: **never train on your music; do not log content**. The agent logs only metadata (tool name, arguments hash, latency). Re-verify in your Anthropic dashboard that no fine-tune is connected to this key.

---

## Phase 2 — Guitar in, Agent out

### Required for Pillar 3 (live guitar → score)

| Item | What for | Cost | Notes |
|---|---|---|---|
| **Audio interface** | Plug guitar in to your Mac | $150–250 | Focusrite Scarlett Solo 4th gen, Universal Audio Volt 1, or PreSonus Studio 24c |
| **¼" instrument cable** | Guitar → interface | $15–30 | Hosa or Mogami |
| **MIDI Guitar 3 license** (Jam Origin) | Polyphonic guitar → MIDI | ~$60 one-time | https://www.jamorigin.com — license per machine |

Optional but better latency:

| Item | What for | Cost |
|---|---|---|
| **Fishman TriplePlay Wireless** hexaphonic pickup | Sub-5 ms latency T3 path | ~$400 — https://www.fishman.com |

### Required for Pillar 6 (world-music orchestration)

You'll need world-music sample libraries. Some are free; others cost:

| Tradition | Free options | Paid (better) | Cost |
|---|---|---|---|
| Persian Radif | Persa.sf2 + Ancient Sounds free packs | Commission ney/kamancheh recordings | $500–$2,000 |
| Arabic Maqam | Freesound (oud, qanun) | Sonic Bloom Arabic, Soundiron Cairo | $250–$700 |
| Hindustani | Spitfire LABS sitar (free) | Soundiron Sitar Nation | $200–$400 |
| Chinese classical | Free guzheng samples on Freesound | Kong Audio CHINEEKONG | $300–$600 |

You can defer the paid options until the free packs feel limiting. For personal-use composition the free tier is usable.

### Required for Pillar 11 (MP3 reverse-engineering)

| Item | What for | Cost |
|---|---|---|
| **Modal account** | Cloud GPU for Demucs v4 + YourMT3+ | Free tier covers Phase-2 development; ~$5–30/month if you use it daily | https://modal.com — sign up, install the CLI: `pip install modal && modal token new` |
| **Modal $30 free credit** | Bootstraps your first 30 inference hours | Included with sign-up | Auto-applied |

### Optional in Phase 2

| Item | What for | Cost |
|---|---|---|
| **VST3 host bridge requires no licensing** for the host itself | JUCE-based, MIT-licensed | $0 — but **any VST3 instrument you load** brings its own license. For personal use, no extra cost. |

---

## Phase 3 — Co-Composer & Style

### Required

| Item | What for | Cost |
|---|---|---|
| **Modal account credit** | Training composer LoRAs (~$5–25 per composer) and nightly evals | $20–50/month at active use |
| **Anthropic API + OpenAI API** (both) | Multi-agent panel needs strong models on both providers | Variable; expect $20–80/month while training and evaluating |

### Voice agent (optional — only if you want it)

| Item | What for | Cost |
|---|---|---|
| **OpenAI Realtime API** (already part of your OpenAI key) | Voice agent (`gpt-realtime-2`) | Per-minute pricing; ~$0.06 / minute of conversation. Budget cap recommended. |

You can skip the voice agent entirely; the rest of Phase 3 doesn't need it.

### Style training data

| Item | What for | Cost |
|---|---|---|
| **Public-domain MusicXML corpora** | LoRA training data (Bach, Debussy, Rachmaninoff, Rimsky-Korsakov, Ponce) | $0 — sourced from MuseScore Open Source, IMSLP, and the music21 corpus. |
| **Leo Brouwer's published scores** | Brouwer is still copyrighted | Personal-use posture covers this for your own training. We **never** publish a Brouwer adapter. |

---

## Infrastructure overview (entire project)

| Service | Purpose | Free tier? | Sign-up |
|---|---|---|---|
| Anthropic | Chat agent (Sonnet/Opus 4.x) | Trial credit only; then pay-go | https://console.anthropic.com |
| OpenAI | Voice (Realtime) + Phase-3 multi-agent mixing | Trial credit only; then pay-go | https://platform.openai.com |
| Modal | Cloud GPU for Demucs / YourMT3+ / LoRA training / evals | $30 free → pay-go | https://modal.com |
| Cloudflare R2 | (Phase 3 only, optional) blob storage for renders | 10 GB free → pay-go | https://dash.cloudflare.com — **only if** you want to sync renders off-device. We default to **full local**, so this stays optional. |
| GitHub | Code remote (currently the repo is local only) | Free for private repos | https://github.com — only if you ever want a backup remote. Optional. |

### What you do **not** need

| Skipped | Why |
|---|---|
| Domain name (e.g. `stockhausen.studio`) | Personal use; no public surface. |
| Apple Developer Program ($99/year) | We run unsigned local builds. Add only if you ever distribute. |
| Server hosting (Fly.io, Vercel, …) | Backend runs on `127.0.0.1`. |
| Soundslice / Flat publishing accounts | Skip unless Phase 3 needs *Publish to…* features. |
| Sentry / PostHog / LangSmith | Optional observability. We disable analytics by default to protect privacy. Enable only if you want them. |

---

## Hardware checklist

| Item | Phase | Note |
|---|---|---|
| MacBook Air M2 8 GB | All phases (current) | Works for Phase 0–1; will struggle for sample-heavy Phase 1+ |
| **MacBook M4 Pro 24 GB+** | Recommended upgrade mid-Phase 1 | Much better Rust compile + sample-library headroom |
| Audio interface | Phase 2+ | Focusrite Scarlett Solo or UA Volt 1 |
| Studio headphones | Phase 2+ | AKG K371, Sennheiser HD 600, or Beyerdynamic DT 770 Pro — your call |
| External SSD (1 TB+) | Phase 2+ | Sample libraries grow fast |
| MIDI keyboard | Optional | Any USB MIDI keyboard works; the Arturia KeyLab Essential mk3 is a solid budget pick |

---

## Privacy & security checklist

This is the **paranoid version** of the rule from `AGENTS.md` §11:

- [ ] **No `.env` file is ever committed.** `.gitignore` already enforces this; verify with `git check-ignore backend/agent/.env`.
- [ ] **All API keys live in `backend/agent/.env` only.** The desktop app never reads or stores keys.
- [ ] **The backend binds to `127.0.0.1`**, never `0.0.0.0`. Verified in `app/main.py`.
- [ ] **No analytics SDKs** are bundled into the desktop app by default. If you ever enable PostHog, confirm `capture_content: false`.
- [ ] **No LangSmith / observability traces** of musical content. We log metadata only.
- [ ] **No browser autofill** in the Anthropic / OpenAI consoles where keys are visible. Use a password manager.
- [ ] **macOS permissions** the app will ask for:
  - Microphone access (for the input meter and Phase-2 guitar capture).
  - File access (only when you pick a file via File → Open).
- [ ] **No iCloud sync of the project folder** unless you explicitly want it. We default to `~/Documents/Stockhausen/` which iCloud Documents may sync. Move it outside iCloud if you prefer.

---

## Budget summary (personal-use, monthly)

| Phase | Conservative monthly bill | Where it goes |
|---|---|---|
| 0 (foundations) | ~$1 | Anthropic only |
| 1 (composer's sketchpad) | $5–25 | Anthropic + maybe OpenAI |
| 2 (guitar in, agent out) | $10–50 | Anthropic + Modal (Demucs/YourMT3 runs) + occasional sample-library purchases |
| 3 (co-composer & style) | $20–80 | Both LLM APIs + Modal training + nightly evals |
| Voice agent (optional) | + $5–30 | OpenAI Realtime usage |

Total one-time costs across the project (excluding the optional Mac upgrade): **$200–$1,000**, mostly hardware (audio interface, headphones, MIDI Guitar 3, optional hex pickup).

You will probably spend more on guitar strings.

---

## Updating this doc

Whenever you (or an AI agent) add a new external dependency to any phase, **add a row to the relevant section here**. Future-you will thank present-you.
