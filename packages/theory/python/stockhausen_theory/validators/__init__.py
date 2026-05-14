"""Validators: predicates that flag specific problems in a score.

Each validator returns ``{"warnings": [...]}`` so callers can merge results
without case-by-case shape handling.
"""

from stockhausen_theory.validators.range import validate_range
from stockhausen_theory.validators.rhythm import validate_rhythm
from stockhausen_theory.validators.voice_leading import validate_voice_leading
from stockhausen_theory.validators.voicing import validate_voicing

__all__ = [
    "validate_range",
    "validate_rhythm",
    "validate_voice_leading",
    "validate_voicing",
]
