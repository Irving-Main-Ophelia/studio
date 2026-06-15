"""
Basic Pitch worker — runs under Python 3.12 venv (basic-pitch[onnx]).
Called via subprocess from the Python 3.13 FastAPI process.

Usage:
  python basic_pitch_worker.py --input /tmp/audio.flac --output /tmp/out.mid

Writes a MIDI file and prints a JSON summary to stdout.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import pathlib
import tempfile


def _patch_scipy() -> None:
    """scipy.signal.gaussian was removed in 1.12; basic-pitch 0.3.x still uses it."""
    try:
        import scipy.signal as _ss
        import scipy.signal.windows as _sw
        if not hasattr(_ss, "gaussian"):
            _ss.gaussian = _sw.gaussian
    except Exception:
        pass


def main() -> None:
    _patch_scipy()
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="Path to audio file (FLAC/WAV/MP3)")
    parser.add_argument("--output", required=True, help="Path to write MIDI output")
    parser.add_argument("--onset-threshold", type=float, default=0.5)
    parser.add_argument("--frame-threshold", type=float, default=0.3)
    parser.add_argument("--min-note-length", type=float, default=58.0, help="ms")
    args = parser.parse_args()

    try:
        from basic_pitch.inference import predict
        from basic_pitch import ICASSP_2022_MODEL_PATH
        import pathlib as _pl
        # ICASSP_2022_MODEL_PATH points to the TF SavedModel dir (nmp/).
        # On Python 3.12, TF is unavailable — use the co-located nmp.onnx instead.
        _onnx = _pl.Path(ICASSP_2022_MODEL_PATH).parent / "nmp.onnx"
        MODEL_PATH = str(_onnx) if _onnx.exists() else ICASSP_2022_MODEL_PATH
    except ImportError as e:
        json.dump({"error": f"basic-pitch not installed: {e}"}, sys.stdout)
        sys.exit(1)

    input_path = pathlib.Path(args.input)
    output_path = pathlib.Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        model_output, midi_data, note_events = predict(
            str(input_path),
            MODEL_PATH,
            onset_threshold=args.onset_threshold,
            frame_threshold=args.frame_threshold,
            minimum_note_length=args.min_note_length,
            minimum_frequency=None,
            maximum_frequency=None,
            multiple_pitch_bends=False,
            melodia_trick=True,
        )
        midi_data.write(str(output_path))

        note_count = len(note_events)
        durations = [float(n[1] - n[0]) for n in note_events]
        avg_dur = sum(durations) / len(durations) if durations else 0.0
        pitches = [int(n[2]) for n in note_events]
        pitch_range = [min(pitches), max(pitches)] if pitches else [0, 0]

        result = {
            "ok": True,
            "note_count": int(note_count),
            "avg_duration_sec": round(avg_dur, 3),
            "pitch_range_midi": pitch_range,
            "output_path": str(output_path),
        }
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
