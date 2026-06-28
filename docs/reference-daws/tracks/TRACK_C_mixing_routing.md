# Track C — Mixing & Signal Routing

> **Status:** Draft skeleton (June 27, 2026). Elaborate in successive chats, phase-doc style.
> **Becomes:** **Phase 6** (maintainer decision, June 27, 2026 — see [`../README.md`](../README.md)).
> **Source teardown:** [`../PRO_TOOLS.md`](../PRO_TOOLS.md) (primary), [`../GARAGEBAND.md`](../GARAGEBAND.md).
> **Why:** Mixer v1 is 4 knobs. To play a real arrangement expressively we need sends, a couple of
> buses, automation, grouped submixes, freeze (for the M2 Air), and a way to host effects. Filtered
> to the composer-useful subset — **not** the full Pro Tools routing matrix (teardown §3).

---

## C.1 Goal

The maintainer can shape the *sound of the score*: send the strings to a shared reverb, group a
section, draw or record automation on volume/pan/any parameter, freeze a heavy instrument to save
CPU, and run a small set of quality effects (EQ, compressor, reverb) — all local, all editable.

## C.2 Scope (workstreams)

- **C1 — Bus / aux / send model.** A *simplified* routing layer in the Web Audio graph: per-track
  sends → a small number of aux buses (e.g., a reverb send, a section submix). Not the full
  Pro Tools matrix.
- **C2 — Inserts / effect chain.** Per-track insert slots hosting **WAM 2.0** plugins compiled from
  **Faust → WASM/AudioWorklet** (EQ, compressor, reverb, delay). Aligns with North Star §7
  (WAM 2.0). Optional **VST3** via the Phase-2 JUCE sidecar for instruments the maintainer owns.
- **C3 — Automation lanes.** Draw or record breakpoint automation for volume/pan/any insert
  parameter; stored as curves in the Stockhausen JSON sidecar; replayed by the transport.
- **C4 — Groups / submixes (VCA-lite).** "Group the strings" — proportional fader control over a set.
  Not full VCA topology.
- **C5 — Track freeze / commit.** Render a track (instrument + inserts + automation) to audio via
  OfflineAudioContext to free CPU on the M2 Air; reversible.
- **C6 — Metering.** Finish per-channel peak/RMS meters (AnalyserNode per channel — parking-lot
  M1.5).
- **C7 — I/O setup (minimal).** Pick interface + input channel for recording (Track B). Not a full
  I/O matrix.

## C.3 Candidate tools

| Need | Tool | License | Notes |
|---|---|---|---|
| Effects DSP | **Faust → WASM/AudioWorklet** | varies/permissive | Compile EQ/comp/reverb to WASM; wrap as WAM. |
| Plugin standard | **Web Audio Modules (WAM) 2.0** | open | North Star §7 already commits to it. |
| Routing/graph | **Web Audio API** (native) | — | Sampler → insert chain → track gain/pan → sends/buses → master. |
| Heavy instruments (optional) | **JUCE VST3 sidecar** | JUCE license | Phase-2 optional toggle (North Star §7; ADR pending). |
| Freeze render | **OfflineAudioContext** | — | Same path as in-app WAV export. |

## C.4 Definition of Done (stub)

- [ ] A reverb send shared by multiple tracks audibly works.
- [ ] At least EQ + compressor + reverb run as WAM/Faust inserts.
- [ ] Volume + pan automation draws and plays back; one plugin param automatable.
- [ ] Group the strings; one fader scales them proportionally.
- [ ] Freeze a track to audio and unfreeze it.
- [ ] Per-channel meters live in the mixer rail.

## C.5 Phase placement

**Phase 2–3.** *But* the **schema** for sends/inserts/automation/groups must be reserved in Phase 1
(see `../REFINE_AND_ERADICATE.md` §3) so projects don't need migrating later.

## C.6 Dependencies & risks

- **Depends on:** Track D's real sampler (nothing to mix without it); the §3 data-model extension.
- **Risk:** scope creep toward a full mixing console. Hold the teardown §3 line — composer-useful
  subset only. Surround/Atmos/AAX/ARA stay **SKIP**.
- **Risk:** AudioWorklet/WASM DSP CPU on the M2 Air. Freeze (C5) is the pressure valve; build it
  early, not last.

## C.7 Open questions for the maintainer

1. How "mixy" do you want to get — a couple of sends + EQ/reverb, or closer to a real console?
2. Do you own VST3 instruments you'd want hosted (drives the JUCE-sidecar priority)?
3. Is automation a real need (expressive swells), or is static balance enough for v1?
