"""Theory tools.

Phase 0 ships a small useful set:
- ``analyze_key`` — Krumhansl-Schmuckler key estimation.
- ``transpose_musicxml`` — interval-aware transposition.
- ``extract_notes`` — note list + tempo metadata for browser playback.

These functions accept and return plain strings/dicts so they can be called
both by HTTP routes and by the agent tool-loop.
"""

from __future__ import annotations

from typing import Any

from music21 import converter, interval, key, stream, tempo


def _parse(musicxml: str) -> stream.Score:
    parsed = converter.parseData(musicxml, format="musicxml")
    if isinstance(parsed, stream.Score):
        return parsed
    # music21 sometimes returns Part for single-part fragments; lift to Score.
    wrapped = stream.Score()
    wrapped.insert(0, parsed)  # type: ignore[no-untyped-call]
    return wrapped


def analyze_key(musicxml: str) -> dict[str, Any]:
    """Estimate the key of a MusicXML score using Krumhansl-Schmuckler.

    Returns ``{ "key": "F#", "mode": "minor", "confidence": 0.78 }``.
    """
    score = _parse(musicxml)
    estimated = score.analyze("key.krumhansl")
    if not isinstance(estimated, key.Key):
        raise ValueError("Could not estimate the key of this score.")
    return {
        "key": estimated.tonic.name,
        "mode": estimated.mode,
        "confidence": float(estimated.correlationCoefficient or 0.0),
    }


def _coerce_key(name: str, default_mode: str = "major") -> key.Key:
    """Accept 'F#m', 'Bb', 'G major', etc. and return a music21 Key.

    If the input does not specify a mode, falls back to ``default_mode`` —
    callers typically pass the source key's mode so 'transpose to G' of an
    F#-minor piece becomes G minor (not G major).
    """
    stripped = name.strip()
    lowered = stripped.lower()
    if lowered.endswith("m") and not lowered.endswith("maj"):
        tonic = stripped[:-1]
        mode = "minor"
    elif "minor" in lowered:
        tonic = lowered.replace("minor", "").strip().capitalize()
        mode = "minor"
    elif "major" in lowered:
        tonic = lowered.replace("major", "").strip().capitalize()
        mode = "major"
    else:
        tonic = stripped
        mode = default_mode
    return key.Key(tonic, mode)


def transpose_musicxml(musicxml: str, target_key: str) -> dict[str, Any]:
    """Transpose a MusicXML score so its tonal center moves to ``target_key``.

    Strategy: analyze current key, compute the directed interval to the
    requested key, transpose by that interval. Returns the new MusicXML plus
    metadata.
    """
    score = _parse(musicxml)

    from_key_obj: key.Key
    estimated = score.analyze("key.krumhansl")
    if isinstance(estimated, key.Key):
        from_key_obj = estimated
    else:
        raise ValueError("Could not estimate the source key.")

    to_key_obj = _coerce_key(target_key, default_mode=from_key_obj.mode)

    direct = interval.Interval(from_key_obj.tonic, to_key_obj.tonic)
    transposed = score.transpose(direct)
    if transposed is None:
        raise ValueError("Transposition failed.")

    out = transposed.write("musicxml")
    with open(out, encoding="utf-8") as fh:
        out_xml = fh.read()

    return {
        "musicxml": out_xml,
        "from_key": f"{from_key_obj.tonic.name} {from_key_obj.mode}",
        "to_key": f"{to_key_obj.tonic.name} {to_key_obj.mode}",
        "interval": direct.directedName,
    }


def extract_notes(musicxml: str) -> dict[str, Any]:
    """Return a flat note list + metadata suitable for browser playback.

    Output shape::

        {
          "tempo_bpm": 120.0,
          "duration_sec": 18.5,
          "notes": [
            {
              "midi": 60,
              "start_sec": 0.0,
              "duration_sec": 0.5,
              "part_index": 0,
              "velocity": 90
            },
            ...
          ]
        }
    """
    score = _parse(musicxml)

    tempos = list(score.flatten().getElementsByClass(tempo.MetronomeMark))
    tempo_bpm = float(tempos[0].number) if tempos and tempos[0].number else 90.0
    quarter_sec = 60.0 / tempo_bpm

    notes: list[dict[str, Any]] = []
    parts = list(score.parts) if score.parts else [score]
    max_end = 0.0
    default_velocity = 90
    for part_index, part in enumerate(parts):
        for element in part.flatten().notes:
            start_quarter = float(element.offset)
            dur_quarter = float(element.duration.quarterLength)
            if dur_quarter <= 0:
                continue
            start_sec = start_quarter * quarter_sec
            duration_sec = dur_quarter * quarter_sec
            max_end = max(max_end, start_sec + duration_sec)
            pitches = (
                list(element.pitches) if element.isChord else [element.pitch]  # type: ignore[attr-defined]
            )
            for p in pitches:
                notes.append(
                    {
                        "midi": int(p.midi),
                        "start_sec": round(start_sec, 4),
                        "duration_sec": round(duration_sec, 4),
                        "part_index": part_index,
                        "velocity": default_velocity,
                    }
                )

    notes.sort(key=lambda n: (n["start_sec"], n["midi"]))

    return {
        "tempo_bpm": tempo_bpm,
        "duration_sec": round(max_end, 4),
        "notes": notes,
    }
