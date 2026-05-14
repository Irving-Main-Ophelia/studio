"""The 10 Phase-1 agent tools — diff-returning facades over the theory engine.

PHASE_1.md §1.6 + §1.7. Every score-mutating tool returns a ``ScoreDiff``;
every read-only tool returns its analyzer payload directly. Anthropic's
tool-name pattern (``^[a-zA-Z0-9_-]{1,64}$``) forces underscores on the
wire — the UI prettifies them back to dots.
"""

from __future__ import annotations

from typing import Any

from anthropic.types import ToolParam
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

from app.score_diff import (
    ScoreDiff,
    TheoryWarning,
    build_replace_op,
)


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
# Read-only tools — return analyzer payloads directly
# ──────────────────────────────────────────────────────────────────────


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


def score_reharmonize(
    musicxml: str,
    *,
    measure_start: int,
    measure_end: int,
    style: str | None = None,
) -> ScoreDiff:
    """Phase-1 placeholder reharmonization.

    M1.4 ships a transparent no-op-with-warning: the diff is identical to
    the source score and the description spells out that real
    chord-substitution arrives in Phase 2 (``docs/parking-lot.md``). This
    keeps the tool surface stable for the agent today; once the
    substitution layer exists we swap the body without breaking the API.
    """
    op = build_replace_op(
        kind="score_reharmonize",
        description=(
            f"Reharmonize bars {measure_start}–{measure_end}"
            + (f" in {style} style" if style else "")
            + " (Phase-1 stub — see parking lot)"
        ),
        previous_musicxml=musicxml,
        next_musicxml=musicxml,
        metadata={
            "measure_start": measure_start,
            "measure_end": measure_end,
            "style": style,
        },
    )
    return ScoreDiff.build(
        tool="score.reharmonize",
        base_musicxml=musicxml,
        preview_musicxml=musicxml,
        description=op.description,
        operations=[op],
        warnings=[
            TheoryWarning(
                kind="phase1_stub",
                detail=(
                    "Reharmonization is a Phase-1 stub — the diff is empty. "
                    "Real chord-substitution and voice-leading rewrite arrive "
                    "in Phase 2 (see docs/parking-lot.md)."
                ),
            )
        ],
    )


def score_add_section(musicxml: str, *, plan: dict[str, Any]) -> ScoreDiff:
    """Pillar-4 first-draft generation, M1.4 stub.

    The full implementation needs the Anticipatory Music Transformer
    integration described in ``docs/RESEARCH.md`` §3 and is gated on
    Modal (`scale-to-zero`) infrastructure. For now we emit a clean
    "no-op + warning" diff so the agent can still complete the tool-call
    loop without crashing. Phase 2 swaps the body for a real generator.
    """
    op = build_replace_op(
        kind="score_add_section",
        description=(
            f"Add section: {plan.get('description', 'unnamed')} "
            "(Phase-1 stub — generator integration deferred)"
        ),
        previous_musicxml=musicxml,
        next_musicxml=musicxml,
        metadata={"plan": plan},
    )
    return ScoreDiff.build(
        tool="score.add_section",
        base_musicxml=musicxml,
        preview_musicxml=musicxml,
        description=op.description,
        operations=[op],
        warnings=[
            TheoryWarning(
                kind="phase1_stub",
                detail=(
                    "score.add_section is a Phase-1 stub — the diff is empty. "
                    "Generator integration is tracked in docs/parking-lot.md."
                ),
            )
        ],
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
                "Higher-level form analysis — sections, periods, phrase groups. M1.4"
                " stub: returns a single 'undivided' section. Real analysis ships in"
                " Phase 2."
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
                "Reharmonize a measure range with optional style hint (e.g."
                " 'secondary-dominants', 'modal'). Phase-1 stub: returns an empty diff"
                " and a warning explaining the deferred work."
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
                "Pillar-4 first-draft generator. M1.4 stub — generator integration is"
                " deferred to Phase 2; today this returns an empty diff and a clear"
                " warning."
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
        return {
            "sections": [{"name": "undivided", "measure_start": 1, "measure_end": -1}],
            "stub": True,
        }, None
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

    raise ValueError(f"Unknown tool: {name}")


__all__ = [
    "build_tool_descriptors",
    "dispatch_tool",
    "score_add_section",
    "score_modulate",
    "score_reharmonize",
    "score_replace_bars",
    "score_transpose",
    "theory_analyze_cadences",
    "theory_analyze_key",
    "theory_analyze_range",
    "theory_analyze_roman_numerals",
    "theory_analyze_voice_leading",
    "theory_explain",
    "theory_identify_motifs",
]
