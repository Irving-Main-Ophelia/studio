# `stockhausen-theory`

The music-theory engine that lives between the agent and the score.

This package is the single source of truth for every musical operation
in Stockhausen — analyses (key, progression, voice-leading, range,
cadences, motifs) and validators (parallel 5ths/8ves, range warnings,
voicing spacing, rhythm-vs-time-signature). The agent's tool calls
(M1.4) route through here, as does the desktop notation editor's
"Explain" panel (Pillar 8).

The package is intentionally pure-Python with a stable, typed public API.
The desktop app talks to it via the FastAPI backend; an evaluation
harness in `tools/eval/` reuses the same module without touching FastAPI.

## Public surface

```python
from stockhausen_theory import (
    # analyzers
    analyze_key,
    analyze_progression,
    analyze_voice_leading,
    analyze_range,
    analyze_cadences,
    analyze_motifs,
    # validators
    validate_voice_leading,
    validate_range,
    validate_voicing,
    validate_rhythm,
    # transposition (Pillar 2)
    transpose,
    transpose_region,
)
```

All functions accept and return JSON-serialisable dicts so HTTP routes
and LLM tools can call them without adapters.

## Why a separate package?

- **Single source of truth.** The eval harness, the agent backend, and a
  future CLI all import the same `analyze_progression`.
- **Independent test surface.** `pytest packages/theory/python` runs in
  <1 s and never needs FastAPI booted.
- **Clean dependency boundary.** Anything that imports
  `stockhausen_theory.transpose` declares its dependency on music21
  explicitly.

See `docs/adr/0011-theory-package-extraction.md` for the architectural
rationale.
