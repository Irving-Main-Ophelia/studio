import { beforeEach, describe, expect, it, vi } from "vitest";

import { Mixer, dbToLinear, linearToDb } from "./Mixer";

// ---------------------------------------------------------------------------
// Pure math helpers
// ---------------------------------------------------------------------------

describe("dbToLinear", () => {
  it("0 dB → 1.0", () => {
    expect(dbToLinear(0)).toBeCloseTo(1.0);
  });
  it("-20 dB → 0.1", () => {
    expect(dbToLinear(-20)).toBeCloseTo(0.1);
  });
  it("+6 dB → ~2.0", () => {
    expect(dbToLinear(6)).toBeCloseTo(2.0, 1);
  });
});

describe("linearToDb", () => {
  it("1.0 → 0 dB", () => {
    expect(linearToDb(1.0)).toBeCloseTo(0);
  });
  it("0.1 → -20 dB", () => {
    expect(linearToDb(0.1)).toBeCloseTo(-20);
  });
  it("0 → very negative (floor guard)", () => {
    expect(linearToDb(0)).toBeLessThan(-100);
  });
});

// ---------------------------------------------------------------------------
// Mixer graph (requires AudioContext mock)
// ---------------------------------------------------------------------------

interface MockNode {
  gain: { value: number; setTargetAtTime: ReturnType<typeof vi.fn> };
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

interface MockPanNode {
  pan: { value: number };
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

function makeMixerWithMockCtx() {
  const mockCtx = {
    destination: { connect: vi.fn(), disconnect: vi.fn() },
    currentTime: 0,
  } as unknown as AudioContext;

  const makeGainNode = (opts?: { gain?: number }): MockNode => ({
    gain: { value: opts?.gain ?? 1, setTargetAtTime: vi.fn() },
    connect: vi.fn(),
    disconnect: vi.fn(),
  });

  const makePannerNode = (opts?: { pan?: number }): MockPanNode => ({
    pan: { value: opts?.pan ?? 0 },
    connect: vi.fn(),
    disconnect: vi.fn(),
  });

  vi.stubGlobal(
    "GainNode",
    vi.fn().mockImplementation((_ctx: unknown, opts?: { gain?: number }) => makeGainNode(opts)),
  );
  vi.stubGlobal(
    "StereoPannerNode",
    vi.fn().mockImplementation((_ctx: unknown, opts?: { pan?: number }) => makePannerNode(opts)),
  );

  const mixer = new Mixer(mockCtx);
  return { mixer };
}

describe("Mixer", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("ensureTrack creates a new track on first call", () => {
    const { mixer } = makeMixerWithMockCtx();
    const { config } = mixer.ensureTrack("strings");
    expect(config.id).toBe("strings");
    expect(config.mute).toBe(false);
    expect(config.solo).toBe(false);
    expect(config.gain_db).toBe(0);
    expect(config.pan).toBe(0);
  });

  it("ensureTrack returns the same config on repeat calls", () => {
    const { mixer } = makeMixerWithMockCtx();
    const first = mixer.ensureTrack("piano");
    const second = mixer.ensureTrack("piano");
    expect(first.config).toBe(second.config);
  });

  it("setTrackGain updates config", () => {
    const { mixer } = makeMixerWithMockCtx();
    mixer.ensureTrack("piano");
    mixer.setTrackGain("piano", -6);
    expect(mixer.snapshot().tracks[0].gain_db).toBe(-6);
  });

  it("setTrackMute reflects in snapshot", () => {
    const { mixer } = makeMixerWithMockCtx();
    mixer.ensureTrack("piano");
    mixer.setTrackMute("piano", true);
    expect(mixer.snapshot().tracks[0].mute).toBe(true);
  });

  it("setTrackSolo reflects in snapshot", () => {
    const { mixer } = makeMixerWithMockCtx();
    mixer.ensureTrack("piano");
    mixer.setTrackSolo("piano", true);
    expect(mixer.snapshot().tracks[0].solo).toBe(true);
  });

  it("setSnapshot adds new tracks and removes stale ones", () => {
    const { mixer } = makeMixerWithMockCtx();
    mixer.ensureTrack("piano");
    mixer.setSnapshot({
      master: { gain_db: -3 },
      tracks: [
        { id: "strings", gain_db: 0, pan: 0, mute: false, solo: false },
      ],
    });
    const snap = mixer.snapshot();
    expect(snap.master.gain_db).toBe(-3);
    const ids = snap.tracks.map((t) => t.id);
    expect(ids).toContain("strings");
    expect(ids).not.toContain("piano");
  });

  it("snapshot round-trips the master gain", () => {
    const { mixer } = makeMixerWithMockCtx();
    mixer.setMasterGain(-12);
    expect(mixer.snapshot().master.gain_db).toBe(-12);
  });
});
