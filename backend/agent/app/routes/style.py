"""Composer style adapter endpoints.

GET  /style/composers      — list available style adapters
GET  /style/guitar/styles  — list guitar variation styles (Chan Cil piece)
POST /style/apply          — apply a style via Claude-based reharmonization
POST /style/guitar/apply   — apply a specific guitar variation style

The LoRA adapter approach (originally planned) is replaced here with a
Claude-based prompt-engineering approach using per-composer style rules.
Style rules are stored in guitar_styles.py (for the Chan Cil piece) and
in this file for generic composer adapters.

No GPU training required. Style is applied by:
  1. Describing the target style to Claude in precise musical terms.
  2. Asking Claude to reharmonize / rephrase the score in that style.
  3. Validating the result via the theory engine before returning.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from anthropic import Anthropic
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.config import get_settings
from app.guitar_styles import get_style as _get_guitar_style, list_styles as _list_guitar_styles
from app.score_diff import ScoreDiff, TheoryWarning, build_replace_op
from stockhausen_theory import analyze_key, analyze_progression, validate_voice_leading
from stockhausen_theory.score_io import parse_score, serialise_score

router = APIRouter(prefix="/style", tags=["style"])
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Generic composer registry (for non-guitar uses)
# ---------------------------------------------------------------------------

_GENERIC_COMPOSERS: list[dict[str, Any]] = [
    {
        "id": "rachmaninoff",
        "display_name": "Rachmaninoff",
        "instrument": "piano",
        "style_rules": (
            "Rich chromatic harmony. Sweeping melodic lines in the upper voice. "
            "Dense inner voice movement. Secondary dominants and borrowed chords abundant. "
            "Large dynamic range. Molto expressivo. Frequent use of dim7 passing chords. "
            "Extended arpeggiated chords in the bass. Melodies often doubled in octaves."
        ),
    },
    {
        "id": "debussy",
        "display_name": "Debussy",
        "instrument": "piano",
        "style_rules": (
            "Impressionist colour over function. Whole-tone scales and pentatonic passages. "
            "Parallel chord motion (planing). Avoid strong V–I cadences. "
            "7th and 9th chords treated as stable sonorities. "
            "Sparse texture, lots of silence and resonance. "
            "Dynamics mostly p and pp. Pedal tones supporting shifting harmonies above."
        ),
    },
    {
        "id": "bach",
        "display_name": "Bach",
        "instrument": "keyboard",
        "style_rules": (
            "Strict counterpoint. Each voice has independent melodic interest. "
            "Sequences everywhere: falling thirds, rising fourths. "
            "Ornaments: mordents, turns, trills on leading tones. "
            "Harmonic rhythm changes every beat or half-beat. "
            "Circle-of-fifths progressions. Deceptive cadences for extension. "
            "Avoid parallel fifths and octaves absolutely."
        ),
    },
    {
        "id": "brouwer",
        "display_name": "Leo Brouwer",
        "instrument": "guitar",
        "style_rules": (
            "Minimum cells repeated and mutated. Fibonacci-type rhythmic expansion. "
            "Extended techniques: golpes, artificial harmonics, snap pizzicato. "
            "Metric displacement and irregular meters. "
            "Registral expansion from centre outward. "
            "Silence as structural element. Avoid conventional cadences. "
            "The pitch content expands chromatically from a seed note."
        ),
    },
    {
        "id": "ponce",
        "display_name": "Manuel M. Ponce",
        "instrument": "guitar",
        "style_rules": (
            "Post-Romantic lyricism. Singing melody in the top voice. "
            "Rich inner-voice counterpoint — inner voices have melodic interest. "
            "Chromatic voice leading in the inner parts. "
            "Neapolitan chord (bII), augmented sixth chords, modal mixture. "
            "Molto rubato. Long phrase arches. Climax on a dissonant ff chord. "
            "Ends quietly, whispered. Influenced by both Romanticism and Impressionism."
        ),
    },
    {
        "id": "rimsky_korsakov",
        "display_name": "Rimsky-Korsakov",
        "instrument": "orchestra",
        "style_rules": (
            "Octatonic scale (alternating tones and semitones) for mysterious passages. "
            "Whole-tone scale for dream-like sections. "
            "Modal harmonies: Dorian, Phrygian, Lydian inflections on diatonic base. "
            "Rich orchestral colour transferred to guitar as registral layers. "
            "Chromatic mediant modulations (third relations). "
            "Rhythmic ostinatos. Strong V7–I resolution at structural moments."
        ),
    },
]


# ---------------------------------------------------------------------------
# Claude-based style application
# ---------------------------------------------------------------------------

def _apply_style_with_claude(
    musicxml: str,
    style_rules: str,
    composer_name: str,
    intensity: float,
) -> str:
    """Ask Claude to reharmonize a score according to style rules.

    Returns modified MusicXML or the original on failure.
    """
    settings = get_settings()
    if not settings.anthropic_api_key:
        return musicxml

    key_info = analyze_key(musicxml)
    progression = analyze_progression(musicxml)
    chords = progression.get("chords", [])[:16]  # first 16 chords as context

    chord_list = "; ".join(
        f"m{c['measure']}b{float(c['beat']):.1f}:{c['roman']}" for c in chords
    )
    key_label = f"{key_info.get('tonic', 'C')} {key_info.get('mode', 'major')}"
    intensity_label = f"{int(intensity * 100)}%"

    prompt = (
        f"Reharmonize this score in the style of {composer_name} (intensity: {intensity_label}).\n\n"
        f"Style rules:\n{style_rules}\n\n"
        f"Current key: {key_label}\n"
        f"Current chords (first 16): {chord_list}\n\n"
        "Return ONLY a JSON array of chord substitutions, no prose, no fences:\n"
        '[{"measure":<int>,"beat":<float>,"new_roman":"<roman numeral>","reason":"<one sentence>"}]\n\n'
        "Apply the style rules above. Substitute only as many chords as the intensity "
        f"percentage implies ({intensity_label} means change ~{int(intensity * len(chords))} chords). "
        "Preserve tonal coherence. Do not introduce parallel fifths or octaves."
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
        if not m:
            return musicxml
        substitutions = json.loads(m.group())
    except Exception as exc:  # noqa: BLE001
        logger.warning("style apply: Claude failed: %s", exc)
        return musicxml

    if not substitutions:
        return musicxml

    # Apply substitutions using the same mechanism as score_reharmonize
    from music21 import key as m21key, roman as m21roman
    import copy

    score = parse_score(musicxml)
    k = m21key.Key(key_info.get("tonic", "C"), key_info.get("mode", "major"))
    sub_map: dict[tuple[int, float], str] = {
        (int(s["measure"]), round(float(s["beat"]), 1)): s["new_roman"]
        for s in substitutions
    }
    new_score = copy.deepcopy(score)
    for part in (list(new_score.parts) if new_score.parts else [new_score]):
        for measure in part.getElementsByClass("Measure"):
            mnum = int(measure.number)
            for el in list(measure.notes):
                if not el.isChord:
                    continue
                beat_key = (mnum, round(float(el.beat), 1))
                new_roman_str = sub_map.get(beat_key)
                if new_roman_str is None:
                    continue
                try:
                    rn = m21roman.RomanNumeral(new_roman_str, k)
                    new_pitches = list(rn.pitches)
                    if not new_pitches:
                        continue
                    sorted_orig = el.sortDiatonicAscending().pitches
                    top_pitch = sorted_orig[-1] if sorted_orig else None
                    if top_pitch is not None:
                        voiced = [p for p in new_pitches if p.midi <= top_pitch.midi]
                        el.pitches = tuple([*(voiced or new_pitches), top_pitch])
                    else:
                        el.pitches = tuple(new_pitches)
                except Exception:  # noqa: BLE001
                    pass

    return serialise_score(new_score)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

class ApplyStyleRequest(BaseModel):
    musicxml: str = Field(..., description="Source MusicXML string.")
    composer_id: str = Field(..., description="Composer adapter ID (see GET /style/composers).")
    intensity: float = Field(
        0.4,
        ge=0.0,
        le=1.0,
        description="Style intensity from 0.0 (no change) to 1.0 (full). Default 0.4.",
    )


class ApplyGuitarStyleRequest(BaseModel):
    musicxml: str = Field(..., description="Source MusicXML string.")
    style_id: str = Field(..., description="Guitar variation style ID (see GET /style/guitar/styles).")
    intensity: float = Field(0.6, ge=0.0, le=1.0)


@router.get("/composers")
def route_list_composers() -> list[dict[str, Any]]:
    """Return all available composer adapters."""
    return [
        {
            "id": c["id"],
            "display_name": c["display_name"],
            "instrument": c["instrument"],
            "status": "active",
        }
        for c in _GENERIC_COMPOSERS
    ]


@router.get("/guitar/styles")
def route_list_guitar_styles() -> dict[str, Any]:
    """Return all variation styles for Variaciones sobre un tema de Chan Cil."""
    return {"styles": _list_guitar_styles()}


@router.post("/apply")
def route_apply_style(req: ApplyStyleRequest) -> dict[str, Any]:
    """Apply a composer style via Claude-based reharmonization.

    Returns the modified MusicXML plus diff metadata.
    """
    composer = next((c for c in _GENERIC_COMPOSERS if c["id"] == req.composer_id), None)
    if composer is None:
        ids = [c["id"] for c in _GENERIC_COMPOSERS]
        raise HTTPException(status_code=422, detail=f"Unknown composer_id. Available: {ids}")

    settings = get_settings()
    if not settings.anthropic_api_key:
        raise HTTPException(
            status_code=503,
            detail="ANTHROPIC_API_KEY not configured — style application requires the LLM.",
        )

    modified_xml = _apply_style_with_claude(
        req.musicxml,
        style_rules=composer["style_rules"],
        composer_name=composer["display_name"],
        intensity=req.intensity,
    )

    vl = validate_voice_leading(modified_xml)
    warnings = [
        {
            "kind": v["kind"],
            "detail": f"{v['kind']} between {v['voices'][0]} and {v['voices'][1]} "
                      f"at measures {v.get('from_measure')}–{v.get('to_measure')}",
        }
        for v in vl.get("violations", [])
    ]

    return {
        "status": "applied",
        "composer_id": req.composer_id,
        "composer_name": composer["display_name"],
        "intensity": req.intensity,
        "musicxml": modified_xml,
        "warnings": warnings,
    }


@router.post("/guitar/apply")
def route_apply_guitar_style(req: ApplyGuitarStyleRequest) -> dict[str, Any]:
    """Apply a guitar variation style to the score using the Chan Cil style registry."""
    style = _get_guitar_style(req.style_id)
    if style is None:
        ids = [s["id"] for s in _list_guitar_styles()]
        raise HTTPException(status_code=422, detail=f"Unknown style_id. Available: {ids}")

    settings = get_settings()
    if not settings.anthropic_api_key:
        raise HTTPException(
            status_code=503,
            detail="ANTHROPIC_API_KEY not configured — style application requires the LLM.",
        )

    # Combine generic style rules from the language_rules list
    style_rules = "\n".join(style.get("language_rules", []))
    modified_xml = _apply_style_with_claude(
        req.musicxml,
        style_rules=style_rules,
        composer_name=style["model_composer"],
        intensity=req.intensity,
    )

    return {
        "status": "applied",
        "style_id": req.style_id,
        "display_name": style["display_name"],
        "movement": style["movement"],
        "intensity": req.intensity,
        "musicxml": modified_xml,
    }
