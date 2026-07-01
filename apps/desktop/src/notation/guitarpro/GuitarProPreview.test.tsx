/**
 * Unit tests for GuitarProPreview (Track A, A7 — optional alphaTab player).
 *
 * The alphaTab runtime is mocked: a fake `AlphaTabApi` fires `renderFinished` and
 * `playerReady` when the score loads, so we can assert the modal reaches the ready
 * state (transport enabled, import enabled) and that the action callbacks fire — all
 * without a real render/audio context (unavailable under jsdom).
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Fake event emitter matching alphaTab's `.on(cb)` surface.
function emitter() {
  const cbs: ((arg?: unknown) => void)[] = [];
  return {
    on: (cb: (arg?: unknown) => void) => cbs.push(cb),
    fire: (arg?: unknown) => cbs.forEach((cb) => cb(arg)),
  };
}

vi.mock("@coderline/alphatab", () => {
  class Settings {
    core = { engine: "", useWorkers: true, smuflFontSources: null as unknown };
    player = { enablePlayer: false, scrollElement: null as unknown };
  }
  class AlphaTabApi {
    renderFinished = emitter();
    playerReady = emitter();
    playerStateChanged = emitter();
    error = emitter();
    loadSoundFont = vi.fn(() => true);
    playPause = vi.fn();
    stop = vi.fn();
    destroy = vi.fn();
    load = vi.fn(() => {
      // Simulate a successful render + player initialisation.
      this.renderFinished.fire();
      this.playerReady.fire();
      return true;
    });
  }
  return { Settings, AlphaTabApi, FontFileFormat: { Woff: 1, Woff2: 2 } };
});

import { GuitarProPreview } from "./GuitarProPreview";

const BYTES = new Uint8Array([1, 2, 3]);

function renderPreview(overrides: Partial<React.ComponentProps<typeof GuitarProPreview>> = {}) {
  const props = {
    open: true,
    filename: "riff.gp",
    bytes: BYTES,
    onCancel: vi.fn(),
    onImport: vi.fn(),
    ...overrides,
  };
  render(<GuitarProPreview {...props} />);
  return props;
}

describe("GuitarProPreview", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders nothing when closed", () => {
    render(
      <GuitarProPreview open={false} filename={null} bytes={null} onCancel={vi.fn()} onImport={vi.fn()} />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the filename and the conversion note", () => {
    renderPreview();
    expect(screen.getByText("riff.gp")).toBeTruthy();
    expect(screen.getByText(/converts to the app's notation/i)).toBeTruthy();
  });

  it("enables transport and import once the score renders", async () => {
    renderPreview();
    const play = screen.getByLabelText("Play or pause") as HTMLButtonElement;
    await waitFor(() => expect(play.disabled).toBe(false));
    const importBtn = screen.getByRole("button", { name: /import to score/i }) as HTMLButtonElement;
    expect(importBtn.disabled).toBe(false);
  });

  it("fires onImport and onCancel from the footer buttons", async () => {
    const props = renderPreview();
    const play = screen.getByLabelText("Play or pause") as HTMLButtonElement;
    await waitFor(() => expect(play.disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: /import to score/i }));
    expect(props.onImport).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(props.onCancel).toHaveBeenCalledOnce();
  });

  it("shows a disabled importing state on the import button", () => {
    renderPreview({ importing: true });
    const btn = screen.getByRole("button", { name: /importing…/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});
