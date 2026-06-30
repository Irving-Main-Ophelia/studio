"""Algorithmic chord-voicing and scale-shape engine for the fretboard (A5 + A6).

Built on the fret model (``fretboard.py``); generates guitar voicings and scale
shapes **algorithmically** rather than from a static database (PHASE_4 §4.4 A5/A6):

- Chord pitch classes come from music21's ``harmony.ChordSymbol`` (so any chord
  quality the agent knows is reachable), then the fret model places them.
- Scale pitch classes come from an explicit interval table (pure, no music21).

Both share ``fretboard.assign_fret``/``open_string_midis`` so a voicing and a scale
shape are read against the same tuning/capo the tab view and the agent use.
"""

from __future__ import annotations

import itertools
import re
from typing import Any

from music21 import harmony

from app.tools.fretboard import (
    DEFAULT_MAX_FRET,
    STANDARD_TUNING,
    _STEP_SEMITONES,
    open_string_midis,
)

# Scale degree → semitone offsets from the tonic. Pure data so N-note scales and
# exotic modes are a table edit, not code (mirrors the fret-model philosophy).
SCALE_INTERVALS: dict[str, list[int]] = {
    "major": [0, 2, 4, 5, 7, 9, 11],
    "natural_minor": [0, 2, 3, 5, 7, 8, 10],
    "harmonic_minor": [0, 2, 3, 5, 7, 8, 11],
    "melodic_minor": [0, 2, 3, 5, 7, 9, 11],
    "dorian": [0, 2, 3, 5, 7, 9, 10],
    "phrygian": [0, 1, 3, 5, 7, 8, 10],
    "lydian": [0, 2, 4, 6, 7, 9, 11],
    "mixolydian": [0, 2, 4, 5, 7, 9, 10],
    "locrian": [0, 1, 3, 5, 6, 8, 10],
    "major_pentatonic": [0, 2, 4, 7, 9],
    "minor_pentatonic": [0, 3, 5, 7, 10],
    "blues": [0, 3, 5, 6, 7, 10],
}

_PC_TO_NAME = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def pitch_class_of(name: str) -> int:
    """Pitch class (0–11) of a bare pitch name like ``"C"``, ``"F#"``, ``"Bb"``."""
    name = name.strip()
    if not name or name[0].upper() not in _STEP_SEMITONES:
        raise ValueError(f"bad pitch name {name!r}")
    pc = _STEP_SEMITONES[name[0].upper()]
    for ch in name[1:]:
        if ch in "#♯":
            pc += 1
        elif ch in "b-♭":
            pc -= 1
        elif ch == "x":
            pc += 2
    return pc % 12


def _normalize_chord_figure(figure: str) -> str:
    """Make a chord symbol music21-friendly: a *root* flat ``b`` becomes ``-``.

    music21 reads ``-`` as flat; a literal ``Bb`` would parse the ``b`` as a chord
    quality. Only the accidental right after the root letter is converted, so
    alterations like ``b5``/``b9`` are left intact.
    """
    return re.sub(r"^([A-Ga-g])b", r"\1-", figure.strip())


def chord_pitch_classes(figure: str) -> tuple[set[int], int, str]:
    """Return ``(pitch_classes, root_pc, display_name)`` for a chord symbol."""
    cs = harmony.ChordSymbol(_normalize_chord_figure(figure))
    pcs = {p.pitchClass for p in cs.pitches}
    if not pcs:
        raise ValueError(f"chord {figure!r} produced no pitches")
    root = cs.root()
    root_pc = root.pitchClass if root is not None else min(pcs)
    return pcs, root_pc, figure.strip()


def scale_pitch_classes(tonic: str, scale_name: str) -> tuple[list[int], int]:
    """Return ``(ordered_pitch_classes, tonic_pc)`` for a named scale."""
    if scale_name not in SCALE_INTERVALS:
        raise ValueError(
            f"unsupported scale {scale_name!r}; allowed: {sorted(SCALE_INTERVALS)}"
        )
    tonic_pc = pitch_class_of(tonic)
    pcs = [(tonic_pc + i) % 12 for i in SCALE_INTERVALS[scale_name]]
    return pcs, tonic_pc


def _midi_to_name(midi: int) -> str:
    return f"{_PC_TO_NAME[midi % 12]}{midi // 12 - 1}"


def scale_shape(
    tonic: str,
    scale_name: str,
    *,
    tuning: list[str] | None = None,
    capo: int = 0,
    min_fret: int = 0,
    span: int = 4,
    max_fret: int = DEFAULT_MAX_FRET,
) -> dict[str, Any]:
    """Every fret position of a scale within a fret window — a fretboard 'box'.

    Returns positions (1-based string, fret, midi, pitch, is_root, degree) plus the
    scale's pitch classes. The fretboard viewer highlights these; the root is flagged.
    """
    pcs, tonic_pc = scale_pitch_classes(tonic, scale_name)
    pcs_set = set(pcs)
    degree_of = {pc: i + 1 for i, pc in enumerate(pcs)}
    tuning = list(tuning) if tuning else list(STANDARD_TUNING)
    opens = open_string_midis(tuning, capo)
    hi = min(max_fret, min_fret + span)

    positions: list[dict[str, Any]] = []
    for s_idx, open_midi in enumerate(opens):
        for fret in range(min_fret, hi + 1):
            midi = open_midi + fret
            pc = midi % 12
            if pc in pcs_set:
                positions.append(
                    {
                        "string": s_idx + 1,
                        "fret": fret,
                        "midi": midi,
                        "pitch": _midi_to_name(midi),
                        "is_root": pc == tonic_pc,
                        "degree": degree_of[pc],
                    }
                )
    return {
        "tonic": tonic,
        "scale": scale_name,
        "pitch_classes": pcs,
        "tonic_pc": tonic_pc,
        "positions": positions,
        "min_fret": min_fret,
        "max_fret": hi,
    }


def _difficulty(frets: list[int]) -> str:
    fretted = [f for f in frets if f > 0]
    if not fretted:
        return "open"
    span = max(fretted) - min(fretted)
    # A fret value used on 3+ strings is almost certainly a barre.
    if any(fretted.count(f) >= 3 for f in set(fretted)):
        return "barre"
    if span >= 4:
        return "stretch"
    if min(fretted) <= 3 and 0 in frets:
        return "open"
    return "movable"


def _score_voicing(
    chosen: list[tuple[int, int, int]], root_pc: int, base_fret: int, span: int
) -> float:
    """Higher is better. Rewards root-in-bass, open strings, low position, fullness."""
    # chosen: list of (string_idx, fret, midi) for played strings, lowest string last.
    lowest = max(chosen, key=lambda c: c[0])  # highest string index = lowest pitch string
    open_count = sum(1 for _, f, _ in chosen if f == 0)
    score = 0.0
    if lowest[2] % 12 == root_pc:
        score += 10.0
    score += open_count * 1.5
    score += len(chosen) * 1.0
    score -= base_fret * 1.2
    score -= span * 0.8
    return score


def chord_voicings(
    figure: str,
    *,
    tuning: list[str] | None = None,
    capo: int = 0,
    max_fret: int = 15,
    max_voicings: int = 6,
) -> dict[str, Any]:
    """Generate playable fretboard voicings of a chord symbol, best first.

    Window search: slide a 4-fret window across the neck; on each string pick a
    chord tone within the window (or the open string, or skip). Keep voicings that
    cover every chord tone on a contiguous block of strings, then rank by
    root-in-bass, open strings, position, and fullness.
    """
    pcs, root_pc, name = chord_pitch_classes(figure)
    tuning = list(tuning) if tuning else list(STANDARD_TUNING)
    opens = open_string_midis(tuning, capo)
    n = len(opens)
    need = min(len(pcs), 4) if len(pcs) >= 4 else 3

    seen: set[tuple[int, ...]] = set()
    scored: list[tuple[float, dict[str, Any]]] = []

    for base in range(0, max(1, max_fret - 3 + 1)):
        window = {base, base + 1, base + 2, base + 3}
        per_string: list[list[tuple[int, int, int] | None]] = []
        for s in range(n):
            opts: list[tuple[int, int, int] | None] = [None]  # skip
            for fret in {0, *window}:
                if 0 <= fret <= max_fret and (opens[s] + fret) % 12 in pcs:
                    opts.append((s, fret, opens[s] + fret))
            per_string.append(opts)

        for combo in itertools.product(*per_string):
            chosen = [c for c in combo if c is not None]
            if len(chosen) < need:
                continue
            if {m % 12 for _, _, m in chosen} != pcs:
                continue  # must cover exactly the chord's pitch classes
            played = sorted(c[0] for c in chosen)
            if played[-1] - played[0] != len(played) - 1:
                continue  # strings must be a contiguous block (strummable)
            frets = [0] * n
            for s, f, _ in chosen:
                frets[s] = f
            key = tuple(frets[s] if s in {c[0] for c in chosen} else -1 for s in range(n))
            if key in seen:
                continue
            seen.add(key)
            fretted = [f for _, f, _ in chosen if f > 0]
            span = (max(fretted) - min(fretted)) if fretted else 0
            base_fret = min(fretted) if fretted else 0
            score = _score_voicing(chosen, root_pc, base_fret, span)
            positions = [
                {
                    "string": s + 1,
                    "fret": f,
                    "midi": m,
                    "pitch": _midi_to_name(m),
                    "is_root": m % 12 == root_pc,
                }
                for s, f, m in sorted(chosen, key=lambda c: c[0])
            ]
            lowest = max(chosen, key=lambda c: c[0])
            scored.append(
                (
                    score,
                    {
                        "positions": positions,
                        "base_fret": base_fret,
                        "fret_span": span,
                        "lowest_pitch": _midi_to_name(lowest[2]),
                        "root_in_bass": lowest[2] % 12 == root_pc,
                        "difficulty": _difficulty([f for _, f, _ in chosen]),
                    },
                )
            )

    scored.sort(key=lambda t: t[0], reverse=True)
    voicings = [v for _, v in scored[:max_voicings]]
    return {
        "chord": name,
        "root_pc": root_pc,
        "pitch_classes": sorted(pcs),
        "voicings": voicings,
        "count": len(voicings),
    }
