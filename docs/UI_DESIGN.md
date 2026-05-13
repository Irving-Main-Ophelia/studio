# UI Design — Visual & Interaction Language

> *"If Blade Runner 2049 had a recording studio in Shibuya at midnight."*
> Elegant, futuristic, with cyberpunk accents — like the Broadway marquees or the Vegas Strip at night, but seen through obsidian glass.

This document defines the visual and interaction language for Stockhausen. It is the source of truth for the design system, color palette, typography, motion, and interaction patterns. Read before designing any new surface.

---

## 1. Mood & Spirit

The composer steps into a darkened concert hall. The seats are obsidian. The stage is lit. As the music begins, the room breathes color — magenta sweeps the strings, cyan glows on the woodwinds, violet pulses with the timpani. The notation itself is calm, classical, **untouched by neon** — but everything *around* it is alive with electricity.

We are not flashy. We are *charged*.

### References (study these visual languages)

- **Linear** — restraint, precision, monochrome confidence.
- **Arc Browser** — playful glass, soft gradients, smart density.
- **Vercel design system** — modern dark, minimalist density, accessibility-first.
- **Bitwig Studio** — the closest existing DAW to this aesthetic; modular, neon, technical.
- **Ableton Push** — color-coded clarity over a dark canvas.
- **Cyberpunk 2077 menus** — neon over deep contrast; we steal the *energy*, not the *clutter*.
- **Tron Legacy (2010)** — line glow, holographic depth, restraint.
- **Synthwave / vaporwave moodboards** — palette inspiration only.
- **Cursor's own UI** — proof that an AI-first product can be dense, fast, and beautiful.

### Anti-references (what we are not)

- Gamer-flashy RGB everywhere.
- Loud, saturated cartoonish DAWs.
- 1990s Skeuomorphism (wooden panels, brushed-metal knobs).
- Hyper-minimalist white-on-white (we want *life*).

---

## 2. Color Palette

### Base canvas

| Token | Hex | Use |
|---|---|---|
| `--obsidian-900` | `#06080F` | Deepest background; main app canvas |
| `--obsidian-800` | `#0B0F1C` | Panels, sidebars |
| `--obsidian-700` | `#121830` | Cards, hovered panels |
| `--obsidian-600` | `#1B2240` | Active surface, modals |

### Neon accents (the "Broadway lights")

| Token | Hex | Role |
|---|---|---|
| `--neon-magenta` | `#FF2E88` | Primary highlight; selection; "agent active" |
| `--neon-cyan` | `#00E5FF` | Secondary highlight; pitch/note display |
| `--neon-violet` | `#A45BFF` | Tertiary; "thinking" pulse on the agent |
| `--neon-amber` | `#FFB840` | Warnings, recording state |
| `--neon-emerald` | `#28F0A0` | Success, "in tune", confirmed |

Use neon **sparingly** — single accents at a time, never two competing for attention.

### Score colors (deliberately calm)

The notation viewport itself uses a different palette so the music is **the still center**:

| Token | Hex | Use |
|---|---|---|
| `--score-parchment` | `#F4ECD8` | Default score background (warm cream) |
| `--score-ink` | `#0F1322` | Score ink color |
| `--score-grid` | `#D9CFB8` | Bar lines, staves |
| `--score-night-bg` | `#0B0F1C` | Score background in "night mode" |
| `--score-night-ink` | `#E9ECF6` | Score ink in "night mode" |

The score has two themes: **Parchment** (default; classical & elegant) and **Night** (cypherpunk; matches the surrounding chrome).

### Semantic colors

| Token | Maps to |
|---|---|
| `--accent-primary` | `--neon-magenta` |
| `--accent-secondary` | `--neon-cyan` |
| `--accent-tertiary` | `--neon-violet` |
| `--success` | `--neon-emerald` |
| `--warning` | `--neon-amber` |
| `--danger` | `#FF4E4E` |

---

## 3. Typography

| Role | Family | Weights | Why |
|---|---|---|---|
| **UI text** | **Geist Sans** (or Inter Display) | 400 / 500 / 600 / 700 | Modern, geometric, legible at small sizes |
| **Numerals / Technical readouts** | **JetBrains Mono** | 400 / 500 / 700 (tabular figures) | BPM, sample rates, frequencies, timestamps |
| **Notation moments / Headers in italic** | **Cormorant Garamond** | 500 italic | Italic serif for "musical" moments — quote attributions, epigraphs, dialog titles |
| **Score engraving** | **Bravura** (SMuFL standard) | — | Industry-standard music font; what VexFlow & Verovio use |

Pair example:
- "Bar 32, beat 3" → Geist Sans Medium + JetBrains Mono Tabular for the numbers
- A composer epigraph at the top of a piece → Cormorant Italic
- A note name in a tooltip → JetBrains Mono ("F♯3")

---

## 4. Motion & Animation

**Principle:** Motion is information, not decoration.

| Element | Behavior |
|---|---|
| Notes | Brief pulse of `--neon-magenta` glow as they sound during playback |
| Playhead | Trails a 1–2 px wake of `--neon-cyan` |
| Selected region | Soft inner-glow border in `--neon-magenta` |
| Loop region | Glowing `--neon-violet` borders with a faint pulse |
| Agent thinking | Soft animated gradient sweeping across the agent panel (magenta → violet → cyan, 3-second loop) |
| Agent speaking (when voice ships, Phase 3+) | Concentric ring of `--neon-cyan` that pulses on syllables |
| Tooltips, modals | 120 ms fade + 4 px upward translate; ease-out |
| Tab switches | 180 ms shared-axis slide |
| Page transitions | 240 ms cross-fade |
| Drag indicators | Single neon outline of the drop target, no shadows |

Default ease: `cubic-bezier(0.32, 0.72, 0, 1)` (Apple-style). Never use linear except for progress bars.

Performance budget: 60 fps minimum, 120 fps target on M-series Macs. **Disable animations** when the user enables "Reduce Motion" in macOS.

---

## 5. Layout

The desktop window is divided into a **three-pane modular shell**:

```
┌───────────────────────────────────────────────────────────────────────┐
│  ┃ Top Bar (transport, project name, agent toggle)              ⚙ ⌘  │
├──────────┬──────────────────────────────────────────────┬─────────────┤
│          │                                              │             │
│ Project  │                                              │   Agent     │
│ Tree     │            Score Viewport                    │   Panel     │
│          │            (notation editor)                 │             │
│ (left)   │                                              │   (right)   │
│          │                                              │             │
│          ├──────────────────────────────────────────────┤             │
│          │ Timeline + Waveforms + Mixer                 │             │
│          │ (bottom rail)                                │             │
└──────────┴──────────────────────────────────────────────┴─────────────┘
```

- **Top bar** — thin (40 px). Houses transport (play/stop/loop/tempo/count-in), project title, agent toggle, settings.
- **Project tree (left)** — collapsible (220 px expanded, 48 px collapsed). Movements / sections / takes.
- **Score viewport (center)** — the *star*. This is where notation lives. Calm palette. Score theme switchable.
- **Bottom rail** — timeline, waveform stripes, mixer faders. Pulls up on demand.
- **Agent panel (right)** — collapsible (320 px expanded, 48 px collapsed). Chat history, current tool, results.

Additional surfaces appear as **floating panels** (draggable, dockable):
- Harmony graph (key/chord lattice)
- Motif tree
- Form diagram
- Theory tutor pop-up
- Practice coach scorecard

All glass: `backdrop-filter: blur(20px) saturate(180%); background: rgba(11, 15, 28, 0.62);` — frosted obsidian with a faint inner top-edge highlight.

---

## 6. The Transport Bar — the "Broadway marquee"

The transport is the one place we let neon **sing**. It is a thin obsidian bar with:

- A playhead position readout (JetBrains Mono Tabular).
- Play / Stop / Loop / Count-in buttons.
- Tempo display (BPM + tap-tempo).
- A live **VU meter** that draws as a thin neon strip running along the bottom edge of the top bar — magenta when loud, cyan when soft, violet on peaks.

When playback is running, the transport bar acquires a *very* faint horizontal scrolling shimmer — like marquee lights chasing along Broadway. **Very subtle.** Off when paused.

---

## 7. The Score Viewport — the still center

This is the *only* part of the UI that does **not** wear neon. The score is sacred space.

- Background: parchment (default) or Night theme.
- Ink: deep black on parchment / soft off-white on Night.
- Bar lines, staves, stems: precise, scholarly. Verovio-grade engraving.
- The playhead and any *agent edits* glow with neon — but the notation itself stays classical.
- When the agent suggests an edit, a **ghost overlay** appears: the proposed change rendered in `--neon-violet` over the existing score. Accept / Reject / Refine buttons appear nearby.

---

## 8. The Agent Panel

This is where the cypherpunk lives most.

- The panel has its own faint animated gradient when idle (extremely slow magenta → violet → cyan loop, ~12s period).
- The conversation feed is composed of two types of bubbles:
  - **Maintainer messages** — clean, off-white-on-obsidian.
  - **Agent messages** — slightly tinted, with a thin `--neon-cyan` left border. Tool calls render as collapsible boxes showing the operation and its diff.
- A status pill at the top of the panel shows the agent state: *Idle / Thinking / Editing / Ready*.
- When the agent calls a tool, the diff appears inline as a music-theoretic readout ("*Modulated bars 32–36 from f♯m to A major via common-tone pivot.*") with a *View change in score* link.

---

## 9. Floating Visualizations

These earn their own "deluxe cypherpunk" treatment:

- **Harmony graph** — a neo-Riemannian *Tonnetz* (tone network) lattice rendered as a 3D-feeling 2D graph; chord nodes glow in `--neon-cyan`; the current key glows in `--neon-magenta`. Drag a node to modulate.
- **Motif tree** — themes as gleaming nodes connected by translucent lines; sibling motifs share a hue.
- **Form diagram** — Sonata-allegro, fugue, AABA, etc., rendered as glowing block diagrams that the user can drag to re-section the piece.

These visualizations may use **React Three Fiber** (a React renderer for Three.js, the standard 3D library for the web) if a richer 3D feel improves comprehension.

---

## 10. Sound design (yes, even a quiet one)

We are a music app. The UI is allowed two extremely subtle sound cues:

- A *tiny* metallic shimmer when an agent action completes (sub-200 ms, EQ'd above 6 kHz so it never competes with music).
- A *single soft tick* on bar-line scrubs (off by default; opt-in).

That's it. Everything else is silent.

---

## 11. Component library

We start from **shadcn/ui** (a copy-paste React component set built on Radix UI + Tailwind) and re-skin it for the obsidian + neon palette. Components we'll customize first:

- Button, Toggle, Slider, Tabs, Dialog, Popover, Tooltip
- Command palette (⌘K)
- Drag-and-drop primitives
- Resizable panes
- Scrollable virtualized lists (for long note lists or operation logs)

Animations are layered on with **Framer Motion**.

Icons: **Lucide React** (sister project to shadcn).

3D when needed: **React Three Fiber**.

---

## 12. Accessibility (non-negotiable)

- All neon highlights also carry a non-color signal (shape, weight, position) — for color-blind composers.
- All keyboard shortcuts visible in a ⌘K command palette.
- All animations respect `prefers-reduced-motion`.
- Color contrast for body text ≥ 7:1; for fine details ≥ 4.5:1.
- Voice control deferred but the underlying tool API is keyboard-first.

---

## 13. The first screen the maintainer sees

When they open Stockhausen on day one:

1. A dark loading screen with a slow-pulsing `--neon-magenta` star at center (the *north star* — a quiet emblem we keep through every release).
2. The shell fades in: empty project tree on left, an inviting blank parchment score in the middle, and a single agent message on the right:
   > *"Welcome. What do we write today?"*
3. A blinking `--neon-cyan` cursor invites them to either:
   - **Click** on the score to start typing notes.
   - **Type** into the agent panel to start describing the piece.

That single moment is the soul of the product. We polish it until it sings.

---

## 14. Implementation notes (not yet code)

- **Tailwind config** holds the design tokens (colors, typography, radii, spacing).
- **CSS variables** allow runtime theme switching (Parchment ↔ Night).
- **Framer Motion variants** are shared across components for consistent timing.
- **Storybook** hosts every component in isolation so we can iterate visually without firing up the full app.

---

## Changelog

- **2026-05-13** — Initial design language. Obsidian base, neon accents, three-pane shell, score as still center, Broadway-marquee transport.
