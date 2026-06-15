"""Pillar-10 practice coach — score diff and heat-map generation.

Compares a 'target' score (what should be played) against a 'performance'
score (what was actually played, as MIDI-derived MusicXML) and produces:
  - A list of errors per measure (wrong pitch, timing, missing note)
  - A heat-map: list of (measure_number, error_count) for visualization
  - A practice plan: ordered list of measures to focus on, worst-first
"""

from __future__ import annotations

from typing import Any

from stockhausen_theory.score_io import parse_score


def _midi_value(pitch: Any) -> int:
    """Return MIDI integer for a music21 Pitch object."""
    return int(pitch.midi)


def _notes_in_measure(part: Any, measure_number: int) -> list[dict[str, Any]]:
    """Extract notes from a specific measure in a part.

    Returns a list of dicts with keys: midi (int), beat (float).
    Chord members are each returned as individual note entries.
    """
    notes: list[dict[str, Any]] = []
    for measure in part.getElementsByClass("Measure"):
        if int(measure.number) != measure_number:
            continue
        for el in measure.notes:
            beat = float(el.beat)
            if el.isChord:
                for p in el.pitches:
                    notes.append({"midi": _midi_value(p), "beat": beat})
            else:
                notes.append({"midi": _midi_value(el.pitch), "beat": beat})
    return notes


def _match_pitch(midi: int, candidates: list[dict[str, Any]]) -> int | None:
    """Find the index of the first candidate matching pitch within ±1 semitone."""
    for i, c in enumerate(candidates):
        if abs(c["midi"] - midi) <= 1:
            return i
    return None


def _count_errors(
    target_notes: list[dict[str, Any]],
    perf_notes: list[dict[str, Any]],
) -> dict[str, int]:
    """Compare target notes vs performance notes for a single measure.

    Returns:
        missing:       notes in target not present (by pitch) in performance
        extra:         notes in performance not matched to any target pitch
        timing_errors: notes present in both but with beat offset > 0.5
    """
    perf_remaining = list(perf_notes)
    missing = 0
    timing_errors = 0
    matched_perf_indices: set[int] = set()

    for t_note in target_notes:
        idx = _match_pitch(t_note["midi"], perf_remaining)
        if idx is None:
            missing += 1
        else:
            p_note = perf_remaining[idx]
            matched_perf_indices.add(id(perf_notes[perf_notes.index(p_note) if p_note in perf_notes else 0]))
            if abs(p_note["beat"] - t_note["beat"]) > 0.5:
                timing_errors += 1
            # Remove matched note so it can't match twice
            perf_remaining.pop(idx)

    extra = len(perf_remaining)  # unmatched performance notes
    return {"missing": missing, "extra": extra, "timing_errors": timing_errors}


def _severity(error_count: int) -> str:
    """Map error count to heat-map severity label."""
    if error_count == 0:
        return "low"
    if error_count <= 2:
        return "medium"
    return "high"


def _focus(missing: int, timing_errors: int, extra: int) -> str:
    """Determine practice focus label for a measure."""
    if missing > timing_errors:
        return "pitch accuracy"
    if timing_errors > 0:
        return "timing"
    return "note selection"


def compare_performance(target_musicxml: str, performance_musicxml: str) -> dict[str, Any]:
    """Compare a performance against a target score measure-by-measure.

    Parameters
    ----------
    target_musicxml:
        MusicXML of the score as it should be played.
    performance_musicxml:
        MusicXML derived from the actual performance (e.g. MIDI-transcribed).

    Returns
    -------
    A dict with keys:
        total_measures    int
        total_errors      int
        errors_by_measure list[{measure, missing, extra, timing_errors, total}]
        heat_map          list[{measure, error_count, severity}]
        practice_plan     list[{priority, measure, error_count, focus}]
    """
    target_score = parse_score(target_musicxml)
    perf_score = parse_score(performance_musicxml)

    # Use the first part of each score for comparison
    target_parts = list(target_score.parts) if target_score.parts else [target_score]
    perf_parts = list(perf_score.parts) if perf_score.parts else [perf_score]

    target_part = target_parts[0]
    perf_part = perf_parts[0] if perf_parts else target_parts[0]

    # Collect all measure numbers from the target part
    measure_numbers = sorted(
        {int(m.number) for m in target_part.getElementsByClass("Measure")}
    )
    total_measures = len(measure_numbers)

    errors_by_measure: list[dict[str, Any]] = []
    total_errors = 0

    for mnum in measure_numbers:
        target_notes = _notes_in_measure(target_part, mnum)
        perf_notes = _notes_in_measure(perf_part, mnum)
        err = _count_errors(target_notes, perf_notes)
        measure_total = err["missing"] + err["extra"] + err["timing_errors"]
        total_errors += measure_total
        errors_by_measure.append(
            {
                "measure": mnum,
                "missing": err["missing"],
                "extra": err["extra"],
                "timing_errors": err["timing_errors"],
                "total": measure_total,
            }
        )

    heat_map = [
        {
            "measure": row["measure"],
            "error_count": row["total"],
            "severity": _severity(row["total"]),
        }
        for row in errors_by_measure
    ]

    # Practice plan: top 5 measures by error count, worst-first
    sorted_by_errors = sorted(errors_by_measure, key=lambda r: r["total"], reverse=True)
    top_five = sorted_by_errors[:5]
    practice_plan = [
        {
            "priority": i + 1,
            "measure": row["measure"],
            "error_count": row["total"],
            "focus": _focus(row["missing"], row["timing_errors"], row["extra"]),
        }
        for i, row in enumerate(top_five)
        if row["total"] > 0
    ]

    return {
        "total_measures": total_measures,
        "total_errors": total_errors,
        "errors_by_measure": errors_by_measure,
        "heat_map": heat_map,
        "practice_plan": practice_plan,
    }
