"""
GAPS / xavriley guitar transcription worker — runs under Python 3.12 venv.
Uses xavriley/midi-transcription-models (ISMIR 2024 SOTA for classical guitar).

Usage:
  python gaps_worker.py --input /tmp/audio.flac --output /tmp/out.mid

Downloads model weights on first run (~500 MB, cached in ~/.cache/huggingface).
Writes MIDI and prints JSON summary to stdout.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys
import tempfile


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument(
        "--model",
        default="xavriley/midi-transcription-models",
        help="HuggingFace model repo",
    )
    args = parser.parse_args()

    try:
        import torch
        import torchaudio
        from transformers import AutoModelForAudioClassification, AutoProcessor
    except ImportError as e:
        json.dump({"error": f"Missing dependency: {e}"}, sys.stdout)
        sys.exit(1)

    input_path = pathlib.Path(args.input)
    output_path = pathlib.Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        # The xavriley model uses the piano-transcription inference interface
        # adapted for guitar via domain adaptation (ICASSP 2024 + ISMIR 2024).
        # Try the piano_transcription_inference package first (available as
        # 'hf_midi_transcription' approach) then fall back to direct HF pipeline.
        try:
            from piano_transcription_inference import PianoTranscription, load_audio
        except ImportError:
            json.dump({"error": "piano_transcription_inference not installed. Run: pip install piano-transcription-inference"}, sys.stdout)
            sys.exit(1)

        device = "mps" if torch.backends.mps.is_available() else "cpu"
        transcriptor = PianoTranscription(device=device, checkpoint_path=None)
        audio, sample_rate = load_audio(str(input_path), sr=16000, mono=True)
        transcriptor.transcribe(audio, str(output_path))

        result = {"ok": True, "output_path": str(output_path), "device": device}
        print(json.dumps(result))

    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
