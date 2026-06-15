"""Music-theory engine for Stockhausen.

Re-exports the analyzers, validators, and Pillar-2 transposition helpers.
The agent backend, the upcoming eval harness, and the Theory Tutor panel
all consume the same surface.
"""

from __future__ import annotations

from stockhausen_theory.analyzers.cadences import analyze_cadences
from stockhausen_theory.analyzers.key import analyze_key
from stockhausen_theory.analyzers.motifs import analyze_motifs
from stockhausen_theory.analyzers.progression import analyze_progression
from stockhausen_theory.analyzers.range import analyze_range
from stockhausen_theory.analyzers.voice_leading import analyze_voice_leading
from stockhausen_theory.score_io import extract_notes, parse_score, serialise_score
from stockhausen_theory.orchestration import apply_profile, list_profiles
from stockhausen_theory.transpose import transpose, transpose_region
from stockhausen_theory.validators.range import validate_range
from stockhausen_theory.validators.rhythm import validate_rhythm
from stockhausen_theory.validators.voice_leading import validate_voice_leading
from stockhausen_theory.validators.voicing import validate_voicing
from stockhausen_theory.practice import compare_performance
from stockhausen_theory.guitar import (
    add_barre,
    add_golpe,
    add_harmonic,
    add_left_hand_fingering,
    add_ligado_slur,
    add_right_hand_fingering,
    add_snap_pizzicato,
    add_string_number,
    add_tonal_colour,
    add_tremolo,
    apply_techniques,
    ensure_guitar_transpose,
)
from stockhausen_theory.validators.guitar_voicing import validate_guitar_voicing

__all__ = [
    "analyze_cadences",
    "analyze_key",
    "analyze_motifs",
    "analyze_progression",
    "analyze_range",
    "analyze_voice_leading",
    "apply_profile",
    "compare_performance",
    "extract_notes",
    "list_profiles",
    "parse_score",
    "serialise_score",
    "transpose",
    "transpose_region",
    "validate_guitar_voicing",
    "validate_range",
    "validate_rhythm",
    "validate_voice_leading",
    "validate_voicing",
    # guitar extended techniques
    "add_barre",
    "add_golpe",
    "add_harmonic",
    "add_left_hand_fingering",
    "add_ligado_slur",
    "add_right_hand_fingering",
    "add_snap_pizzicato",
    "add_string_number",
    "add_tonal_colour",
    "add_tremolo",
    "apply_techniques",
    "ensure_guitar_transpose",
]
