# ADR-0001: Tauri 2 as the desktop shell

**Status:** Proposed
**Date:** 2026-05-13
**Authors:** Project Lead

## Context

Stockhausen needs a cross-platform desktop application that:

1. Hosts a React-based UI for the DAW + notation editor.
2. Provides low-latency native audio I/O (target ≤ 10 ms guitar→pitch).
3. Provides native MIDI I/O.
4. Ships small enough for fast install and updates.
5. Can run on-device ML inference (ONNX, candle).
6. Optionally hosts VST3 plugins.

The two realistic options in May 2026 are **Tauri 2** and **Electron**.

## Decision

Use **Tauri 2** with **Rust** as the core layer and **React 19 + TypeScript** in the WebView.

## Rationale

| Criterion | Tauri 2 | Electron | Winner |
|---|---|---|---|
| Bundle size | 5–15 MB typical | 80–150 MB typical | Tauri |
| RAM at idle | Low (system WebView) | High (bundled Chromium) | Tauri |
| Audio I/O latency | Native via Rust + CPAL | Possible but with extra hops | Tauri |
| Native-Rust ML ecosystem (ort, candle) | First-class | Awkward via N-API | Tauri |
| Auto-update | Built-in | Mature | Tie |
| Ecosystem maturity | Strong as of v2 (2024+) | Massive | Electron |
| Plugin (VST3) hosting via JUCE C++ | Via Rust FFI | Via Node native module | Tie |
| WebView consistency across OS | Some variance | Identical (Chromium) | Electron |

The decisive factor is the **audio path**: Stockhausen's #1 hard constraint is sub-20 ms guitar-to-staff latency. Tauri's Rust core gives us direct access to CPAL, real-time-priority threads, and zero-copy IPC to the WebView. Electron *can* do this with native modules, but with more friction and overhead.

The WebView-consistency concern (Tauri uses WKWebView on macOS, WebView2 on Windows, WebKitGTK on Linux) is real but manageable: modern WebView2 + WKWebView are quite close in 2026, and we will test on all three at every release.

## Consequences

- Backend dev for the core happens in Rust. We need to hire/retain Rust comfort on the team.
- We get great binaries for macOS (universal), Windows (x64 + ARM64), Linux (x64 .deb / AppImage).
- We cannot use Node-only native modules — but we don't depend on any.
- If we later need VST3 hosting, we go through a Rust→JUCE C++ FFI bridge. Fine but a project of its own.

## Alternatives considered

- **Electron** — rejected for the audio reasons above.
- **Pure native (JUCE C++)** — rejected: dev velocity would crater; we'd lose React's UX power.
- **Web-only** — rejected: latency budget can't fit; no MIDI hardware on iOS Safari; sample library size makes "first load" impractical.
- **Flutter Desktop** — rejected: weak audio story; smaller ecosystem; React beats Flutter on the UX surface area we need.

## Revisit triggers

- If Tauri's WebView fragmentation causes shipping pain on > 5% of users.
- If a critical dependency (e.g., a VST host) is Electron-only.
- Quarterly review per §15 of the North Star.
