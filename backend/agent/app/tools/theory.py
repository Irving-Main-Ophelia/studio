"""Theory tools.

Phase 0 ships the smallest useful pair:
- ``analyze_key`` — Krumhansl-Schmuckler key estimation.
- ``transpose_musicxml`` — interval-aware transposition.

These functions accept and return plain strings/dicts so they can be called
both by HTTP routes and by the agent tool-loop.
"""

from __future__ import annotations

from typing import Any

from music21 import analysis, converter, interval, key, stream


def _parse(musicxml: str) -> stream.Score:
    score = converter.parseData(musicxml, format="musicxml")
    if not isinstance(score, stream.Score):
        # music21 sometimes returns Part for single-part fragments; lift to Score.
        wrapped = stream.Score()
        wrapped.insert(0, score)
        score = wrapped
    return score


def analyze_key(musicxml: str) -> dict[str, Any]:
    """Estimate the key of a MusicXML score using Krumhansl-Schmuckler.

    Returns ``{ "key": "F#", "mode": "minor", "confidence": 0.78 }``.
    """
    score = _parse(musicxml)
    estimated = score.analyze("key.krumhanslSchmuckler")
    assert isinstance(estimated, key.Key)
    return {
        "key": estimated.tonic.name,
        "mode": estimated.mode,
        "confidence": float(estimated.correlationCoefficient or 0.0),
    }


def _coerce_key(name: str) -> key.Key:
    """Accept 'F#m', 'Bb', 'G major', etc. and return a music21 Key."""
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
        mode = "major"
    return key.Key(tonic, mode)


def transpose_musicxml(musicxml: str, target_key: str) -> dict[str, Any]:
    """Transpose a MusicXML score so its tonal center moves to ``target_key``.

    Strategy: analyze current key, compute the directed interval to the
    requested key, transpose by that interval. Returns the new MusicXML plus
    metadata.
    """
    score = _parse(musicxml)

    from_key_obj: key.Key
    estimated = score.analyze("key.krumhanslSchmuckler")
    if isinstance(estimated, key.Key):
        from_key_obj = estimated
    else:
        raise ValueError("Could not estimate the source key.")

    to_key_obj = _coerce_key(target_key)

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
