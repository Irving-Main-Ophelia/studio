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

# ---------------------------------------------------------------------------
# Pillar 12 — Production Exports models
# ---------------------------------------------------------------------------


class ClickTrackRequest(BaseModel):
    musicxml: str = Field(..., description="MusicXML 4.0 score.")
    tempo_bpm: float = Field(120.0, description="Fallback tempo when not found in score.")
    beats_per_bar: int = Field(4, description="Fallback time-signature numerator.")
    duration_sec: float | None = Field(None, description="Override total duration in seconds.")


class MinusOneRequest(BaseModel):
    musicxml: str = Field(..., description="MusicXML 4.0 score.")
    omit_part_index: int = Field(..., description="Zero-based index of the part to omit.")


class StemsRequest(BaseModel):
    musicxml: str = Field(..., description="MusicXML 4.0 score.")


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


# ---------------------------------------------------------------------------
# Pillar 12 endpoints
# ---------------------------------------------------------------------------

def _click_track_wav(tempo_bpm: float, beats_per_bar: int, duration_sec: float) -> bytes:
    """Generate a stereo 44100 Hz 16-bit click-track WAV using stdlib only."""
    sample_rate = 44_100
    total_samples = max(1, int(duration_sec * sample_rate))
    seconds_per_beat = 60.0 / tempo_bpm

    # Pre-compute click waveforms (stereo interleaved)
    def _sine_click(freq: float, duration_ms: float, amplitude: float) -> list[int]:
        """Return a list of interleaved (L, R) 16-bit PCM integers."""
        n = int(sample_rate * duration_ms / 1000.0)
        out: list[int] = []
        for i in range(n):
            t = i / sample_rate
            # Exponential decay envelope
            env = math.exp(-t * 20.0)
            v = amplitude * env * math.sin(2.0 * math.pi * freq * t)
            s = int(max(-1.0, min(1.0, v)) * 32767)
            out.extend([s, s])  # L + R
        return out

    downbeat_click = _sine_click(1000.0, 50.0, 0.8)
    beat_click = _sine_click(800.0, 30.0, 0.5)

    # Build stereo buffer (2 channels × total_samples × 2 bytes)
    buf = bytearray(total_samples * 2 * 2)  # stereo 16-bit

    beat_index = 0
    while True:
        beat_time = beat_index * seconds_per_beat
        if beat_time >= duration_sec:
            break
        start_frame = int(beat_time * sample_rate)
        click = downbeat_click if (beat_index % beats_per_bar == 0) else beat_click
        for offset, sample_val in enumerate(click):
            frame = start_frame + offset // 2
            channel = offset % 2
            pos = (frame * 2 + channel) * 2
            if pos + 2 <= len(buf):
                existing = struct.unpack_from("<h", buf, pos)[0]
                mixed = max(-32768, min(32767, existing + sample_val))
                struct.pack_into("<h", buf, pos, mixed)
        beat_index += 1

    bio = io.BytesIO()
    with wave.open(bio, "wb") as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(bytes(buf))
    return bio.getvalue()


@router.post("/click-track")
def export_click_track(req: ClickTrackRequest) -> dict[str, Any]:
    """Generate a stereo click-track WAV for the given score or parameters.

    Attempts to read tempo from MetronomeMark in the score; falls back to
    the ``tempo_bpm`` request field. Duration is derived from the score or
    the ``duration_sec`` override. Beat-1 is accented at 1000 Hz; all other
    beats use 800 Hz.
    """
    tempo_bpm = req.tempo_bpm
    beats_per_bar = req.beats_per_bar
    duration_sec = req.duration_sec

    try:
        score = _parse(req.musicxml)
        # Try to extract tempo and duration from the score
        from music21 import tempo as m21tempo  # type: ignore[import-untyped]

        mm_elements = list(score.flatten().getElementsByClass(m21tempo.MetronomeMark))
        if mm_elements:
            mark_number = mm_elements[0].number
            if mark_number is not None:
                tempo_bpm = float(mark_number)

        if duration_sec is None:
            ql = score.duration.quarterLength
            if ql and ql > 0:
                # quarterLength at the detected tempo
                duration_sec = float(ql) * (60.0 / tempo_bpm)
    except Exception:  # noqa: BLE001
        pass

    if duration_sec is None or duration_sec <= 0:
        # 4 bars at the given tempo as a sensible default
        duration_sec = beats_per_bar * 4 * (60.0 / tempo_bpm)

    wav_bytes = _click_track_wav(tempo_bpm, beats_per_bar, duration_sec)
    return {
        "wav_b64": base64.b64encode(wav_bytes).decode("ascii"),
        "tempo_bpm": tempo_bpm,
        "beats_per_bar": beats_per_bar,
        "duration_sec": duration_sec,
    }


@router.post("/minus-one")
def export_minus_one(req: MinusOneRequest) -> dict[str, Any]:
    """Stub — minus-one WAV export (Pillar 5 full render required).

    Parses the score to return the name of the omitted part. The actual
    WAV render requires the sfizz.wasm sample-render pipeline which is
    scheduled for Pillar 5.
    """
    omit_part_name: str = f"Part {req.omit_part_index}"
    try:
        score = _parse(req.musicxml)
        parts = list(score.parts)
        if 0 <= req.omit_part_index < len(parts):
            part_id = parts[req.omit_part_index].partName or f"Part {req.omit_part_index}"
            omit_part_name = part_id
    except Exception:  # noqa: BLE001
        pass

    return {
        "status": "stub",
        "reason": (
            "Minus-one WAV requires the sfizz.wasm sample render pipeline. "
            "Stub until Pillar 5 full render lands."
        ),
        "omit_part_name": omit_part_name,
    }


@router.post("/stems")
def export_stems(req: StemsRequest) -> dict[str, Any]:
    """Stub — per-track stem WAV export (Pillar 5 full render required).

    Parses the score to enumerate the parts and return them in the
    response so the frontend can display the list. Actual WAV generation
    requires the sfizz.wasm full render pipeline.
    """
    parts: list[dict[str, Any]] = []
    try:
        score = _parse(req.musicxml)
        for i, part in enumerate(score.parts):
            parts.append({"index": i, "name": part.partName or f"Part {i}"})
    except Exception:  # noqa: BLE001
        pass

    return {
        "status": "stub",
        "reason": (
            "Per-track stem WAV export requires sfizz.wasm full render. "
            "Stub until Pillar 5 full render lands."
        ),
        "parts": parts,
    }
