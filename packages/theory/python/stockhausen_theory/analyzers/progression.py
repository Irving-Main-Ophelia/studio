"""Roman-numeral progression analysis (Pillar 8 substrate).

For each chord-like beat we ask music21 to compute the Roman numeral in
the score's diatonic context. The output is a list of bar/beat/Roman
records the agent can quote when explaining a passage.

Limits:
- This is harmonic *labelling*, not voice-leading analysis.
- music21's roman analysis works best on chorale-style or piano
  accompaniments; sparse counterpoint produces less useful labels.
"""

from __future__ import annotations

from typing import Any

from music21 import chord, key, roman

from stockhausen_theory.score_io import parse_score


def analyze_progression(musicxml: str) -> dict[str, Any]:
    """Return the chord-by-chord Roman-numeral progression of the score.

    Output shape::

        {
            "key": "F# minor",
            "chords": [
                {"measure": 1, "beat": 1.0, "pitches": ["F#", "A", "C#"], "roman": "i"},
                {"measure": 1, "beat": 3.0, "pitches": ["B", "D", "F#"], "roman": "iv"},
                ...
            ],
            "summary": "i – iv – V – i"
        }
    """
    score = parse_score(musicxml)
    estimated = score.analyze("key.krumhansl")
    if not isinstance(estimated, key.Key):
        raise ValueError("Could not estimate the key for progression analysis.")
    chordified = score.chordify()
    out: list[dict[str, Any]] = []
    for c in chordified.recurse().getElementsByClass(chord.Chord):
        try:
            rn = roman.romanNumeralFromChord(c, estimated)  # type: ignore[no-untyped-call]
        except Exception:  # noqa: BLE001 — music21 raises a wide set
            continue
        measure_obj = c.getContextByClass("Measure")
        measure_num = int(measure_obj.number) if measure_obj is not None else 1
        if isinstance(rn, roman.RomanNumeral):
            roman_label = rn.romanNumeral
            chord_symbol = rn.pitchedCommonName
        else:
            roman_label = str(rn)
            chord_symbol = c.pitchedCommonName
        out.append(
            {
                "measure": measure_num,
                "beat": float(c.beat),
                "pitches": [p.nameWithOctave for p in c.pitches],
                "roman": roman_label,
                "symbol": chord_symbol,
            }
        )

    summary = " – ".join(item["roman"] for item in out) if out else ""
    return {
        "key": {"tonic": estimated.tonic.name, "mode": estimated.mode},
        "chords": out,
        "summary": summary,
    }
