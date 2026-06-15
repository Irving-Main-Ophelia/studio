"""Pillar-6 orchestration profiles.

An orchestration profile defines:
  - A fixed set of parts with canonical instrument names and MIDI programs.
  - An assignment strategy that maps existing score parts onto those slots
    (by number, by range, or by heuristic).

``apply_profile(musicxml, profile_name)`` returns:
  - ``musicxml``  : rescored MusicXML string
  - ``profile``   : the profile that was applied
  - ``warnings``  : range-check warnings for each output part
  - ``assignment``: list of {slot_index, slot_name, source_part_index}
"""

from __future__ import annotations

import copy
from dataclasses import dataclass, field
from typing import Any

from music21 import instrument as m21instrument
from music21 import stream as m21stream

from stockhausen_theory.instrument_ranges import INSTRUMENT_RANGE, InstrumentRange
from stockhausen_theory.score_io import parse_score, serialise_score


# ---------------------------------------------------------------------------
# Profile descriptors
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class PartSlot:
    name: str                       # canonical name ("Violin I")
    instrument_key: str             # key into INSTRUMENT_RANGE
    midi_program: int               # GM program number (0-based)
    clef: str = "treble"            # "treble" | "bass" | "alto" | "tenor"


@dataclass
class OrchestrationProfile:
    name: str
    display_name: str
    slots: list[PartSlot] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Profile catalogue
# ---------------------------------------------------------------------------

PROFILES: dict[str, OrchestrationProfile] = {
    "string_quartet": OrchestrationProfile(
        name="string_quartet",
        display_name="String Quartet",
        slots=[
            PartSlot("Violin I",  "violin",       40, "treble"),
            PartSlot("Violin II", "violin",       40, "treble"),
            PartSlot("Viola",     "viola",        41, "alto"),
            PartSlot("Cello",     "violoncello",  42, "bass"),
        ],
    ),
    "woodwind_quintet": OrchestrationProfile(
        name="woodwind_quintet",
        display_name="Woodwind Quintet",
        slots=[
            PartSlot("Flute",         "flute",        73, "treble"),
            PartSlot("Oboe",          "oboe",         68, "treble"),
            PartSlot("Clarinet in Bb","clarinet",     71, "treble"),
            PartSlot("Bassoon",       "bassoon",      70, "bass"),
            PartSlot("French Horn",   "french horn",  60, "treble"),
        ],
    ),
    "piano_reduction": OrchestrationProfile(
        name="piano_reduction",
        display_name="Piano Reduction",
        slots=[
            PartSlot("Piano RH", "piano", 0, "treble"),
            PartSlot("Piano LH", "piano", 0, "bass"),
        ],
    ),
    "brass_quartet": OrchestrationProfile(
        name="brass_quartet",
        display_name="Brass Quartet",
        slots=[
            PartSlot("Trumpet 1",   "trumpet",  56, "treble"),
            PartSlot("Trumpet 2",   "trumpet",  56, "treble"),
            PartSlot("Trombone",    "trombone", 57, "bass"),
            PartSlot("Tuba",        "tuba",     58, "bass"),
        ],
    ),
    "vocal_satb": OrchestrationProfile(
        name="vocal_satb",
        display_name="Vocal SATB",
        slots=[
            PartSlot("Soprano", "soprano", 52, "treble"),
            PartSlot("Alto",    "alto",    52, "treble"),
            PartSlot("Tenor",   "tenor",   52, "treble"),
            PartSlot("Bass",    "bass",    52, "bass"),
        ],
    ),
    "piano_trio": OrchestrationProfile(
        name="piano_trio",
        display_name="Piano Trio",
        slots=[
            PartSlot("Piano",  "piano",       0,  "treble"),
            PartSlot("Violin", "violin",      40, "treble"),
            PartSlot("Cello",  "violoncello", 42, "bass"),
        ],
    ),
    "western_orchestra": OrchestrationProfile(
        name="western_orchestra",
        display_name="Romantic Orchestra",
        slots=[
            PartSlot("Flute I",      "flute",        73, "treble"),
            PartSlot("Flute II",     "flute",        73, "treble"),
            PartSlot("Oboe I",       "oboe",         68, "treble"),
            PartSlot("Oboe II",      "oboe",         68, "treble"),
            PartSlot("Clarinet I",   "clarinet",     71, "treble"),
            PartSlot("Clarinet II",  "clarinet",     71, "treble"),
            PartSlot("Bassoon I",    "bassoon",      70, "bass"),
            PartSlot("Bassoon II",   "bassoon",      70, "bass"),
            PartSlot("Horn I",       "french horn",  60, "treble"),
            PartSlot("Horn II",      "french horn",  60, "treble"),
            PartSlot("Horn III",     "french horn",  60, "treble"),
            PartSlot("Horn IV",      "french horn",  60, "treble"),
            PartSlot("Trumpet I",    "trumpet",      56, "treble"),
            PartSlot("Trumpet II",   "trumpet",      56, "treble"),
            PartSlot("Trombone I",   "trombone",     57, "bass"),
            PartSlot("Trombone II",  "trombone",     57, "bass"),
            PartSlot("Trombone III", "trombone",     57, "bass"),
            PartSlot("Tuba",         "tuba",         58, "bass"),
            PartSlot("Violin I",     "violin",       40, "treble"),
            PartSlot("Violin II",    "violin",       40, "treble"),
            PartSlot("Viola",        "viola",        41, "alto"),
            PartSlot("Cello",        "violoncello",  42, "bass"),
            PartSlot("Contrabass",   "contrabass",   43, "bass"),
            PartSlot("Timpani",      "timpani",      47, "bass"),
        ],
    ),
    "jazz_combo": OrchestrationProfile(
        name="jazz_combo",
        display_name="Jazz Combo",
        slots=[
            PartSlot("Piano",           "piano",          0,  "treble"),
            PartSlot("Double Bass",     "contrabass",     32, "bass"),
            PartSlot("Drums",           "drum_kit",       0,  "treble"),
            PartSlot("Alto Saxophone",  "alto_saxophone", 65, "treble"),
            PartSlot("Trumpet",         "trumpet",        56, "treble"),
        ],
    ),
    "hard_rock_band": OrchestrationProfile(
        name="hard_rock_band",
        display_name="Hard Rock Band",
        slots=[
            PartSlot("Electric Guitar", "electric_guitar", 29, "treble"),
            PartSlot("Bass Guitar",     "bass_guitar",     33, "bass"),
            PartSlot("Drums",           "drum_kit",        0,  "treble"),
            PartSlot("Vocals",          "soprano",         52, "treble"),
            PartSlot("Rhythm Guitar",   "electric_guitar", 26, "treble"),
        ],
    ),
    "world_ensemble": OrchestrationProfile(
        name="world_ensemble",
        display_name="World Ensemble (Generic)",
        slots=[
            PartSlot("Melody I",   "flute",       73, "treble"),
            PartSlot("Melody II",  "oboe",        68, "treble"),
            PartSlot("Harmony",    "clarinet",    71, "treble"),
            PartSlot("Bass",       "violoncello", 42, "bass"),
            PartSlot("Percussion", "drum_kit",    0,  "treble"),
        ],
    ),
    "solo_classical_guitar": OrchestrationProfile(
        name="solo_classical_guitar",
        display_name="Solo Classical Guitar",
        slots=[
            # GM program 24 = Acoustic Guitar (Nylon).
            # Guitar is a transposing instrument: written in treble clef,
            # sounds one octave below the written pitch.
            PartSlot("Guitar", "classical guitar", 24, "treble"),
        ],
    ),
    "guitar_duo": OrchestrationProfile(
        name="guitar_duo",
        display_name="Guitar Duo",
        slots=[
            PartSlot("Guitar I",  "classical guitar", 24, "treble"),
            PartSlot("Guitar II", "classical guitar", 24, "treble"),
        ],
    ),
}


# ---------------------------------------------------------------------------
# Assignment helpers
# ---------------------------------------------------------------------------

def _midi_range_of_part(part: m21stream.Part) -> tuple[int, int]:
    """Return (lowest_midi, highest_midi) of all notes in the part."""
    midis: list[int] = []
    for elem in part.flatten().notes:
        pitches = list(elem.pitches) if elem.isChord else [elem.pitch]  # type: ignore[attr-defined]
        midis.extend(int(p.midi) for p in pitches)
    if not midis:
        return (60, 72)
    return (min(midis), max(midis))


def _slot_midi_center(slot: PartSlot) -> float:
    """Midpoint of the slot's practical range, used for greedy assignment."""
    r: InstrumentRange | None = INSTRUMENT_RANGE.get(slot.instrument_key)
    if r is None:
        return 60.0
    return (r.lowest_midi + r.highest_midi) / 2.0


def _assign_parts(
    source_parts: list[m21stream.Part],
    slots: list[PartSlot],
) -> list[int | None]:
    """
    Greedy assignment: for each slot, pick the unused source part whose
    pitch-range centroid is closest to the slot's midpoint.

    Returns a list of length len(slots), each element is a source-part
    index (or None if no source parts remain).
    """
    available = list(range(len(source_parts)))
    # pre-compute centroids for all source parts
    centroids = [sum(_midi_range_of_part(p)) / 2 for p in source_parts]
    assignment: list[int | None] = []
    for slot in slots:
        target = _slot_midi_center(slot)
        if not available:
            assignment.append(None)
            continue
        best = min(available, key=lambda i: abs(centroids[i] - target))
        assignment.append(best)
        available.remove(best)
    return assignment


# ---------------------------------------------------------------------------
# Range warnings
# ---------------------------------------------------------------------------

def _range_warnings_for_part(
    part: m21stream.Part,
    instrument_key: str,
) -> list[dict[str, Any]]:
    r = INSTRUMENT_RANGE.get(instrument_key)
    if r is None:
        return []
    warnings: list[dict[str, Any]] = []
    for meas in part.getElementsByClass(m21stream.Measure):
        for elem in meas.flatten().notes:
            pitches = list(elem.pitches) if elem.isChord else [elem.pitch]  # type: ignore[attr-defined]
            for p in pitches:
                midi = int(p.midi)
                if midi < r.lowest_midi:
                    warnings.append({
                        "kind": "below_range",
                        "instrument": instrument_key,
                        "pitch": p.nameWithOctave,
                        "midi": midi,
                        "measure": meas.number,
                        "lowest_practical": r.lowest_name,
                    })
                elif midi > r.highest_midi:
                    warnings.append({
                        "kind": "above_range",
                        "instrument": instrument_key,
                        "pitch": p.nameWithOctave,
                        "midi": midi,
                        "measure": meas.number,
                        "highest_practical": r.highest_name,
                    })
    return warnings


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def list_profiles() -> list[dict[str, str]]:
    """Return [{name, display_name}] for every available profile."""
    return [{"name": p.name, "display_name": p.display_name} for p in PROFILES.values()]


def apply_profile(
    musicxml: str,
    profile_name: str,
) -> dict[str, Any]:
    """
    Apply an orchestration profile to a MusicXML score.

    Returns:
      musicxml    — rescored MusicXML
      profile     — {name, display_name, slots: [{name, instrument_key}]}
      assignment  — [{slot_index, slot_name, source_part_index | null}]
      warnings    — [{slot_index, slot_name, ...range_warning_fields}]
    """
    if profile_name not in PROFILES:
        raise ValueError(
            f"Unknown profile '{profile_name}'. "
            f"Available: {', '.join(PROFILES)}"
        )
    profile = PROFILES[profile_name]
    source = parse_score(musicxml)
    source_parts = list(source.parts) if source.parts else [source]

    # assignment[slot_idx] = source_part_index | None
    assignment_map = _assign_parts(source_parts, profile.slots)

    # Build output score
    out_score = m21stream.Score()

    # Copy score-level metadata (tempo, time signature) from first part
    if source_parts:
        for elem in source.flatten().getElementsByClass(["MetronomeMark", "TimeSignature", "KeySignature"]):
            out_score.insert(elem.offset, copy.deepcopy(elem))  # type: ignore[no-untyped-call]

    assignment_result: list[dict[str, Any]] = []
    all_warnings: list[dict[str, Any]] = []

    for slot_idx, (slot, src_idx) in enumerate(zip(profile.slots, assignment_map)):
        new_part = m21stream.Part()
        new_part.partName = slot.name

        # Assign instrument
        inst_cls = _resolve_instrument(slot)
        new_part.insert(0, inst_cls)  # type: ignore[no-untyped-call]

        if src_idx is not None:
            # Deep copy notes from source part
            src_part = source_parts[src_idx]
            for meas in src_part.getElementsByClass(m21stream.Measure):
                new_part.append(copy.deepcopy(meas))  # type: ignore[no-untyped-call]
        # else: leave part empty (no source to map to)

        out_score.append(new_part)  # type: ignore[no-untyped-call]

        # Range warnings
        part_warnings = _range_warnings_for_part(new_part, slot.instrument_key)
        for w in part_warnings:
            all_warnings.append({"slot_index": slot_idx, "slot_name": slot.name, **w})

        assignment_result.append({
            "slot_index": slot_idx,
            "slot_name": slot.name,
            "source_part_index": src_idx,
            "source_part_name": source_parts[src_idx].partName if src_idx is not None else None,
        })

    return {
        "musicxml": serialise_score(out_score),
        "profile": {
            "name": profile.name,
            "display_name": profile.display_name,
            "slots": [{"name": s.name, "instrument_key": s.instrument_key} for s in profile.slots],
        },
        "assignment": assignment_result,
        "warnings": all_warnings,
    }


def _resolve_instrument(slot: PartSlot) -> m21instrument.Instrument:
    """Map a PartSlot to a music21 Instrument instance by GM program."""
    inst = m21instrument.Instrument()
    inst.instrumentName = slot.name
    inst.midiProgram = slot.midi_program
    return inst
