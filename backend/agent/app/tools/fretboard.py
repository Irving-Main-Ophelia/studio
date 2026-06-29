"""Fret math for guitar tablature (Phase 4 / Track A — A1, A3).

Pure, dependency-light helpers that map between concert pitch and a (string, fret)
position on a fretted instrument, honouring tuning and capo. The tab projection
(``tab_projection.py``) and, later, the fretboard/chord/scale engines consume this.

Conventions (match MusicXML ``<string>`` numbering and ADR-0018):
- A *tuning* is the list of open-string pitch names, **string 1 (highest/thinnest)
  first** — e.g. standard guitar is ``["E4", "B3", "G3", "D3", "A2", "E2"]``.
- ``string`` numbers returned are **1-based** (string 1 = first tuning entry).
- ``capo`` raises every open string by that many frets; displayed fret numbers are
  read relative to the capo (the capo becomes the new nut), so they stay small —
  which is how a guitarist reads capo'd tab.
"""

from __future__ import annotations

from dataclasses import dataclass

# Semitone offset of each natural pitch step within an octave.
_STEP_SEMITONES: dict[str, int] = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}

# Default highest fret considered playable when assigning a position.
DEFAULT_MAX_FRET = 24

# Named tunings that ship in M4.0/M4.2 (ADR-0018, PHASE_4 §4.7 Q1). Custom tunings
# are supplied as an explicit pitch-name list, so N-string is data, not code.
TUNINGS: dict[str, list[str]] = {
    "standard": ["E4", "B3", "G3", "D3", "A2", "E2"],
    "drop_d": ["E4", "B3", "G3", "D3", "A2", "D2"],
    "dadgad": ["D4", "A3", "G3", "D3", "A2", "D2"],
    "bass_standard": ["G2", "D2", "A1", "E1"],
}

STANDARD_TUNING: list[str] = TUNINGS["standard"]


def pitch_name_to_midi(name: str) -> int:
    """Convert a pitch name like ``"E4"``, ``"C#3"`` or ``"Bb2"`` to a MIDI number.

    MIDI 60 = C4 (scientific pitch notation, the convention music21 uses).
    """
    name = name.strip()
    if not name:
        raise ValueError("empty pitch name")
    letter = name[0].upper()
    if letter not in _STEP_SEMITONES:
        raise ValueError(f"bad pitch letter in {name!r}")
    alter = 0
    i = 1
    while i < len(name) and name[i] in "#b♯♭x":
        alter += 2 if name[i] == "x" else (1 if name[i] in "#♯" else -1)
        i += 1
    octave_str = name[i:]
    try:
        octave = int(octave_str)
    except ValueError as exc:
        raise ValueError(f"bad octave in {name!r}") from exc
    return (octave + 1) * 12 + _STEP_SEMITONES[letter] + alter


def step_alter_octave_to_midi(step: str, alter: int, octave: int) -> int:
    """MIDI number from MusicXML ``<step>``/``<alter>``/``<octave>`` parts."""
    letter = step.strip().upper()
    if letter not in _STEP_SEMITONES:
        raise ValueError(f"bad step {step!r}")
    return (octave + 1) * 12 + _STEP_SEMITONES[letter] + alter


@dataclass(frozen=True)
class FretPosition:
    """A playable position: 1-based ``string`` and ``fret`` (relative to the capo)."""

    string: int
    fret: int


def open_string_midis(tuning: list[str], capo: int = 0) -> list[int]:
    """Effective open-string MIDI numbers after applying the capo."""
    if capo < 0:
        raise ValueError("capo must be >= 0")
    return [pitch_name_to_midi(p) + capo for p in tuning]


def assign_fret(
    midi: int,
    tuning: list[str],
    capo: int = 0,
    max_fret: int = DEFAULT_MAX_FRET,
) -> FretPosition | None:
    """Pick a playable ``(string, fret)`` for a concert-pitch ``midi`` value.

    Heuristic for M4.0: choose the position with the **lowest fret** — i.e. the
    thinnest string whose effective open pitch is still at or below the target.
    Returns ``None`` when the pitch is unplayable in this tuning (below the lowest
    open string, or beyond ``max_fret`` on every string); the caller then leaves
    the note without a tab position rather than misrepresenting its pitch.
    """
    opens = open_string_midis(tuning, capo)
    best: FretPosition | None = None
    # tuning[0] is string 1 (highest). Iterating in order means the first feasible
    # string is the highest one that can reach the pitch ⇒ the smallest fret.
    for idx, open_midi in enumerate(opens):
        fret = midi - open_midi
        if 0 <= fret <= max_fret:
            best = FretPosition(string=idx + 1, fret=fret)
            break
    return best
