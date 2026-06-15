"""Shared synchronous score-generation logic.

Called by both:
  - app/routes/generate.py  (the HTTP endpoint, runs in asyncio via to_thread)
  - app/agent_tools.py     (the agent tool, runs synchronously)

The generator asks Claude to write a music21 Python script, then executes
it in a subprocess.  All I/O is synchronous so the two callers stay simple.
"""

from __future__ import annotations

import logging
import os
import subprocess
import sys
import tempfile
from typing import Any

from anthropic import Anthropic

from app.config import get_settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# System prompt for script generation
# ---------------------------------------------------------------------------

_SYSTEM = """\
You are a music21 Python code generator for Stockhausen.

Given a description, generate a complete, self-contained Python 3 script that:
  1. Imports ONLY from: music21, sys, os, math, random, tempfile
  2. Creates a stream.Score with one or more Part objects named after real instruments
  3. Sets key signature (key.KeySignature), time signature (meter.TimeSignature), \
and a MetronomeMark
  4. Fills every measure with actual Notes and/or Chords — diatonic to the key, \
idiomatic for the style, with correct durations that sum to the time signature
  5. Applies basic voice-leading: resolve the leading tone, avoid parallel fifths/octaves
  6. At the very end, outputs MusicXML with EXACTLY this block (nothing after):

        _tmp = score.write("musicxml")
        with open(_tmp, encoding="utf-8") as _fh:
            print(_fh.read())
        os.unlink(_tmp)

Rules:
  - Output ONLY valid Python 3. No markdown fences. No explanatory prose.
  - Variable for the top-level score MUST be named `score`.
  - Durations must be music21 duration objects, not raw floats.
  - Do NOT call score.show() or input().
"""

# ---------------------------------------------------------------------------
# Guitar-specific system prompt addendum
# ---------------------------------------------------------------------------

_GUITAR_ADDENDUM = """\

GUITAR-SPECIFIC RULES (apply whenever the texture is solo classical guitar):

Instrument setup:
  - Name the Part "Guitar" or "Classical Guitar".
  - Guitar is a TRANSPOSING INSTRUMENT: it sounds one octave below written pitch.
    Written range E4–E6 sounds E3–E5 (concert pitch).
    All pitches in music21 should be written pitch (treble clef, sounds 8va bassa).
  - Add a Transpose object: score.parts[0].transpose = interval.Interval(-12)
    OR use instrument.Guitar() which sets this automatically via:
        from music21 import instrument as inst
        guitar_part.insert(0, inst.Guitar())

Voice separation:
  - Separate the part into TWO voices using music21's voice system:
    Voice 1 (stems up): melody, upper voice
    Voice 2 (stems down): bass line and inner harmony
  - Example:
        v1 = stream.Voice()
        v1.id = 1
        v2 = stream.Voice()
        v2.id = 2
        measure.insert(0, v1)
        measure.insert(0, v2)
    Then insert notes into v1 and v2 separately.

Idiomatic guitar pitch ranges (written pitch):
  - Bass voice: E2–E4 (MIDI 40–64 in written pitch)
  - Inner harmony: E3–B4 (MIDI 52–71 in written pitch)
  - Melody: B3–E6 (MIDI 59–88 in written pitch)
  - Avoid going above E6 (MIDI 88 written). Avoid below E2 (MIDI 40).

Open strings (written pitch, use freely for bass notes):
  E2 (MIDI 40), A2 (MIDI 45), D3 (MIDI 50), G3 (MIDI 55), B3 (MIDI 59), E4 (MIDI 64)

Idiomatic keys (use these for easiest playability):
  E major, A major, D major, G major, C major, A minor, D minor, E minor

Left-hand stretch: no more than 4 consecutive frets (5 semitones) across
simultaneous notes in a single chord. Wider chords must be arpeggiated.

Common fingerstyle textures (Voice 2 accompaniment patterns):
  - Alberti-like: bass-note / inner-note / inner-note per beat
  - Arpeggio p-i-m-a: one note per 16th, four notes per beat
  - Alternating bass: root on beat 1, 5th or 3rd on beat 3 (in 3/4)
  - Block chord: all notes simultaneous (use sparingly, for accents)

Chord voicings — common guitar shapes (written pitches):
  - A major (open): [A2, E3, A3, C#4, E4]  — use note.Note for each
  - E major (open): [E2, B2, E3, G#3, B3, E4]
  - D major (open): [D3, A3, D4, F#4]
  - E minor: [E2, B2, E3, G3, B3, E4]
  - A minor: [A2, E3, A3, C4, E4]

Articulations (add via music21.articulations):
  - Staccato on inner-voice notes for lighter texture
  - Tenuto on melody notes for cantabile
  - Accent on downbeat bass notes

Dynamics: use music21.dynamics.Dynamic() — insert into parts, not notes.
"""


def _build_system_prompt(is_guitar: bool, style_prompt: str | None = None) -> str:
    """Combine the base system prompt with optional guitar and style addenda."""
    parts = [_SYSTEM]
    if is_guitar:
        parts.append(_GUITAR_ADDENDUM)
    if style_prompt:
        parts.append(f"\nSTYLE GUIDANCE FOR THIS MOVEMENT:\n{style_prompt}\n")
    return "".join(parts)


def _user_message(prompt: str, constraints: dict[str, Any]) -> str:
    lines = [f"Create a score: {prompt}"]
    if constraints.get("key"):
        lines.append(f"Key: {constraints['key']}")
    if constraints.get("time"):
        lines.append(f"Time signature: {constraints['time']}")
    if constraints.get("bars"):
        lines.append(f"Number of measures: {constraints['bars']}")
    if constraints.get("style"):
        lines.append(f"Style: {constraints['style']}")
    if constraints.get("texture"):
        lines.append(f"Texture / instrumentation: {constraints['texture']}")
    if constraints.get("tempo_bpm"):
        lines.append(f"Tempo: {constraints['tempo_bpm']} BPM")
    if constraints.get("parts"):
        lines.append(f"Parts: {constraints['parts']}")
    return "\n".join(lines)


def _strip_fences(raw: str) -> str:
    """Remove markdown code fences if the model added them."""
    s = raw.strip()
    if s.startswith("```"):
        lines = s.splitlines()
        end = -1 if lines[-1].strip() == "```" else len(lines)
        s = "\n".join(lines[1:end]).strip()
    return s


def run_script(script: str, timeout: int = 45) -> str:
    """Execute a music21 script in a subprocess and return MusicXML stdout."""
    with tempfile.NamedTemporaryFile(
        suffix=".py", delete=False, mode="w", encoding="utf-8"
    ) as fh:
        fh.write(script)
        path = fh.name
    try:
        result = subprocess.run(
            [sys.executable, path],
            capture_output=True,
            text=True,
            timeout=timeout,
            env={**os.environ, "MPLBACKEND": "Agg"},
        )
        if result.returncode != 0:
            stderr_preview = result.stderr[:600].strip()
            raise RuntimeError(f"exit {result.returncode}: {stderr_preview}")
        return result.stdout.strip()
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


def generate_score(
    prompt: str,
    constraints: dict[str, Any] | None = None,
    *,
    timeout: int = 45,
    style_prompt: str | None = None,
) -> dict[str, Any]:
    """Synchronously generate a score. Returns {musicxml, script, description}.

    Pass style_prompt to inject movement-specific style guidance (from
    guitar_styles.GUITAR_STYLES) alongside the guitar-specific system prompt.

    Raises RuntimeError if the API key is missing, Claude fails, or the
    generated script produces invalid output.
    """
    settings = get_settings()
    if not settings.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY not configured.")

    c = constraints or {}
    is_guitar = (
        "guitar" in (c.get("texture") or "").lower()
        or "guitar" in (c.get("parts") or "").lower()
        or "guitar" in prompt.lower()
    )
    system_prompt = _build_system_prompt(is_guitar=is_guitar, style_prompt=style_prompt)

    client = Anthropic(api_key=settings.anthropic_api_key)
    user_msg = _user_message(prompt, c)

    logger.info("generate_score: prompt=%r guitar=%s", prompt[:80], is_guitar)
    response = client.messages.create(
        model=settings.anthropic_model,
        max_tokens=4096,
        system=system_prompt,
        messages=[{"role": "user", "content": user_msg}],
    )

    raw = "".join(getattr(b, "text", "") for b in response.content)
    script = _strip_fences(raw)

    logger.info("generate_score: running script (%d chars)", len(script))
    musicxml = run_script(script, timeout=timeout)

    if not musicxml or "score-partwise" not in musicxml:
        raise RuntimeError("Script did not produce valid MusicXML.")

    description = prompt
    if c.get("bars"):
        description += f" ({c['bars']} bars)"

    return {"musicxml": musicxml, "script": script, "description": description}
