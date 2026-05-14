"""Idiomatic instrument ranges (Pillar 2 + 6 substrate).

These are *practical* ranges — what the maintainer can confidently expect
from a competent player, not the absolute physical extremes. We err on
the conservative side so a "high" warning at, say, F6 for a violin is
not noise.

Source: standard orchestration references (Adler's "The Study of
Orchestration", 4th ed.) cross-checked against modern repertoire.
"""

from __future__ import annotations

from dataclasses import dataclass

from music21 import pitch as m21pitch


@dataclass(frozen=True)
class InstrumentRange:
    lowest_name: str
    highest_name: str

    @property
    def lowest_midi(self) -> int:
        return int(m21pitch.Pitch(self.lowest_name).midi)

    @property
    def highest_midi(self) -> int:
        return int(m21pitch.Pitch(self.highest_name).midi)


# Practical ranges (sounding). Keys are lowercased canonical instrument names.
INSTRUMENT_RANGE: dict[str, InstrumentRange] = {
    "piano": InstrumentRange("A0", "C8"),
    "harpsichord": InstrumentRange("F1", "F6"),
    "organ": InstrumentRange("C2", "C7"),
    "violin": InstrumentRange("G3", "E7"),
    "viola": InstrumentRange("C3", "E6"),
    "violoncello": InstrumentRange("C2", "C6"),
    "cello": InstrumentRange("C2", "C6"),
    "contrabass": InstrumentRange("E1", "G4"),
    "double bass": InstrumentRange("E1", "G4"),
    "flute": InstrumentRange("C4", "D7"),
    "oboe": InstrumentRange("Bb3", "G6"),
    "clarinet": InstrumentRange("D3", "C7"),
    "bassoon": InstrumentRange("Bb1", "Eb5"),
    "french horn": InstrumentRange("F2", "F5"),
    "horn": InstrumentRange("F2", "F5"),
    "trumpet": InstrumentRange("E3", "D6"),
    "trombone": InstrumentRange("E2", "Bb4"),
    "tuba": InstrumentRange("E1", "F4"),
    "soprano": InstrumentRange("C4", "A5"),
    "alto": InstrumentRange("F3", "F5"),
    "tenor": InstrumentRange("C3", "A4"),
    "bass": InstrumentRange("E2", "E4"),
    "guitar": InstrumentRange("E2", "E6"),
    "classical guitar": InstrumentRange("E2", "E6"),
}


def range_for_part(part: object) -> InstrumentRange | None:
    """Resolve the InstrumentRange for a music21 Part-like object."""
    name = getattr(part, "partName", None)
    if not name:
        instrument = getattr(part, "getInstrument", None)
        if callable(instrument):
            try:
                inst = instrument()
                if inst is not None:
                    name = getattr(inst, "instrumentName", None)
            except Exception:  # noqa: BLE001
                name = None
    if not name:
        return None
    key = str(name).strip().lower()
    return INSTRUMENT_RANGE.get(key)
