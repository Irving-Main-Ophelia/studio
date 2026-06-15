"""Agent tools — diff-returning facades over the theory engine.

Phase 1 shipped 10 tools; Phase 2 promotes three Phase-1 stubs to real
implementations:
  - score_reharmonize  (Claude-assisted chord substitution)
  - score_add_section  (real score generation via Claude + music21)
  - theory_analyze_form (cadence-based phrase/section detection)

Anthropic's tool-name pattern (``^[a-zA-Z0-9_-]{1,64}$``) forces
underscores on the wire — the UI prettifies them back to dots.
"""

from __future__ import annotations

import copy
import json
import logging
import re
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from anthropic import Anthropic
from anthropic.types import ToolParam
from music21 import key as m21key
from music21 import roman as m21roman
from music21 import stream as m21stream
from music21 import tempo as m21tempo
from stockhausen_theory import (
    analyze_cadences,
    analyze_key,
    analyze_motifs,
    analyze_progression,
    analyze_range,
    analyze_voice_leading,
    validate_range,
    validate_rhythm,
    validate_voice_leading,
    validate_voicing,
)
from stockhausen_theory import (
    transpose as _transpose,
)
from stockhausen_theory import (
    transpose_region as _transpose_region,
)
from stockhausen_theory.orchestration import apply_profile as _apply_profile
from stockhausen_theory.score_io import parse_score, serialise_score
from stockhausen_theory.guitar import apply_techniques as _apply_guitar_techniques
from stockhausen_theory.validators.guitar_voicing import validate_guitar_voicing as _validate_guitar_voicing

from app.config import get_settings
from app.generator import generate_score as _generate_score
from app.guitar_styles import get_style as _get_guitar_style, list_styles as _list_guitar_styles
from app.score_diff import (
    ScoreDiff,
    TheoryWarning,
    build_replace_op,
)

# ---------------------------------------------------------------------------
# Module-level snapshot store (project.snapshot / project.revert)
# ---------------------------------------------------------------------------

_SNAPSHOTS: dict[str, dict[str, Any]] = {}

logger = logging.getLogger(__name__)


def _range_warnings_to_diagnostics(warnings: list[dict[str, Any]]) -> list[TheoryWarning]:
    out: list[TheoryWarning] = []
    for w in warnings:
        out.append(
            TheoryWarning(
                kind=w.get("kind", "range"),
                detail=(
                    f"{w.get('pitch', '?')} in part {w.get('part_index', '?')} "
                    f"falls {w.get('kind', '?').replace('_', ' ')} the practical "
                    f"range for {w.get('instrument', 'this instrument')}."
                ),
                measure=w.get("measure"),
                beat=w.get("beat"),
            )
        )
    return out


# ──────────────────────────────────────────────────────────────────────
# Form analysis helpers
# ──────────────────────────────────────────────────────────────────────


def _group_phrases_into_sections(
    phrases: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Heuristically group phrases into named sections.

    Rules (Phase 2 baseline):
    - Two consecutive phrases ending in authentic cadences = a period.
    - A phrase ending in a half cadence starts a new section.
    - Groups of periods are labelled A, B, A′ etc. by melodic similarity
      (currently approximated by position: first group = A, middle = B,
      final group = A′ if it repeats the first group's length).
    """
    if not phrases:
        return []

    sections: list[dict[str, Any]] = []
    current_phrases: list[dict[str, Any]] = []
    labels = iter("ABCDEFGH")

    def flush(lbl: str) -> None:
        if not current_phrases:
            return
        sections.append(
            {
                "name": lbl,
                "measure_start": current_phrases[0]["measure_start"],
                "measure_end": current_phrases[-1]["measure_end"],
                "phrase_count": len(current_phrases),
                "closes_with": current_phrases[-1].get("cadence_kind"),
            }
        )
        current_phrases.clear()

    label = next(labels, "A")
    for ph in phrases:
        current_phrases.append(ph)
        cad = ph.get("cadence_kind")
        # Authentic or plagal cadence = phrase group boundary
        if cad in ("authentic", "plagal") and len(current_phrases) >= 2:
            flush(label)
            label = next(labels, "X")

    flush(label)
    return sections


# ──────────────────────────────────────────────────────────────────────
# Read-only tools — return analyzer payloads directly
# ──────────────────────────────────────────────────────────────────────


def theory_analyze_form(musicxml: str) -> dict[str, Any]:
    """Phase-2 form analysis — cadence-based phrase and section detection.

    Returns: key, total_measures, phrases (with cadence annotations),
    and sections (A/B/A′ groupings from the heuristic rules above).
    """
    score = parse_score(musicxml)
    key_info = analyze_key(musicxml)
    cadences_info = analyze_cadences(musicxml)

    all_measures = [
        int(m.number)
        for part in (score.parts if score.parts else [score])
        for m in part.getElementsByClass("Measure")
    ]
    total_measures = max(all_measures, default=0)

    cadences = cadences_info.get("cadences", [])
    boundary_set = sorted({1, *[c["measure"] for c in cadences], total_measures})

    cad_by_measure: dict[int, dict[str, Any]] = {c["measure"]: c for c in cadences}

    phrases: list[dict[str, Any]] = []
    for i in range(len(boundary_set) - 1):
        start = boundary_set[i]
        end = boundary_set[i + 1]
        cad = cad_by_measure.get(end)
        phrases.append(
            {
                "measure_start": start,
                "measure_end": end,
                "cadence_kind": cad["kind"] if cad else None,
                "cadence_roman": list(cad["roman_progression"]) if cad else None,
            }
        )

    sections = _group_phrases_into_sections(phrases)
    return {
        "key": key_info,
        "total_measures": total_measures,
        "phrases": phrases,
        "sections": sections,
    }


def theory_analyze_key(musicxml: str) -> dict[str, Any]:
    return analyze_key(musicxml)


def theory_analyze_roman_numerals(musicxml: str) -> dict[str, Any]:
    return analyze_progression(musicxml)


def theory_analyze_voice_leading(musicxml: str) -> dict[str, Any]:
    return analyze_voice_leading(musicxml)


def theory_analyze_range(musicxml: str) -> dict[str, Any]:
    return analyze_range(musicxml)


def theory_analyze_cadences(musicxml: str) -> dict[str, Any]:
    return analyze_cadences(musicxml)


def theory_identify_motifs(
    musicxml: str, *, min_length: int = 4, min_occurrences: int = 2
) -> dict[str, Any]:
    return analyze_motifs(musicxml, n=min_length, min_occurrences=min_occurrences)


def theory_explain(musicxml: str, *, measure_start: int, measure_end: int) -> dict[str, Any]:
    """Pillar-8 Theory Tutor — Roman-numeral + voice-leading + cadence digest for a region.

    The frontend's Theory Tutor Panel issues this. We compose the existing
    analyzers; nothing fancier yet (the agent can elaborate from the
    structured output in its reply).
    """
    progression = analyze_progression(musicxml)
    cadences = analyze_cadences(musicxml)
    voice_leading = analyze_voice_leading(musicxml)
    chords_in_region = [
        c for c in progression["chords"] if measure_start <= c["measure"] <= measure_end
    ]
    cadences_in_region = [
        c for c in cadences["cadences"] if measure_start <= c["measure"] <= measure_end
    ]
    return {
        "key": progression["key"],
        "chords": chords_in_region,
        "cadences": cadences_in_region,
        "voice_leading": [
            {
                "voices": p["voices"],
                "intervals": [
                    i for i in p["intervals"] if measure_start <= i["measure"] <= measure_end
                ],
            }
            for p in voice_leading["pairs"]
        ],
        "region": {"measure_start": measure_start, "measure_end": measure_end},
    }


# ──────────────────────────────────────────────────────────────────────
# Score-mutating tools — return ScoreDiff
# ──────────────────────────────────────────────────────────────────────


def score_transpose(musicxml: str, *, target_key: str) -> ScoreDiff:
    result = _transpose(musicxml, target_key)
    next_xml = result["musicxml"]
    op = build_replace_op(
        kind="score_transpose",
        description=(
            f"Transposed from {result['source_key']} to {result['target_key']} "
            f"({result['interval']})"
        ),
        previous_musicxml=musicxml,
        next_musicxml=next_xml,
        metadata={
            "from_key": result["source_key"],
            "to_key": result["target_key"],
            "interval": result["interval"],
        },
    )
    warnings = _range_warnings_to_diagnostics(result.get("warnings", []))
    voice_leading = validate_voice_leading(next_xml)
    for v in voice_leading.get("violations", []):
        warnings.append(
            TheoryWarning(
                kind=v["kind"],
                detail=(
                    f"{v['kind'].replace('_', ' ').title()} between "
                    f"{v['voices'][0]} and {v['voices'][1]}"
                ),
                measure=v.get("from_measure"),
            )
        )
    return ScoreDiff.build(
        tool="score.transpose",
        base_musicxml=musicxml,
        preview_musicxml=next_xml,
        description=op.description,
        operations=[op],
        warnings=warnings,
    )


def score_modulate(
    musicxml: str,
    *,
    target_key: str,
    method: str,
    at_bar: int,
) -> ScoreDiff:
    """Modulate to a new key starting at `at_bar`.

    M1.4 implementation: this is essentially ``transpose_region`` from
    ``at_bar`` through the end of the score; the LLM is responsible for
    picking the method (pivot-chord, common-tone, direct, chromatic-
    mediant). The voice-leading + range validators flag anything
    questionable. A more sophisticated chord-substitution layer is
    deferred to Phase 2 (see ``docs/parking-lot.md``).
    """
    # Estimate end of score by parsing measure count from analyzer payload.
    progression = analyze_progression(musicxml)
    last_measure = progression["chords"][-1]["measure"] if progression["chords"] else at_bar + 8
    result = _transpose_region(
        musicxml,
        target_key=target_key,
        interval_name=None,
        measure_start=at_bar,
        measure_end=int(last_measure),
    )
    next_xml = result["musicxml"]
    op = build_replace_op(
        kind="score_modulate",
        description=(
            f"Modulated to {result['target_key']} at bar {at_bar} via {method} "
            f"({result['interval']})"
        ),
        previous_musicxml=musicxml,
        next_musicxml=next_xml,
        metadata={
            "method": method,
            "at_bar": at_bar,
            "target_key": result["target_key"],
            "interval": result["interval"],
        },
    )
    warnings = _range_warnings_to_diagnostics(result.get("warnings", []))
    return ScoreDiff.build(
        tool="score.modulate",
        base_musicxml=musicxml,
        preview_musicxml=next_xml,
        description=op.description,
        operations=[op],
        warnings=warnings,
    )


def _get_chord_substitutions(
    progression: dict[str, Any],
    key_info: dict[str, Any],
    measure_start: int,
    measure_end: int,
    style: str | None,
) -> list[dict[str, Any]]:
    """Ask Claude for chord substitutions in the given range.

    Returns a list of {measure, beat, new_roman, reason} dicts.
    Falls back to an empty list if the API key is missing or the model
    returns unparseable output.
    """
    settings = get_settings()
    if not settings.anthropic_api_key:
        return []

    chords_in_range = [
        c
        for c in progression.get("chords", [])
        if measure_start <= c["measure"] <= measure_end
    ]
    if not chords_in_range:
        return []

    chord_list = "; ".join(
        f"m{c['measure']}b{float(c['beat']):.1f}:{c['roman']}" for c in chords_in_range
    )
    k_label = f"{key_info.get('tonic', 'C')} {key_info.get('mode', 'major')}"
    style_hint = f"Style: {style}. " if style else ""

    prompt = (
        f"Reharmonize this progression in {k_label}.\n"
        f"{style_hint}"
        f"Current chords: {chord_list}\n\n"
        "Return ONLY a JSON array — no prose, no fences — where each element is:\n"
        '  {"measure": <int>, "beat": <float>, "new_roman": "<roman numeral>", '
        '"reason": "<one sentence>"}\n\n'
        "Use secondary dominants, borrowed chords, or modal interchange as appropriate. "
        "Preserve tonal coherence."
    )

    client = Anthropic(api_key=settings.anthropic_api_key)
    try:
        resp = client.messages.create(
            model=settings.anthropic_model,
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = "".join(getattr(b, "text", "") for b in resp.content)
        m = re.search(r"\[.*?\]", raw, re.DOTALL)
        if m:
            return json.loads(m.group())
    except Exception as exc:  # noqa: BLE001
        logger.warning("score_reharmonize: Claude substitution failed: %s", exc)
    return []


def _apply_chord_substitutions(
    score: m21stream.Score,
    substitutions: list[dict[str, Any]],
    key_info: dict[str, Any],
    measure_start: int,
    measure_end: int,
) -> m21stream.Score:
    """Apply chord substitutions to inner voices, preserving the top melody note.

    Strategy (Phase 2):
    - Top staff, top note of each beat → preserved as melody
    - Other notes in the chord at that beat → replaced with voicings of the
      new Roman numeral, keeping the bass below the melody
    """
    k = m21key.Key(key_info.get("tonic", "C"), key_info.get("mode", "major"))
    sub_map: dict[tuple[int, float], str] = {
        (int(s["measure"]), round(float(s["beat"]), 1)): s["new_roman"]
        for s in substitutions
    }
    if not sub_map:
        return score

    new_score = copy.deepcopy(score)
    parts = list(new_score.parts) if new_score.parts else [new_score]

    for part in parts:
        for measure in part.getElementsByClass("Measure"):
            mnum = int(measure.number)
            if not (measure_start <= mnum <= measure_end):
                continue
            for el in list(measure.notes):
                beat_key = (mnum, round(float(el.beat), 1))
                new_roman_str = sub_map.get(beat_key)
                if new_roman_str is None:
                    continue
                # Only substitute if this is a chord (inner voices)
                if not el.isChord:
                    continue
                try:
                    rn = m21roman.RomanNumeral(new_roman_str, k)
                    new_pitches = list(rn.pitches)
                    if not new_pitches:
                        continue
                    # Keep the original top pitch; replace remaining with new chord tones
                    sorted_orig = el.sortDiatonicAscending().pitches
                    top_pitch = sorted_orig[-1] if sorted_orig else None
                    if top_pitch is not None:
                        # Place new pitches relative to the original register
                        voiced = [p for p in new_pitches if p.midi <= top_pitch.midi]
                        if not voiced:
                            voiced = new_pitches
                        el.pitches = tuple([*voiced, top_pitch])
                    else:
                        el.pitches = tuple(new_pitches)
                except Exception as exc:  # noqa: BLE001
                    logger.debug("reharmonize: skipping %s: %s", new_roman_str, exc)

    return new_score


def score_reharmonize(
    musicxml: str,
    *,
    measure_start: int,
    measure_end: int,
    style: str | None = None,
) -> ScoreDiff:
    """Phase-2 reharmonization — Claude-assisted chord substitution.

    Asks Claude for idiomatic chord substitutions (secondary dominants,
    borrowed chords, modal interchange), then applies them to the inner
    voices while preserving the melody.  Falls back gracefully when the
    API key is absent.
    """
    progression = analyze_progression(musicxml)
    key_info = analyze_key(musicxml)

    substitutions = _get_chord_substitutions(
        progression, key_info, measure_start, measure_end, style
    )

    if substitutions:
        score = parse_score(musicxml)
        new_score = _apply_chord_substitutions(
            score, substitutions, key_info, measure_start, measure_end
        )
        next_xml = serialise_score(new_score)
        description = (
            f"Reharmonize bars {measure_start}–{measure_end}"
            + (f" ({style} style)" if style else "")
            + f": {len(substitutions)} chord substitution(s)"
        )
    else:
        next_xml = musicxml
        description = (
            f"Reharmonize bars {measure_start}–{measure_end}"
            + (f" in {style} style" if style else "")
            + " — no substitutions generated"
        )

    op = build_replace_op(
        kind="score_reharmonize",
        description=description,
        previous_musicxml=musicxml,
        next_musicxml=next_xml,
        metadata={
            "measure_start": measure_start,
            "measure_end": measure_end,
            "style": style,
            "substitutions": substitutions,
        },
    )
    warnings: list[TheoryWarning] = []
    if not substitutions:
        warnings.append(
            TheoryWarning(
                kind="no_substitutions",
                detail=(
                    "Claude produced no substitutions for this range — "
                    "the score is unchanged. Try a different style hint or range."
                ),
            )
        )
    return ScoreDiff.build(
        tool="score.reharmonize",
        base_musicxml=musicxml,
        preview_musicxml=next_xml,
        description=description,
        operations=[op],
        warnings=warnings,
    )


def score_add_section(musicxml: str, *, plan: dict[str, Any]) -> ScoreDiff:
    """Phase-2 first-draft section generator (Pillar 4).

    Uses Claude + music21 to generate a new musical section from the
    plan description, then appends it to the existing score.  Requires
    ANTHROPIC_API_KEY; falls back gracefully with a warning if absent.

    Plan keys (all optional):
      - description: free-text description of the section
      - key:         target key (e.g. "F minor")
      - bars:        number of measures
      - style:       style hint (e.g. "lyrical", "dramatic")
      - texture:     instrumentation hint
    """
    prompt = plan.get("description") or "a continuation in the same style"
    constraints = {k: plan[k] for k in ("key", "bars", "style", "texture") if k in plan}

    try:
        result = _generate_score(prompt, constraints)
        new_section_xml = result["musicxml"]
        description = f"Add section: {result['description']}"

        # Concatenate the new section to the current score using music21
        from stockhausen_theory.score_io import parse_score as _parse, serialise_score as _ser
        from music21 import stream as _stream

        base = _parse(musicxml)
        addition = _parse(new_section_xml)

        combined = _stream.Score()
        combined.metadata = base.metadata

        base_parts = list(base.parts) if base.parts else [base]
        add_parts = list(addition.parts) if addition.parts else [addition]

        for i, base_part in enumerate(base_parts):
            new_part = copy.deepcopy(base_part)
            if i < len(add_parts):
                add_part = add_parts[i]
                for measure in add_part.getElementsByClass("Measure"):
                    new_part.append(copy.deepcopy(measure))
            combined.append(new_part)

        next_xml = _ser(combined)
        warnings: list[TheoryWarning] = []

    except RuntimeError as exc:
        next_xml = musicxml
        description = f"Add section: {prompt} — generation failed"
        warnings = [
            TheoryWarning(
                kind="generation_failed",
                detail=str(exc)[:300],
            )
        ]

    op = build_replace_op(
        kind="score_add_section",
        description=description,
        previous_musicxml=musicxml,
        next_musicxml=next_xml,
        metadata={"plan": plan},
    )
    return ScoreDiff.build(
        tool="score.add_section",
        base_musicxml=musicxml,
        preview_musicxml=next_xml,
        description=description,
        operations=[op],
        warnings=warnings,
    )


def score_respell_enharmonic(musicxml: str) -> ScoreDiff:
    """Stub for enharmonic respelling — returns the score unchanged for now."""
    op = build_replace_op(
        kind="score_respell_enharmonic",
        description="Respell enharmonic equivalents",
        previous_musicxml=musicxml,
        next_musicxml=musicxml,
    )
    return ScoreDiff.build(
        tool="score.respell_enharmonic",
        base_musicxml=musicxml,
        preview_musicxml=musicxml,
        description=op.description,
        operations=[op],
        warnings=[],
    )


def score_replace_bars(musicxml: str, *, new_musicxml: str) -> ScoreDiff:
    """Manual splice — used when the maintainer pastes a new passage.

    For Phase 1 we accept a whole MusicXML on both sides; the agent uses
    this when responding to *"replace these bars with what I just typed"*.
    """
    op = build_replace_op(
        kind="score_replace_bars",
        description="Manual bar replacement",
        previous_musicxml=musicxml,
        next_musicxml=new_musicxml,
    )
    warnings = _range_warnings_to_diagnostics(validate_range(new_musicxml).get("warnings", []))
    voicing = validate_voicing(new_musicxml)
    for v in voicing.get("warnings", []):
        warnings.append(
            TheoryWarning(
                kind=v["kind"],
                detail=(
                    f"{v['voices'][0]}–{v['voices'][1]} spaced "
                    f"{v['semitones']} semitones apart at measure {v['measure']} beat {v['beat']}."
                ),
                measure=v.get("measure"),
                beat=v.get("beat"),
            )
        )
    rhythm = validate_rhythm(new_musicxml)
    for w in rhythm.get("warnings", []):
        warnings.append(
            TheoryWarning(
                kind=w["kind"],
                detail=(
                    f"Measure {w['measure']} in part {w['part_index']} sums to "
                    f"{w['actual_quarters']} quarters; expected {w['expected_quarters']}."
                ),
                measure=w.get("measure"),
            )
        )
    return ScoreDiff.build(
        tool="score.replace_bars",
        base_musicxml=musicxml,
        preview_musicxml=new_musicxml,
        description=op.description,
        operations=[op],
        warnings=warnings,
    )


# ──────────────────────────────────────────────────────────────────────
# Orchestration tools
# ──────────────────────────────────────────────────────────────────────


def orchestration_change_instrument(
    musicxml: str,
    *,
    part_index: int,
    new_instrument: str,
) -> ScoreDiff:
    """Change the instrument name of a single part (metadata only)."""
    score = parse_score(musicxml)
    parts = list(score.parts) if score.parts else [score]
    if part_index < 0 or part_index >= len(parts):
        raise ValueError(
            f"part_index {part_index} out of range (score has {len(parts)} parts)"
        )
    new_score = copy.deepcopy(score)
    new_parts = list(new_score.parts) if new_score.parts else [new_score]
    old_name = new_parts[part_index].partName or f"Part {part_index}"
    new_parts[part_index].partName = new_instrument
    next_xml = serialise_score(new_score)
    op = build_replace_op(
        kind="score_change_instrument",
        description=f"Change part {part_index} instrument from '{old_name}' to '{new_instrument}'",
        previous_musicxml=musicxml,
        next_musicxml=next_xml,
        metadata={"part_index": part_index, "old_instrument": old_name, "new_instrument": new_instrument},
    )
    return ScoreDiff.build(
        tool="orchestration.change_instrument",
        base_musicxml=musicxml,
        preview_musicxml=next_xml,
        description=op.description,
        operations=[op],
        warnings=[],
    )


def orchestration_add_part(musicxml: str, *, instrument_name: str) -> ScoreDiff:
    """Append a new empty Part with the given instrument name."""
    score = parse_score(musicxml)
    new_score = copy.deepcopy(score)
    new_part = m21stream.Part()
    new_part.partName = instrument_name
    new_score.append(new_part)  # type: ignore[no-untyped-call]
    next_xml = serialise_score(new_score)
    op = build_replace_op(
        kind="score_add_part",
        description=f"Add new part '{instrument_name}'",
        previous_musicxml=musicxml,
        next_musicxml=next_xml,
        metadata={"instrument_name": instrument_name},
    )
    return ScoreDiff.build(
        tool="orchestration.add_part",
        base_musicxml=musicxml,
        preview_musicxml=next_xml,
        description=op.description,
        operations=[op],
        warnings=[],
    )


def orchestration_remove_part(musicxml: str, *, part_index: int) -> ScoreDiff:
    """Remove a part by index."""
    score = parse_score(musicxml)
    parts = list(score.parts) if score.parts else [score]
    if part_index < 0 or part_index >= len(parts):
        raise ValueError(
            f"part_index {part_index} out of range (score has {len(parts)} parts)"
        )
    removed_name = parts[part_index].partName or f"Part {part_index}"
    new_score = copy.deepcopy(score)
    new_parts = list(new_score.parts) if new_score.parts else [new_score]
    new_score.remove(new_parts[part_index])  # type: ignore[no-untyped-call]
    next_xml = serialise_score(new_score)
    op = build_replace_op(
        kind="score_remove_part",
        description=f"Remove part {part_index} ('{removed_name}')",
        previous_musicxml=musicxml,
        next_musicxml=next_xml,
        metadata={"part_index": part_index, "removed_part_name": removed_name},
    )
    return ScoreDiff.build(
        tool="orchestration.remove_part",
        base_musicxml=musicxml,
        preview_musicxml=next_xml,
        description=op.description,
        operations=[op],
        warnings=[],
    )


def orchestration_set_profile(musicxml: str, *, profile_id: str) -> ScoreDiff:
    """Apply an orchestration profile; returns a ScoreDiff with the rescored MusicXML."""
    result = _apply_profile(musicxml, profile_id)
    next_xml = result["musicxml"]
    raw_warnings = result.get("warnings", [])
    diff_warnings = [
        TheoryWarning(
            kind=w.get("kind", "range"),
            detail=(
                f"{w.get('pitch', '?')} in slot '{w.get('slot_name', '?')}' "
                f"({w.get('kind', '?').replace('_', ' ')} the practical range "
                f"for {w.get('instrument', 'this instrument')})"
            ),
            measure=w.get("measure"),
        )
        for w in raw_warnings
    ]
    op = build_replace_op(
        kind="score_set_profile",
        description=f"Apply orchestration profile '{profile_id}'",
        previous_musicxml=musicxml,
        next_musicxml=next_xml,
        metadata={"profile_id": profile_id, "assignment": result.get("assignment", [])},
    )
    op.forward["profile_id"] = profile_id
    return ScoreDiff.build(
        tool="orchestration.set_profile",
        base_musicxml=musicxml,
        preview_musicxml=next_xml,
        description=op.description,
        operations=[op],
        warnings=diff_warnings,
    )


# ──────────────────────────────────────────────────────────────────────
# Audio tools (stubs)
# ──────────────────────────────────────────────────────────────────────


def audio_stem_separate(audio_file_path: str) -> dict[str, Any]:
    """Stub: requires Demucs v4 on Modal GPU."""
    return {
        "stub": True,
        "reason": "Requires Demucs v4 on Modal GPU. Deploy backend/modal/demucs.py first.",
        "stems": [],
    }


def audio_transcribe(audio_file_path: str, instruments: list[str] | None = None) -> dict[str, Any]:
    """Stub: requires YourMT3+ on Modal GPU."""
    return {
        "stub": True,
        "reason": "Requires YourMT3+ on Modal GPU.",
        "musicxml": None,
    }


def score_import_audio(audio_file_path: str) -> dict[str, Any]:
    """Stub: combines stem_separate + transcribe — requires Modal GPU services."""
    return {
        "stub": True,
        "reason": "Requires Demucs v4 + YourMT3+ on Modal GPU.",
    }


# ──────────────────────────────────────────────────────────────────────
# Score export tool
# ──────────────────────────────────────────────────────────────────────


def score_export(musicxml: str, *, format: str) -> dict[str, Any]:
    """Return export metadata; actual file download is handled by the frontend ExportDialog."""
    allowed = {"musicxml", "midi", "wav", "pdf"}
    if format not in allowed:
        raise ValueError(f"format must be one of {sorted(allowed)}, got '{format}'")
    return {
        "format": format,
        "ready": True,
        "note": "Use the frontend ExportDialog for actual file download.",
    }


# ──────────────────────────────────────────────────────────────────────
# Additional theory tools
# ──────────────────────────────────────────────────────────────────────


def theory_analyze_motivic_relations(musicxml: str) -> dict[str, Any]:
    """Analyze motivic relations using analyze_motifs(n=3, min_occurrences=2)."""
    return analyze_motifs(musicxml, n=3, min_occurrences=2)


def theory_suggest_modulation(
    musicxml: str, *, target_style: str | None = None
) -> dict[str, Any]:
    """Suggest 3 modulation targets based on the current key."""
    key_info = analyze_key(musicxml)
    tonic = key_info.get("tonic", "C")
    mode = key_info.get("mode", "major")

    # Build suggestions: relative, subdominant, dominant
    try:
        k = m21key.Key(tonic, mode)
        relative = k.relative
        subdominant = m21key.Key(k.pitchFromDegree(4).name, mode)
        dominant = m21key.Key(k.pitchFromDegree(5).name, mode)
        suggestions = [
            {
                "to_key": f"{relative.tonic.name} {relative.mode}",
                "relationship": "relative",
                "roman_numeral": "vi" if mode == "major" else "III",
            },
            {
                "to_key": f"{subdominant.tonic.name} {subdominant.mode}",
                "relationship": "subdominant",
                "roman_numeral": "IV",
            },
            {
                "to_key": f"{dominant.tonic.name} {dominant.mode}",
                "relationship": "dominant",
                "roman_numeral": "V",
            },
        ]
    except Exception as exc:  # noqa: BLE001
        logger.warning("theory_suggest_modulation: key resolution failed: %s", exc)
        suggestions = []

    result: dict[str, Any] = {
        "current_key": f"{tonic} {mode}",
        "suggestions": suggestions,
    }
    if target_style:
        result["target_style"] = target_style
    return result


def theory_check_orchestration(musicxml: str, *, profile_id: str) -> dict[str, Any]:
    """Check range warnings for a score against a given orchestration profile."""
    result = _apply_profile(musicxml, profile_id)
    raw_warnings = result.get("warnings", [])
    return {
        "profile": profile_id,
        "range_warnings": raw_warnings,
        "warning_count": len(raw_warnings),
    }


# ──────────────────────────────────────────────────────────────────────
# Playback tools (frontend-delegate; no score mutation except set_tempo)
# ──────────────────────────────────────────────────────────────────────


def playback_play_from(bar_number: int) -> dict[str, Any]:
    """Tell the frontend to seek to a bar."""
    return {
        "action": "play_from",
        "bar": bar_number,
        "note": "Frontend should call engine.seekToBar(bar_number)",
    }


def playback_loop(start_bar: int, end_bar: int) -> dict[str, Any]:
    """Tell the frontend to loop between two bars."""
    return {
        "action": "loop",
        "start_bar": start_bar,
        "end_bar": end_bar,
    }


def playback_set_tempo(musicxml: str, *, bpm: int) -> ScoreDiff:
    """Insert or replace a MetronomeMark at offset 0 and return a ScoreDiff."""
    score = parse_score(musicxml)
    new_score = copy.deepcopy(score)

    # Remove existing MetronomeMarks at offset 0 to avoid duplicates
    for elem in list(new_score.flatten().getElementsByClass(m21tempo.MetronomeMark)):
        if elem.offset == 0:
            try:
                elem.activeSite.remove(elem)  # type: ignore[union-attr]
            except Exception:  # noqa: BLE001
                pass

    mm = m21tempo.MetronomeMark(number=bpm)
    parts = list(new_score.parts) if new_score.parts else [new_score]
    if parts:
        parts[0].insert(0, mm)  # type: ignore[no-untyped-call]
    else:
        new_score.insert(0, mm)  # type: ignore[no-untyped-call]

    next_xml = serialise_score(new_score)
    op = build_replace_op(
        kind="score_set_tempo",
        description=f"Set tempo to {bpm} BPM",
        previous_musicxml=musicxml,
        next_musicxml=next_xml,
        metadata={"bpm": bpm},
    )
    return ScoreDiff.build(
        tool="playback.set_tempo",
        base_musicxml=musicxml,
        preview_musicxml=next_xml,
        description=op.description,
        operations=[op],
        warnings=[],
    )


def playback_toggle_solo(part_index: int) -> dict[str, Any]:
    """Tell the frontend to toggle solo on a part (frontend-only operation)."""
    return {
        "action": "toggle_solo",
        "part_index": part_index,
        "note": "Frontend only operation.",
    }


# ──────────────────────────────────────────────────────────────────────
# Project tools
# ──────────────────────────────────────────────────────────────────────


def project_snapshot(musicxml: str, *, name: str) -> dict[str, Any]:
    """Store a named snapshot of the current score. Returns snapshot metadata."""
    snapshot_id = str(uuid.uuid4())
    timestamp = datetime.now(tz=timezone.utc).isoformat()
    snap_dir = tempfile.mkdtemp(prefix="stockhausen_snapshot_")
    path = Path(snap_dir) / f"{snapshot_id}.json"
    snap_data: dict[str, Any] = {
        "name": name,
        "musicxml": musicxml,
        "timestamp": timestamp,
    }
    path.write_text(json.dumps(snap_data), encoding="utf-8")
    _SNAPSHOTS[snapshot_id] = {"name": name, "musicxml": musicxml, "path": str(path)}
    return {
        "snapshot_id": snapshot_id,
        "name": name,
        "path": str(path),
    }


def project_revert(snapshot_id: str) -> ScoreDiff:
    """Revert the score to a previously stored snapshot. Returns a ScoreDiff."""
    if snapshot_id not in _SNAPSHOTS:
        raise ValueError(f"Unknown snapshot_id '{snapshot_id}'")
    snap = _SNAPSHOTS[snapshot_id]
    name = snap["name"]
    snap_xml = snap["musicxml"]
    op = build_replace_op(
        kind="score_replace",
        description=f"Revert to snapshot '{name}'",
        previous_musicxml="",  # caller should pass current XML; we don't have it here
        next_musicxml=snap_xml,
        metadata={"snapshot_id": snapshot_id, "snapshot_name": name},
    )
    return ScoreDiff.build(
        tool="project.revert",
        base_musicxml=snap_xml,
        preview_musicxml=snap_xml,
        description=f"Revert to snapshot '{name}'",
        operations=[op],
        warnings=[],
    )


# ──────────────────────────────────────────────────────────────────────
# Anthropic tool descriptors (wire-side names + JSON-schemas)
# ──────────────────────────────────────────────────────────────────────


def build_tool_descriptors() -> list[ToolParam]:
    """Return the Anthropic-compatible descriptors for the 10 Phase-1 tools."""
    return [
        ToolParam(
            name="theory_analyze_key",
            description=(
                "Estimate the key of the current score using Krumhansl-Schmuckler."
                " Returns the tonic, mode, confidence, and the top alternative keys."
            ),
            input_schema={"type": "object", "properties": {}, "required": []},
        ),
        ToolParam(
            name="theory_analyze_roman_numerals",
            description=(
                "Roman-numeral progression of the entire score. Returns a list of"
                " {measure, beat, pitches, roman, symbol} records plus a summary string."
            ),
            input_schema={"type": "object", "properties": {}, "required": []},
        ),
        ToolParam(
            name="theory_analyze_form",
            description=(
                "Phase-2 form analysis: cadence-based phrase detection and "
                "section labelling (A/B/A′). Returns key, total measures, "
                "phrase list with cadence annotations, and section groupings."
            ),
            input_schema={"type": "object", "properties": {}, "required": []},
        ),
        ToolParam(
            name="theory_identify_motifs",
            description=(
                "Find recurring interval-shape motifs of length ``min_length`` that"
                " occur at least ``min_occurrences`` times."
            ),
            input_schema={
                "type": "object",
                "properties": {
                    "min_length": {"type": "integer", "minimum": 2, "maximum": 12},
                    "min_occurrences": {"type": "integer", "minimum": 2},
                },
                "required": [],
            },
        ),
        ToolParam(
            name="theory_explain",
            description=(
                "Pillar-8 Theory Tutor digest for a measure range — key, chords,"
                " cadences, and voice-leading inside the region."
            ),
            input_schema={
                "type": "object",
                "properties": {
                    "measure_start": {"type": "integer", "minimum": 1},
                    "measure_end": {"type": "integer", "minimum": 1},
                },
                "required": ["measure_start", "measure_end"],
            },
        ),
        ToolParam(
            name="score_transpose",
            description=(
                "Transpose the entire score to ``target_key`` (e.g. 'F minor', 'Bb',"
                " 'C# minor'). Returns a ScoreDiff with range warnings."
            ),
            input_schema={
                "type": "object",
                "properties": {
                    "target_key": {"type": "string"},
                },
                "required": ["target_key"],
            },
        ),
        ToolParam(
            name="score_modulate",
            description=(
                "Modulate to ``target_key`` starting at ``at_bar``. ``method`` is one"
                " of: common-tone, pivot-chord, direct, chromatic-mediant."
            ),
            input_schema={
                "type": "object",
                "properties": {
                    "target_key": {"type": "string"},
                    "method": {
                        "type": "string",
                        "enum": [
                            "common-tone",
                            "pivot-chord",
                            "direct",
                            "chromatic-mediant",
                        ],
                    },
                    "at_bar": {"type": "integer", "minimum": 1},
                },
                "required": ["target_key", "method", "at_bar"],
            },
        ),
        ToolParam(
            name="score_reharmonize",
            description=(
                "Phase-2 reharmonization: ask Claude for chord substitutions "
                "(secondary dominants, borrowed chords, modal interchange) in "
                "the given measure range, then apply them to the inner voices "
                "while preserving the melody. Optional style hint: "
                "'secondary-dominants', 'modal', 'jazz', 'chromatic'."
            ),
            input_schema={
                "type": "object",
                "properties": {
                    "measure_start": {"type": "integer", "minimum": 1},
                    "measure_end": {"type": "integer", "minimum": 1},
                    "style": {"type": "string"},
                },
                "required": ["measure_start", "measure_end"],
            },
        ),
        ToolParam(
            name="score_add_section",
            description=(
                "Phase-2 first-draft section generator (Pillar 4): uses Claude + "
                "music21 to generate a new musical section from a plan description, "
                "then appends it to the existing score. Plan keys: description, "
                "key, bars, style, texture."
            ),
            input_schema={
                "type": "object",
                "properties": {
                    "plan": {"type": "object"},
                },
                "required": ["plan"],
            },
        ),
        ToolParam(
            name="score_replace_bars",
            description=(
                "Replace the score's content with ``new_musicxml``. Used when the"
                " maintainer types a new passage and the agent splices it in."
            ),
            input_schema={
                "type": "object",
                "properties": {
                    "new_musicxml": {"type": "string"},
                },
                "required": ["new_musicxml"],
            },
        ),
        # ── Orchestration tools ───────────────────────────────────────
        ToolParam(
            name="orchestration_change_instrument",
            description=(
                "Change the instrument name of a single part (metadata only). "
                "``part_index`` is 0-based. Returns a ScoreDiff."
            ),
            input_schema={
                "type": "object",
                "properties": {
                    "part_index": {"type": "integer", "minimum": 0},
                    "new_instrument": {"type": "string"},
                },
                "required": ["part_index", "new_instrument"],
            },
        ),
        ToolParam(
            name="orchestration_add_part",
            description="Append a new empty Part with the given instrument name. Returns a ScoreDiff.",
            input_schema={
                "type": "object",
                "properties": {
                    "instrument_name": {"type": "string"},
                },
                "required": ["instrument_name"],
            },
        ),
        ToolParam(
            name="orchestration_remove_part",
            description="Remove a part by 0-based index. Returns a ScoreDiff.",
            input_schema={
                "type": "object",
                "properties": {
                    "part_index": {"type": "integer", "minimum": 0},
                },
                "required": ["part_index"],
            },
        ),
        ToolParam(
            name="orchestration_set_profile",
            description=(
                "Apply a named orchestration profile to the score, reassigning parts to "
                "the profile's slots. Returns a ScoreDiff with the rescored MusicXML. "
                "Known profiles: string_quartet, woodwind_quintet, piano_reduction, "
                "brass_quartet, vocal_satb, piano_trio, western_orchestra, jazz_combo, "
                "hard_rock_band, world_ensemble."
            ),
            input_schema={
                "type": "object",
                "properties": {
                    "profile_id": {"type": "string"},
                },
                "required": ["profile_id"],
            },
        ),
        # ── Audio tools (stubs) ────────────────────────────────────────
        ToolParam(
            name="audio_stem_separate",
            description=(
                "Separate an audio file into stems (vocals, bass, drums, other). "
                "STUB — requires Demucs v4 on Modal GPU. Returns structured stub info."
            ),
            input_schema={
                "type": "object",
                "properties": {
                    "audio_file_path": {"type": "string"},
                },
                "required": ["audio_file_path"],
            },
        ),
        ToolParam(
            name="audio_transcribe",
            description=(
                "Transcribe an audio file to MusicXML. "
                "STUB — requires YourMT3+ on Modal GPU."
            ),
            input_schema={
                "type": "object",
                "properties": {
                    "audio_file_path": {"type": "string"},
                    "instruments": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Optional list of instruments to focus on.",
                    },
                },
                "required": ["audio_file_path"],
            },
        ),
        ToolParam(
            name="score_import_audio",
            description=(
                "Import an audio file by running stem separation + transcription. "
                "STUB — requires Demucs v4 + YourMT3+ on Modal GPU."
            ),
            input_schema={
                "type": "object",
                "properties": {
                    "audio_file_path": {"type": "string"},
                },
                "required": ["audio_file_path"],
            },
        ),
        # ── Score export ──────────────────────────────────────────────
        ToolParam(
            name="score_export",
            description=(
                "Export the score in the given format. ``format`` must be one of: "
                "musicxml, midi, wav, pdf. Returns export metadata; actual download "
                "is handled by the frontend ExportDialog."
            ),
            input_schema={
                "type": "object",
                "properties": {
                    "format": {
                        "type": "string",
                        "enum": ["musicxml", "midi", "wav", "pdf"],
                    },
                },
                "required": ["format"],
            },
        ),
        # ── Additional theory tools ────────────────────────────────────
        ToolParam(
            name="theory_analyze_motivic_relations",
            description=(
                "Analyze motivic relations: finds recurring interval-shape motifs of "
                "length 3 with at least 2 occurrences. Returns the same payload as "
                "theory_identify_motifs."
            ),
            input_schema={"type": "object", "properties": {}, "required": []},
        ),
        ToolParam(
            name="theory_suggest_modulation",
            description=(
                "Suggest 3 common modulation targets from the current key: "
                "relative major/minor, subdominant, and dominant. "
                "Optional ``target_style`` hint (e.g. 'jazz', 'romantic')."
            ),
            input_schema={
                "type": "object",
                "properties": {
                    "target_style": {"type": "string"},
                },
                "required": [],
            },
        ),
        ToolParam(
            name="theory_check_orchestration",
            description=(
                "Check range warnings for the current score against a named "
                "orchestration profile. Returns {profile, range_warnings, warning_count}."
            ),
            input_schema={
                "type": "object",
                "properties": {
                    "profile_id": {"type": "string"},
                },
                "required": ["profile_id"],
            },
        ),
        # ── Playback tools ────────────────────────────────────────────
        ToolParam(
            name="playback_play_from",
            description="Tell the frontend engine to seek to a bar number and begin playback.",
            input_schema={
                "type": "object",
                "properties": {
                    "bar_number": {"type": "integer", "minimum": 1},
                },
                "required": ["bar_number"],
            },
        ),
        ToolParam(
            name="playback_loop",
            description="Tell the frontend engine to loop between start_bar and end_bar.",
            input_schema={
                "type": "object",
                "properties": {
                    "start_bar": {"type": "integer", "minimum": 1},
                    "end_bar": {"type": "integer", "minimum": 1},
                },
                "required": ["start_bar", "end_bar"],
            },
        ),
        ToolParam(
            name="playback_set_tempo",
            description=(
                "Set the tempo by inserting a MetronomeMark at offset 0. "
                "Returns a ScoreDiff with the updated score."
            ),
            input_schema={
                "type": "object",
                "properties": {
                    "bpm": {"type": "integer", "minimum": 20, "maximum": 400},
                },
                "required": ["bpm"],
            },
        ),
        ToolParam(
            name="playback_toggle_solo",
            description=(
                "Toggle solo on a part (frontend-only operation). "
                "Returns an action descriptor for the frontend."
            ),
            input_schema={
                "type": "object",
                "properties": {
                    "part_index": {"type": "integer", "minimum": 0},
                },
                "required": ["part_index"],
            },
        ),
        # ── Project tools ─────────────────────────────────────────────
        ToolParam(
            name="project_snapshot",
            description=(
                "Create a named snapshot of the current score. Returns "
                "{snapshot_id, name, path}. Use project_revert to restore."
            ),
            input_schema={
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                },
                "required": ["name"],
            },
        ),
        ToolParam(
            name="project_revert",
            description=(
                "Revert the score to a previously created snapshot. "
                "Returns a ScoreDiff wrapping the snapshot's MusicXML."
            ),
            input_schema={
                "type": "object",
                "properties": {
                    "snapshot_id": {"type": "string"},
                },
                "required": ["snapshot_id"],
            },
        ),
        # ── Guitar tools ──────────────────────────────────────────────
        ToolParam(
            name="guitar_add_techniques",
            description=(
                "Add extended guitar technique markings (MusicXML <technical> and "
                "<articulations>) to specific notes. Supported types: harmonic, golpe, "
                "lh_finger, rh_finger, string, barre, slur, snap_pizz, tonal, tremolo. "
                "Pass a list of technique dicts, each with 'type' + relevant fields. "
                "Returns a ScoreDiff."
            ),
            input_schema={
                "type": "object",
                "properties": {
                    "techniques": {
                        "type": "array",
                        "items": {"type": "object"},
                        "description": (
                            "List of technique annotations. Each item: "
                            "{type: str, measure: int, beat: float, ...extra}. "
                            "E.g. {type:'harmonic',measure:3,beat:1.0,harmonic_type:'artificial',node_fret:12}"
                        ),
                    },
                },
                "required": ["techniques"],
            },
        ),
        ToolParam(
            name="guitar_validate_voicing",
            description=(
                "Check whether the score's chords are physically playable on a six-string "
                "classical guitar (standard tuning EADGBe). Returns {playable, warnings} "
                "with kinds: stretch_exceeded, too_many_strings, out_of_range, wide_chord."
            ),
            input_schema={"type": "object", "properties": {}, "required": []},
        ),
        ToolParam(
            name="guitar_generate_variation",
            description=(
                "Generate a guitar variation for one of the 8 movements of "
                "'Variaciones sobre un tema de Chan Cil', appending it to the current score. "
                "style_id must be one of the ids returned by guitar_list_styles. "
                "Returns a ScoreDiff with the extended score."
            ),
            input_schema={
                "type": "object",
                "properties": {
                    "style_id": {
                        "type": "string",
                        "enum": [
                            "chan_cil_tema",
                            "var1_tarrega",
                            "var2_brouwer",
                            "var3_ponce",
                            "var4_dyens",
                            "var5_sor",
                            "var6_sinfonico",
                            "coda_memoria",
                        ],
                    },
                    "base_measures": {
                        "type": "integer",
                        "minimum": 4,
                        "maximum": 64,
                        "description": "Number of measures to generate (default 16).",
                    },
                },
                "required": ["style_id"],
            },
        ),
        ToolParam(
            name="guitar_list_styles",
            description=(
                "List all available movement styles for "
                "'Variaciones sobre un tema de Chan Cil'. "
                "Returns id, display_name, movement number, and character for each."
            ),
            input_schema={"type": "object", "properties": {}, "required": []},
        ),
        ToolParam(
            name="score_vary_motif",
            description=(
                "Apply a classical motivic transformation to a region of the score. "
                "transformation: 'augmentation' (doubles durations), 'diminution' (halves), "
                "'inversion' (mirror pitch contour), 'retrograde' (reverse note order), "
                "'sequence' (transpose the pattern by interval_semitones). "
                "Returns a ScoreDiff."
            ),
            input_schema={
                "type": "object",
                "properties": {
                    "measure_start": {"type": "integer", "minimum": 1},
                    "measure_end": {"type": "integer", "minimum": 1},
                    "transformation": {
                        "type": "string",
                        "enum": [
                            "augmentation",
                            "diminution",
                            "inversion",
                            "retrograde",
                            "retrograde_inversion",
                            "sequence",
                        ],
                    },
                    "interval_semitones": {
                        "type": "integer",
                        "description": "Semitones to shift for 'sequence' transformation.",
                    },
                },
                "required": ["measure_start", "measure_end", "transformation"],
            },
        ),
    ]


# ──────────────────────────────────────────────────────────────────────
# Dispatch
# ──────────────────────────────────────────────────────────────────────


def dispatch_tool(  # noqa: PLR0911 — flat dispatch table is clearer than a registry
    name: str,
    arguments: dict[str, Any],
    score_musicxml: str | None,
) -> tuple[Any, ScoreDiff | None]:
    """Invoke a tool by its wire name. Returns ``(payload, diff_or_none)``.

    ``payload`` is the JSON-serialisable output for the LLM round-trip;
    when the tool mutates the score we also return the structured
    ScoreDiff so the route can surface it to the UI.
    """
    if score_musicxml is None:
        raise ValueError("This tool needs a score loaded in the project.")

    if name == "theory_analyze_key":
        return theory_analyze_key(score_musicxml), None
    if name == "theory_analyze_roman_numerals":
        return theory_analyze_roman_numerals(score_musicxml), None
    if name == "theory_analyze_form":
        return theory_analyze_form(score_musicxml), None
    if name == "theory_identify_motifs":
        return (
            theory_identify_motifs(
                score_musicxml,
                min_length=int(arguments.get("min_length", 4)),
                min_occurrences=int(arguments.get("min_occurrences", 2)),
            ),
            None,
        )
    if name == "theory_explain":
        return (
            theory_explain(
                score_musicxml,
                measure_start=int(arguments["measure_start"]),
                measure_end=int(arguments["measure_end"]),
            ),
            None,
        )

    if name == "score_transpose":
        diff = score_transpose(score_musicxml, target_key=str(arguments["target_key"]))
        return diff.model_dump(mode="json"), diff
    if name == "score_modulate":
        diff = score_modulate(
            score_musicxml,
            target_key=str(arguments["target_key"]),
            method=str(arguments["method"]),
            at_bar=int(arguments["at_bar"]),
        )
        return diff.model_dump(mode="json"), diff
    if name == "score_reharmonize":
        diff = score_reharmonize(
            score_musicxml,
            measure_start=int(arguments["measure_start"]),
            measure_end=int(arguments["measure_end"]),
            style=arguments.get("style"),
        )
        return diff.model_dump(mode="json"), diff
    if name == "score_add_section":
        diff = score_add_section(score_musicxml, plan=dict(arguments.get("plan", {})))
        return diff.model_dump(mode="json"), diff
    if name == "score_replace_bars":
        diff = score_replace_bars(
            score_musicxml,
            new_musicxml=str(arguments["new_musicxml"]),
        )
        return diff.model_dump(mode="json"), diff

    # ── Orchestration tools ───────────────────────────────────────────
    if name == "orchestration_change_instrument":
        diff = orchestration_change_instrument(
            score_musicxml,
            part_index=int(arguments["part_index"]),
            new_instrument=str(arguments["new_instrument"]),
        )
        return diff.model_dump(mode="json"), diff
    if name == "orchestration_add_part":
        diff = orchestration_add_part(
            score_musicxml,
            instrument_name=str(arguments["instrument_name"]),
        )
        return diff.model_dump(mode="json"), diff
    if name == "orchestration_remove_part":
        diff = orchestration_remove_part(
            score_musicxml,
            part_index=int(arguments["part_index"]),
        )
        return diff.model_dump(mode="json"), diff
    if name == "orchestration_set_profile":
        diff = orchestration_set_profile(
            score_musicxml,
            profile_id=str(arguments["profile_id"]),
        )
        return diff.model_dump(mode="json"), diff

    # ── Audio tools (stubs) ───────────────────────────────────────────
    if name == "audio_stem_separate":
        result = audio_stem_separate(str(arguments["audio_file_path"]))
        return result, None
    if name == "audio_transcribe":
        result = audio_transcribe(
            str(arguments["audio_file_path"]),
            instruments=arguments.get("instruments"),
        )
        return result, None
    if name == "score_import_audio":
        result = score_import_audio(str(arguments["audio_file_path"]))
        return result, None

    # ── Score export ──────────────────────────────────────────────────
    if name == "score_export":
        result = score_export(score_musicxml, format=str(arguments["format"]))
        return result, None

    # ── Additional theory tools ───────────────────────────────────────
    if name == "theory_analyze_motivic_relations":
        return theory_analyze_motivic_relations(score_musicxml), None
    if name == "theory_suggest_modulation":
        return theory_suggest_modulation(
            score_musicxml,
            target_style=arguments.get("target_style"),
        ), None
    if name == "theory_check_orchestration":
        return theory_check_orchestration(
            score_musicxml,
            profile_id=str(arguments["profile_id"]),
        ), None

    # ── Playback tools ────────────────────────────────────────────────
    if name == "playback_play_from":
        return playback_play_from(int(arguments["bar_number"])), None
    if name == "playback_loop":
        return playback_loop(
            int(arguments["start_bar"]),
            int(arguments["end_bar"]),
        ), None
    if name == "playback_set_tempo":
        diff = playback_set_tempo(score_musicxml, bpm=int(arguments["bpm"]))
        return diff.model_dump(mode="json"), diff
    if name == "playback_toggle_solo":
        return playback_toggle_solo(int(arguments["part_index"])), None

    # ── Project tools ─────────────────────────────────────────────────
    if name == "project_snapshot":
        result = project_snapshot(score_musicxml, name=str(arguments["name"]))
        return result, None
    if name == "project_revert":
        diff = project_revert(str(arguments["snapshot_id"]))
        return diff.model_dump(mode="json"), diff

    # ── Guitar tools ───────────────────────────────────────────────────
    if name == "guitar_add_techniques":
        diff = guitar_add_techniques(
            score_musicxml,
            techniques=list(arguments.get("techniques", [])),
        )
        return diff.model_dump(mode="json"), diff
    if name == "guitar_validate_voicing":
        return guitar_validate_voicing(score_musicxml), None
    if name == "guitar_generate_variation":
        diff = guitar_generate_variation(
            score_musicxml,
            style_id=str(arguments["style_id"]),
            base_measures=arguments.get("base_measures"),
        )
        return diff.model_dump(mode="json"), diff
    if name == "guitar_list_styles":
        return guitar_list_styles(), None
    if name == "score_vary_motif":
        diff = score_vary_motif(
            score_musicxml,
            measure_start=int(arguments["measure_start"]),
            measure_end=int(arguments["measure_end"]),
            transformation=str(arguments["transformation"]),
            interval_semitones=int(arguments.get("interval_semitones", 0)),
        )
        return diff.model_dump(mode="json"), diff

    raise ValueError(f"Unknown tool: {name}")


# ──────────────────────────────────────────────────────────────────────
# Guitar tools
# ──────────────────────────────────────────────────────────────────────


def guitar_add_techniques(
    musicxml: str,
    *,
    techniques: list[dict[str, Any]],
) -> ScoreDiff:
    """Apply a batch of extended guitar technique markings to the score.

    Each item in `techniques` must have a "type" key.  Supported types:
      harmonic  — armónico artificial / natural
      golpe     — percussive soundboard tap
      lh_finger — left-hand fingering (0=open, 1–4)
      rh_finger — right-hand PIMA fingering
      string    — string number (1–6)
      barre     — cejilla / barre chord
      slur      — ligado slur (hammer-on or pull-off)
      snap_pizz — Bartók pizzicato
      tonal     — tonal colour direction (sul pont., sul tasto, etc.)
      tremolo   — finger tremolo

    Returns a ScoreDiff so the change can be previewed and undone.
    """
    # Normalize: accept either "kind" or "type" as the dispatch key
    def _norm(t: dict[str, Any]) -> dict[str, Any]:
        if "kind" in t and "type" not in t:
            t = {**t, "type": t["kind"]}
            del t["kind"]
        return t

    normalized = [_norm(t) for t in techniques]
    next_xml = _apply_guitar_techniques(musicxml, normalized)
    count = len(normalized)
    type_summary = ", ".join(sorted({t.get("type", "?") for t in normalized}))
    description = f"Add {count} guitar technique marking(s): {type_summary}"
    op = build_replace_op(
        kind="guitar_add_techniques",
        description=description,
        previous_musicxml=musicxml,
        next_musicxml=next_xml,
        metadata={"techniques": normalized},
    )
    return ScoreDiff.build(
        tool="guitar.add_techniques",
        base_musicxml=musicxml,
        preview_musicxml=next_xml,
        description=description,
        operations=[op],
        warnings=[],
    )


def guitar_validate_voicing(musicxml: str) -> dict[str, Any]:
    """Check whether all chords in the score are playable on a standard guitar.

    Returns {playable, warnings} where warnings list issues such as:
      - stretch_exceeded: left-hand span > 4 frets
      - too_many_strings: more than 6 simultaneous notes
      - out_of_range: pitch outside E2–E6
      - wide_chord: span > minor 10th (advisory, not blocking)
    """
    return _validate_guitar_voicing(musicxml)


def guitar_generate_variation(
    musicxml: str,
    *,
    style_id: str,
    base_measures: int | None = None,
) -> ScoreDiff:
    """Generate a guitar variation for the given movement style.

    style_id must be one of the ids from guitar_list_styles.
    The generated MusicXML is APPENDED to the existing score, so you can
    call this repeatedly to build up the full piece.

    Returns a ScoreDiff with the extended score.
    """
    style = _get_guitar_style(style_id)
    if style is None:
        ids = [s["id"] for s in _list_guitar_styles()]
        raise ValueError(f"Unknown style_id {style_id!r}. Available: {ids}")

    constraints: dict[str, Any] = {
        "key": style["key"],
        "time": style["time_signature"] if style["time_signature"] != "variable" else "4/4",
        "bars": base_measures or 16,
        "style": style["display_name"],
        "texture": "solo_classical_guitar",
        "tempo_bpm": _extract_bpm(style["tempo_marking"]),
    }

    try:
        result = _generate_score(
            style["generation_prompt"],
            constraints,
            style_prompt=style["generation_prompt"],
        )
        new_section_xml = result["musicxml"]
        description = f"Generate {style['display_name']} ({style_id})"

        from stockhausen_theory.score_io import parse_score as _parse, serialise_score as _ser
        from music21 import stream as _stream

        base = _parse(musicxml)
        addition = _parse(new_section_xml)
        combined = _stream.Score()
        combined.metadata = base.metadata

        base_parts = list(base.parts) if base.parts else [base]
        add_parts = list(addition.parts) if addition.parts else [addition]
        for i, base_part in enumerate(base_parts):
            new_part = copy.deepcopy(base_part)
            if i < len(add_parts):
                for measure in add_parts[i].getElementsByClass("Measure"):
                    new_part.append(copy.deepcopy(measure))
            combined.append(new_part)

        next_xml = _ser(combined)
        warnings: list[TheoryWarning] = []

    except RuntimeError as exc:
        next_xml = musicxml
        description = f"Generate {style['display_name']} — failed"
        warnings = [TheoryWarning(kind="generation_failed", detail=str(exc)[:300])]

    op = build_replace_op(
        kind="guitar_generate_variation",
        description=description,
        previous_musicxml=musicxml,
        next_musicxml=next_xml,
        metadata={"style_id": style_id},
    )
    return ScoreDiff.build(
        tool="guitar.generate_variation",
        base_musicxml=musicxml,
        preview_musicxml=next_xml,
        description=description,
        operations=[op],
        warnings=warnings,
    )


def guitar_list_styles() -> dict[str, Any]:
    """Return all available movement styles for Variaciones sobre un tema de Chan Cil."""
    return {"styles": _list_guitar_styles()}


def score_vary_motif(
    musicxml: str,
    *,
    measure_start: int,
    measure_end: int,
    transformation: str,
    interval_semitones: int = 0,
) -> ScoreDiff:
    """Apply a classical motivic transformation to a region of the score.

    transformation: one of "augmentation" | "diminution" | "inversion" |
                    "retrograde" | "retrograde_inversion" | "sequence"

    For "sequence": interval_semitones specifies the transposition step
    (e.g. +2 = sequence up a major second).

    Returns a ScoreDiff with the transformed score.
    """
    from music21 import interval as m21interval

    score = parse_score(musicxml)
    new_score = copy.deepcopy(score)
    parts = list(new_score.parts) if new_score.parts else [new_score]

    for part in parts:
        measures = [
            m for m in part.getElementsByClass("Measure")
            if measure_start <= int(m.number) <= measure_end
        ]
        for measure in measures:
            notes = list(measure.flatten().notes)
            if transformation == "augmentation":
                for n in notes:
                    n.duration.quarterLength *= 2
            elif transformation == "diminution":
                for n in notes:
                    n.duration.quarterLength = max(0.125, n.duration.quarterLength / 2)
            elif transformation == "inversion":
                if notes:
                    first_pitch = notes[0].pitch.midi if not notes[0].isChord else notes[0].pitches[0].midi  # type: ignore
                    for n in notes:
                        if n.isChord:
                            for p in n.pitches:
                                diff = p.midi - first_pitch
                                p.midi = first_pitch - diff
                        else:
                            diff = n.pitch.midi - first_pitch  # type: ignore
                            n.pitch.midi = first_pitch - diff  # type: ignore
            elif transformation == "retrograde":
                offsets = [float(n.offset) for n in notes]
                durations = [n.duration.quarterLength for n in notes]
                pitches_list = [
                    [p.midi for p in (n.pitches if n.isChord else [n.pitch])]  # type: ignore
                    for n in notes
                ]
                for i, n in enumerate(notes):
                    src_pitches = pitches_list[-(i + 1)]
                    if n.isChord:
                        n.pitches = tuple(type(n.pitches[0])(midi=m) for m in src_pitches)
                    else:
                        n.pitch.midi = src_pitches[0]  # type: ignore
            elif transformation == "sequence":
                ivl = m21interval.Interval(interval_semitones)
                for n in notes:
                    if n.isChord:
                        n.pitches = tuple(ivl.transposePitch(p) for p in n.pitches)
                    else:
                        n.pitch = ivl.transposePitch(n.pitch)  # type: ignore

    next_xml = serialise_score(new_score)
    description = (
        f"Vary motif bars {measure_start}–{measure_end}: {transformation}"
        + (f" +{interval_semitones}st" if transformation == "sequence" and interval_semitones else "")
    )
    op = build_replace_op(
        kind="score_vary_motif",
        description=description,
        previous_musicxml=musicxml,
        next_musicxml=next_xml,
        metadata={
            "measure_start": measure_start,
            "measure_end": measure_end,
            "transformation": transformation,
            "interval_semitones": interval_semitones,
        },
    )
    warnings = _range_warnings_to_diagnostics(validate_range(next_xml).get("warnings", []))
    return ScoreDiff.build(
        tool="score.vary_motif",
        base_musicxml=musicxml,
        preview_musicxml=next_xml,
        description=description,
        operations=[op],
        warnings=warnings,
    )


def _extract_bpm(tempo_marking: str) -> int:
    """Extract a usable BPM integer from a tempo marking string like '♩ = 56–66'."""
    import re
    m = re.search(r"=\s*(\d+)", tempo_marking)
    if m:
        return int(m.group(1))
    return 72


__all__ = [
    "build_tool_descriptors",
    "dispatch_tool",
    # orchestration
    "orchestration_add_part",
    "orchestration_change_instrument",
    "orchestration_remove_part",
    "orchestration_set_profile",
    # audio
    "audio_stem_separate",
    "audio_transcribe",
    # score
    "score_add_section",
    "score_export",
    "score_import_audio",
    "score_modulate",
    "score_reharmonize",
    "score_replace_bars",
    "score_respell_enharmonic",
    "score_transpose",
    # theory
    "theory_analyze_cadences",
    "theory_analyze_key",
    "theory_analyze_motivic_relations",
    "theory_analyze_range",
    "theory_analyze_roman_numerals",
    "theory_analyze_voice_leading",
    "theory_check_orchestration",
    "theory_explain",
    "theory_identify_motifs",
    "theory_suggest_modulation",
    # playback
    "playback_loop",
    "playback_play_from",
    "playback_set_tempo",
    "playback_toggle_solo",
    # project
    "project_revert",
    "project_snapshot",
    # guitar
    "guitar_add_techniques",
    "guitar_generate_variation",
    "guitar_list_styles",
    "guitar_validate_voicing",
    "score_vary_motif",
]
