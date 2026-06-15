"""Guitar-specific voicing validator.

Checks whether the notes at each beat in a single-part guitar score are
physically playable on a six-string guitar in standard tuning (EADGBe).

Rules enforced:
  1. Maximum left-hand stretch: 4 consecutive frets (5 semitones) across
     all fretted notes (open strings are excluded from the span count).
  2. All simultaneous notes must fit on different strings.  Six notes
     maximum; more than six simultaneous pitches are flagged.
  3. Pitches below E2 (MIDI 40) or above E6 (MIDI 88) are out of range.
  4. Chords of 3+ notes that span more than a minor 10th (15 semitones)
     between the lowest and highest fretted note are flagged as a
     "wide_chord" — playable but require advanced technique.

The validator works at the MusicXML level using music21 note extraction
so it integrates with the existing ScoreDiff pipeline.

Output shape::

    {
        "playable": True | False,
        "warnings": [
            {
                "kind": "stretch_exceeded" | "too_many_strings" |
                        "out_of_range"      | "wide_chord",
                "measure": <int>,
                "beat": <float>,
                "detail": "<human-readable description>",
            },
            ...
        ]
    }
"""

from __future__ import annotations

from typing import Any

from stockhausen_theory.score_io import parse_score

# Standard-tuning open-string MIDI pitches (6=low E to 1=high E)
_OPEN_STRINGS = [40, 45, 50, 55, 59, 64]  # E2 A2 D3 G3 B3 E4

# Guitar sounding range
_MIN_MIDI = 40  # E2
_MAX_MIDI = 88  # E6

_MAX_STRETCH_SEMITONES = 5   # 4 frets = 5 semitones (e.g. fret 1→5)
_WIDE_CHORD_SEMITONES = 15   # minor 10th


def _approximate_fret(midi: int) -> int | None:
    """Estimate the lowest-position fret for a given MIDI pitch.

    Returns None if the pitch cannot be played (out of range).
    Tries each string from highest to lowest and picks the smallest fret >= 0.
    """
    best: int | None = None
    for open_midi in _OPEN_STRINGS:
        fret = midi - open_midi
        if 0 <= fret <= 24:
            if best is None or fret < best:
                best = fret
    return best


def validate_guitar_voicing(musicxml: str) -> dict[str, Any]:
    """Run all guitar-specific voicing checks against the score."""
    score = parse_score(musicxml)
    parts = list(score.parts) if score.parts else [score]

    warnings: list[dict[str, Any]] = []

    for part in parts:
        for measure in part.getElementsByClass("Measure"):
            mnum = int(measure.number)
            # Group notes by beat
            beat_groups: dict[float, list[int]] = {}
            for el in measure.notes:
                beat = round(float(el.beat), 3)
                midis: list[int]
                if el.isChord:
                    midis = [int(p.midi) for p in el.pitches]
                else:
                    midis = [int(el.pitch.midi)]  # type: ignore[attr-defined]
                beat_groups.setdefault(beat, []).extend(midis)

            for beat, midis in sorted(beat_groups.items()):
                midis = sorted(set(midis))

                # 1. Out-of-range check
                for m in midis:
                    if m < _MIN_MIDI or m > _MAX_MIDI:
                        warnings.append(
                            {
                                "kind": "out_of_range",
                                "measure": mnum,
                                "beat": beat,
                                "detail": (
                                    f"Pitch MIDI {m} is outside the guitar's practical "
                                    f"range (E2–E6, MIDI {_MIN_MIDI}–{_MAX_MIDI})."
                                ),
                            }
                        )

                # 2. Too many simultaneous notes
                if len(midis) > 6:
                    warnings.append(
                        {
                            "kind": "too_many_strings",
                            "measure": mnum,
                            "beat": beat,
                            "detail": (
                                f"{len(midis)} simultaneous notes at beat {beat}; "
                                "guitar has only 6 strings."
                            ),
                        }
                    )
                    continue

                # 3. Left-hand stretch check (only fretted notes)
                fretted: list[int] = []
                for m in midis:
                    if m not in _OPEN_STRINGS:
                        fret = _approximate_fret(m)
                        if fret is not None and fret > 0:
                            fretted.append(fret)

                if len(fretted) >= 2:
                    span = max(fretted) - min(fretted)
                    if span > _MAX_STRETCH_SEMITONES:
                        warnings.append(
                            {
                                "kind": "stretch_exceeded",
                                "measure": mnum,
                                "beat": beat,
                                "detail": (
                                    f"Left-hand stretch of {span} frets at beat {beat} "
                                    f"exceeds comfortable limit of {_MAX_STRETCH_SEMITONES}. "
                                    "Consider a different voicing or position shift."
                                ),
                            }
                        )

                # 4. Wide chord warning (not an error, just advisory)
                if len(midis) >= 3:
                    span_semitones = midis[-1] - midis[0]
                    if span_semitones > _WIDE_CHORD_SEMITONES:
                        warnings.append(
                            {
                                "kind": "wide_chord",
                                "measure": mnum,
                                "beat": beat,
                                "detail": (
                                    f"Chord spans {span_semitones} semitones at beat {beat} "
                                    f"(>{_WIDE_CHORD_SEMITONES} = minor 10th). "
                                    "Requires advanced technique or should be arpeggiated."
                                ),
                            }
                        )

    playable = all(w["kind"] not in {"stretch_exceeded", "too_many_strings"} for w in warnings)
    return {"playable": playable, "warnings": warnings}
