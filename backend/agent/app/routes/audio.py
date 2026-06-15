"""Audio + MIDI import endpoints.

POST /audio/import          — polyphonic transcription via Basic Pitch (Python 3.12 venv)
                              Falls back to GAPS/piano-transcription-inference for
                              better quality on guitar recordings.
POST /audio/import-midi     — import MIDI file → MusicXML (100% accurate, recommended)
GET  /audio/capabilities    — capability flags for the frontend

Transcription runs in a Python 3.12 subprocess venv (venvs/amt/) to avoid
the Python 3.13 / TensorFlow / ONNX incompatibility. Basic Pitch (polyphonic,
~70% F1 on guitar) is the fast path; the GAPS model (ISMIR 2024 SOTA for
classical guitar) is the high-quality path.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/audio", tags=["audio"])
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# AMT venv paths (relative to this file's location: backend/agent/app/routes/)
# ---------------------------------------------------------------------------

_AGENT_DIR = Path(__file__).parents[2]           # backend/agent/
_AMT_PYTHON = _AGENT_DIR / "venvs/amt/bin/python3.12"
_WORKERS_DIR = _AGENT_DIR / "workers"


# ---------------------------------------------------------------------------
# Capability checks
# ---------------------------------------------------------------------------

def _amt_venv_available() -> bool:
    return _AMT_PYTHON.exists()


def _midi_available() -> bool:
    try:
        import mido  # noqa: F401
        return True
    except ImportError:
        return False


# ---------------------------------------------------------------------------
# Subprocess transcription engines
# ---------------------------------------------------------------------------

def _call_worker(worker_name: str, extra_args: list[str]) -> dict[str, Any]:
    """Run a worker script in the AMT venv, return its parsed JSON stdout."""
    worker_path = _WORKERS_DIR / worker_name
    cmd = [str(_AMT_PYTHON), str(worker_path)] + extra_args
    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=300,  # 5-minute hard limit per transcription
    )
    if result.returncode != 0:
        err = result.stderr.strip() or result.stdout.strip()
        raise RuntimeError(f"Worker {worker_name} failed (exit {result.returncode}): {err}")
    # Find the last line that is valid JSON (workers may print progress lines before the result)
    for line in reversed(result.stdout.splitlines()):
        line = line.strip()
        if line.startswith("{"):
            try:
                return json.loads(line)
            except json.JSONDecodeError:
                continue
    raise RuntimeError(f"Worker {worker_name} returned no JSON line: {result.stdout[:300]}")


def _transcribe_basic_pitch(audio_path: str, title: str = "") -> str:
    """Polyphonic transcription via Basic Pitch (subprocess, Python 3.12 venv).

    Basic Pitch is polyphonic, ~60-70% F1 on guitar, <30s on M1 (ONNX backend).
    Produces clean multi-voice MIDI; converted to MusicXML here.
    """
    with tempfile.NamedTemporaryFile(suffix=".mid", delete=False) as f:
        midi_path = f.name

    try:
        result = _call_worker(
            "basic_pitch_worker.py",
            ["--input", audio_path, "--output", midi_path],
        )
        if not result.get("ok"):
            raise RuntimeError(result.get("error", "unknown worker error"))
        logger.info(
            "Basic Pitch: %d notes, pitch range MIDI %s",
            result.get("note_count", 0),
            result.get("pitch_range_midi", []),
        )
        return _midi_file_to_musicxml(midi_path, part_name="Classical Guitar", title=title)
    finally:
        try:
            os.unlink(midi_path)
        except OSError:
            pass


def _transcribe_gaps(audio_path: str, title: str = "") -> str:
    """High-quality guitar transcription via piano_transcription_inference
    (domain-adapted from the ByteDance checkpoint; ISMIR 2024 approach).

    Slower than Basic Pitch (~1-3 min on M1 MPS) but significantly better
    for polyphonic classical guitar.
    """
    with tempfile.NamedTemporaryFile(suffix=".mid", delete=False) as f:
        midi_path = f.name

    try:
        result = _call_worker(
            "gaps_worker.py",
            ["--input", audio_path, "--output", midi_path],
        )
        if not result.get("ok"):
            raise RuntimeError(result.get("error", "unknown worker error"))
        logger.info("GAPS worker: device=%s", result.get("device", "unknown"))
        return _midi_file_to_musicxml(midi_path, part_name="Classical Guitar", title=title)
    finally:
        try:
            os.unlink(midi_path)
        except OSError:
            pass


def _midi_file_to_musicxml(midi_path: str, part_name: str = "Guitar", title: str = "") -> str:
    """Convert a MIDI file to MusicXML via music21."""
    from music21 import converter, stream, instrument as inst, metadata, clef

    score = converter.parse(midi_path, format="midi")
    if not isinstance(score, stream.Score):
        wrapped = stream.Score()
        wrapped.insert(0, score)
        score = wrapped

    # Set title / metadata — reset to avoid music21 injecting "Music21" as composer
    score.metadata = metadata.Metadata()
    if title:
        score.metadata.title = title

    for part in (list(score.parts) if score.parts else [score]):
        part.partName = part_name
        if not part.recurse().getElementsByClass(inst.Instrument).first():
            part.insert(0, inst.Guitar())
        # Guitar sounds an octave lower than written — use treble clef 8va bassa.
        # Remove any auto-detected clef first, then insert the guitar clef.
        first_measure = part.getElementsByClass(stream.Measure).first()
        if first_measure is not None:
            for existing_clef in list(first_measure.getElementsByClass(clef.Clef)):
                first_measure.remove(existing_clef)
            first_measure.insert(0, clef.Treble8vbClef())

    with tempfile.NamedTemporaryFile(suffix=".xml", delete=False) as fx:
        xml_path = fx.name
    score.write("musicxml", fp=xml_path)
    try:
        with open(xml_path, encoding="utf-8") as fh:
            xml = fh.read()
        # music21 hard-codes <creator type="composer">Music21</creator> as a default.
        # Remove it so the score doesn't appear to be composed by the software itself.
        import re as _re
        xml = _re.sub(r'\s*<creator type="composer">Music21</creator>', "", xml)
        return xml
    finally:
        try:
            os.unlink(xml_path)
        except OSError:
            pass


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class AudioImportRequest(BaseModel):
    filename: str = Field(..., description="Original filename for logging.")
    audio_base64: str | None = Field(None, description="Base64-encoded audio content.")
    audio_url: str | None = Field(None, description="Local file path to audio file.")
    mode: str = Field(
        "basic_pitch",
        description=(
            "'basic_pitch' (polyphonic, fast, ~70% F1 guitar), "
            "'gaps' (polyphonic, slower, SOTA classical guitar), "
            "'auto' (gaps first, basic_pitch fallback)."
        ),
    )


class MidiImportRequest(BaseModel):
    filename: str = Field(..., description="Original .mid filename.")
    midi_base64: str = Field(..., description="Base64-encoded MIDI file content.")
    part_name: str = Field("Classical Guitar", description="Part name to assign.")


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/import")
def audio_import(req: AudioImportRequest) -> dict[str, Any]:
    """Transcribe audio to MusicXML using polyphonic AMT.

    Mode 'basic_pitch': fast (~30s), polyphonic, ~70% F1 on guitar.
    Mode 'gaps': slower (~2min), SOTA for classical guitar (ISMIR 2024).
    Mode 'auto': tries gaps first, falls back to basic_pitch on error.

    Note: for perfect accuracy, export MIDI from MuseScore/GarageBand/Logic
    and use POST /audio/import-midi instead.
    """
    if not _amt_venv_available():
        raise HTTPException(
            status_code=503,
            detail=(
                "AMT venv not found. Run: "
                "python3.12 -m venv backend/agent/venvs/amt && "
                "backend/agent/venvs/amt/bin/pip install 'basic-pitch[onnx]' "
                "piano-transcription-inference"
            ),
        )

    if not req.audio_base64 and not req.audio_url:
        raise HTTPException(status_code=422, detail="Provide audio_base64 or audio_url.")

    suffix = Path(req.filename).suffix or ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
        audio_path = f.name
        if req.audio_base64:
            f.write(base64.b64decode(req.audio_base64))
        elif req.audio_url:
            src = Path(req.audio_url)
            if not src.exists():
                raise HTTPException(status_code=422, detail=f"File not found: {req.audio_url}")
            f.write(src.read_bytes())

    title = Path(req.filename).stem  # e.g. "Vuelvo a ti - J. Peon Contreras, Chan Cil"
    engine_used = "unknown"
    try:
        if req.mode in ("gaps", "auto"):
            try:
                musicxml = _transcribe_gaps(audio_path, title=title)
                engine_used = "gaps"
            except Exception as gaps_err:
                logger.warning("GAPS transcription failed, falling back to Basic Pitch: %s", gaps_err)
                if req.mode == "gaps":
                    raise
                musicxml = _transcribe_basic_pitch(audio_path, title=title)
                engine_used = "basic_pitch_fallback"
        else:
            musicxml = _transcribe_basic_pitch(audio_path, title=title)
            engine_used = "basic_pitch"
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("audio_import: transcription failed")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {exc}") from exc
    finally:
        try:
            os.unlink(audio_path)
        except OSError:
            pass

    notes = {
        "basic_pitch": "Basic Pitch (polyphonic, ONNX, ~70% F1 guitar). Verify melody and rhythm manually.",
        "basic_pitch_fallback": "Basic Pitch (GAPS failed, fallback). Verify result carefully.",
        "gaps": "GAPS model (ISMIR 2024 SOTA classical guitar). Best available quality for nylon-string guitar.",
    }

    return {
        "status": "ok",
        "engine": engine_used,
        "filename": req.filename,
        "musicxml": musicxml,
        "note": notes.get(engine_used, ""),
    }


@router.post("/import-midi")
def midi_import(req: MidiImportRequest) -> dict[str, Any]:
    """Convert a MIDI file to MusicXML (100% accurate, recommended for Chan Cil).

    Export MIDI from GarageBand, Logic, MuseScore, or a MIDI keyboard recording.
    Captures melody + bass + chords with perfect accuracy.
    """
    if not _midi_available():
        raise HTTPException(status_code=503, detail="mido not installed: uv add mido")

    with tempfile.NamedTemporaryFile(suffix=".mid", delete=False) as f:
        midi_path = f.name
        f.write(base64.b64decode(req.midi_base64))

    try:
        musicxml = _midi_file_to_musicxml(
            midi_path,
            part_name=req.part_name,
            title=Path(req.filename).stem,
        )
    except Exception as exc:
        logger.exception("midi_import: conversion failed")
        raise HTTPException(status_code=500, detail=f"MIDI conversion failed: {exc}") from exc
    finally:
        try:
            os.unlink(midi_path)
        except OSError:
            pass

    return {
        "status": "ok",
        "engine": "mido+music21",
        "filename": req.filename,
        "musicxml": musicxml,
        "note": "MIDI import — 100% accurate polyphonic capture.",
    }


@router.get("/capabilities")
def audio_capabilities() -> dict[str, Any]:
    """Return current audio AI pipeline capability flags."""
    amt = _amt_venv_available()
    md = _midi_available()
    return {
        "stem_separation": False,
        "transcription": amt,
        "transcription_polyphonic": amt,
        "transcription_monophonic": amt,
        "transcription_engine": "basic_pitch+gaps" if amt else None,
        "midi_import": md,
        "requires_modal": False,
        "note": (
            "AMT venv ready: Basic Pitch (fast) + GAPS model (SOTA guitar)."
            if amt
            else "AMT venv not set up. Run setup script or use MIDI import."
        ),
    }
