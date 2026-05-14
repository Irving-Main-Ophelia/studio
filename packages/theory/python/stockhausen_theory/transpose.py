"""Pillar 2 — score transposition.

Two flavours:

- ``transpose`` moves the *whole* score to a target key, picking the
  most idiomatic spelling for the target via music21's interval algebra.
- ``transpose_region`` moves a sub-range of measures (one or more parts),
  leaving the rest untouched. Useful for the agent's "modulate to the
  relative major around bar 32" tool call.

Both flavours merge range warnings into the response so callers can
surface them to the maintainer.
"""

from __future__ import annotations

from typing import Any

from music21 import interval, key, note, stream

from stockhausen_theory.analyzers.key import coerce_key
from stockhausen_theory.instrument_ranges import range_for_part
from stockhausen_theory.score_io import parse_score, serialise_score


def _range_warnings(score: stream.Score) -> list[dict[str, Any]]:
    """Return inline range warnings for a freshly-transposed score."""
    parts = list(score.parts) if score.parts else [score]
    warnings: list[dict[str, Any]] = []
    for idx, part in enumerate(parts):
        ir = range_for_part(part)
        if ir is None:
            continue
        for n in part.flatten().notes:
            if not isinstance(n, note.Note):
                continue
            midi = int(n.pitch.midi)
            if midi < ir.lowest_midi or midi > ir.highest_midi:
                measure_obj = n.getContextByClass("Measure")
                warnings.append(
                    {
                        "kind": "above_range" if midi > ir.highest_midi else "below_range",
                        "part_index": idx,
                        "instrument": part.partName,
                        "measure": int(measure_obj.number) if measure_obj is not None else 1,
                        "beat": float(n.beat),
                        "pitch": n.pitch.nameWithOctave,
                    }
                )
    return warnings


def transpose(musicxml: str, target_key: str) -> dict[str, Any]:
    """Transpose the entire score to ``target_key``."""
    score = parse_score(musicxml)
    estimated = score.analyze("key.krumhansl")
    if not isinstance(estimated, key.Key):
        raise ValueError("Could not estimate the source key.")

    to_key = coerce_key(target_key, default_mode=estimated.mode)
    direct = interval.Interval(estimated.tonic, to_key.tonic)
    transposed = score.transpose(direct)
    if transposed is None:
        raise ValueError("Transposition failed.")

    out_xml = serialise_score(transposed)
    source_label = f"{estimated.tonic.name} {estimated.mode}"
    target_label = f"{to_key.tonic.name} {to_key.mode}"
    return {
        "musicxml": out_xml,
        # ``from_key``/``to_key`` kept for the legacy /transpose route.
        "from_key": source_label,
        "to_key": target_label,
        # Canonical M1.3 field names.
        "source_key": source_label,
        "target_key": target_label,
        "interval": direct.directedName,
        "warnings": _range_warnings(transposed),
    }


def transpose_region(
    musicxml: str,
    *,
    target_key: str | None,
    interval_name: str | None,
    measure_start: int,
    measure_end: int,
    part_indices: list[int] | None = None,
) -> dict[str, Any]:
    """Transpose a measure range, optionally restricted to particular parts.

    Either ``target_key`` (resolved against the existing key estimate) OR
    ``interval_name`` (e.g. ``"M3"``, ``"-P5"``) must be provided.
    """
    if target_key is None and interval_name is None:
        raise ValueError("transpose_region needs either target_key or interval_name")
    score = parse_score(musicxml)
    estimated = score.analyze("key.krumhansl")
    if not isinstance(estimated, key.Key):
        raise ValueError("Could not estimate the source key.")

    to_key: key.Key | None = None
    if interval_name is not None:
        try:
            ivl = interval.Interval(interval_name)  # type: ignore[no-untyped-call]
        except Exception as exc:  # noqa: BLE001
            raise ValueError(f"Invalid interval name '{interval_name}': {exc}") from exc
    else:
        assert target_key is not None
        to_key = coerce_key(target_key, default_mode=estimated.mode)
        ivl = interval.Interval(estimated.tonic, to_key.tonic)

    parts = list(score.parts) if score.parts else [score]
    target_part_indices = part_indices or list(range(len(parts)))
    for idx in target_part_indices:
        if idx < 0 or idx >= len(parts):
            continue
        part = parts[idx]
        for measure in part.getElementsByClass(stream.Measure):
            mnum = int(measure.number)
            if mnum < measure_start or mnum > measure_end:
                continue
            for n in measure.notesAndRests:
                if isinstance(n, note.Note):
                    n.pitch.transpose(ivl, inPlace=True)
                elif n.isChord:  # type: ignore[attr-defined]
                    for p in n.pitches:  # type: ignore[attr-defined]
                        p.transpose(ivl, inPlace=True)

    out_xml = serialise_score(score)
    source_label = f"{estimated.tonic.name} {estimated.mode}"
    target_label = f"{to_key.tonic.name} {to_key.mode}" if to_key is not None else source_label
    return {
        "musicxml": out_xml,
        "source_key": source_label,
        "target_key": target_label,
        "interval": ivl.directedName,
        "measure_start": measure_start,
        "measure_end": measure_end,
        "part_indices": target_part_indices,
        "warnings": _range_warnings(score),
    }
