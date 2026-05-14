"""Export endpoints — MusicXML / MIDI / WAV (M1.5).

MusicXML 4.0 already lives in the project as the canonical format, so
the route just normalises and returns it. MIDI is produced via
``music21.midi`` and returned as base64-encoded bytes (the frontend
then writes them through the Tauri filesystem plugin). WAV is rendered
offline by replaying the extracted note events through a simple
in-memory synth — heavier work runs on the Tauri side, but the route
provides a fallback for headless testing.

The PDF route is intentionally absent: Verovio runs entirely in the
browser as WASM (ADR-0013), so the desktop app exports PDF without
hitting the backend at all.
"""

from __future__ import annotations

import base64
import io
import math
import struct
import tempfile
import wave
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.tools.theory import _parse, extract_notes

router = APIRouter(prefix="/export", tags=["export"])


class ExportRequest(BaseModel):
    musicxml: str = Field(..., description="MusicXML 4.0 score.")


class MidiResponse(BaseModel):
    midi_base64: str
    byte_count: int


class WavResponse(BaseModel):
    wav_base64: str
    sample_rate: int
    duration_sec: float


@router.post("/musicxml")
def export_musicxml(req: ExportRequest) -> dict[str, Any]:
    """Round-trip the score through music21 so the output is canonical.

    music21 only writes to filesystem paths, so we use a temp file and
    delete it immediately. This is the same pattern serialise_score in
    stockhausen_theory.score_io uses.
    """
    try:
        score = _parse(req.musicxml)
        with tempfile.NamedTemporaryFile(
            mode="w+", encoding="utf-8", suffix=".musicxml", delete=False
        ) as fh:
            tmp_path = Path(fh.name)
        score.write("musicxml", fp=str(tmp_path))  # type: ignore[no-untyped-call]
        normalised = tmp_path.read_text(encoding="utf-8")
        tmp_path.unlink(missing_ok=True)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"musicxml": normalised}


@router.post("/midi", response_model=MidiResponse)
def export_midi(req: ExportRequest) -> MidiResponse:
    """Convert the MusicXML score to a MIDI 1.0 byte string."""
    try:
        score = _parse(req.musicxml)
        with tempfile.NamedTemporaryFile(suffix=".mid", delete=False) as fh:
            tmp_path = Path(fh.name)
        score.write("midi", fp=str(tmp_path))  # type: ignore[no-untyped-call]
        data = tmp_path.read_bytes()
        tmp_path.unlink(missing_ok=True)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return MidiResponse(midi_base64=base64.b64encode(data).decode("ascii"), byte_count=len(data))


@router.post("/wav", response_model=WavResponse)
def export_wav(req: ExportRequest, sample_rate: int = 44_100) -> WavResponse:
    """Offline WAV render via a tiny sine-bank.

    Phase-1 fallback synth so the route returns audio even when the
    frontend's Web-Audio path isn't available (CI, e2e, etc.). The real
    in-app render is produced by the frontend OfflineAudioContext using
    the sampler chain configured by the maintainer.
    """
    try:
        extracted = extract_notes(req.musicxml)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    duration = extracted["duration_sec"] + 0.5  # tail
    total_samples = max(1, int(duration * sample_rate))
    buffer = [0.0] * total_samples
    for note in extracted["notes"]:
        midi = int(note["midi"])
        freq = 440.0 * (2.0 ** ((midi - 69) / 12.0))
        start_sample = int(note["start_sec"] * sample_rate)
        end_sample = min(total_samples, start_sample + int(note["duration_sec"] * sample_rate))
        velocity = float(note["velocity"]) / 127.0 * 0.2
        for i in range(start_sample, end_sample):
            t = (i - start_sample) / sample_rate
            envelope = min(1.0, t * 50.0) * max(0.0, 1.0 - t / max(0.05, note["duration_sec"]))
            buffer[i] += velocity * envelope * math.sin(2.0 * math.pi * freq * t)

    peak = max((abs(x) for x in buffer), default=1.0) or 1.0
    norm = 0.9 / peak
    bio = io.BytesIO()
    with wave.open(bio, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        frames = bytearray()
        for x in buffer:
            sample = max(-1.0, min(1.0, x * norm))
            frames.extend(struct.pack("<h", int(sample * 32767)))
        wav.writeframes(bytes(frames))
    data = bio.getvalue()

    return WavResponse(
        wav_base64=base64.b64encode(data).decode("ascii"),
        sample_rate=sample_rate,
        duration_sec=duration,
    )
