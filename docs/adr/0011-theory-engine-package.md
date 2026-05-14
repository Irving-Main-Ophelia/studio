# ADR-0011 — Theory engine as a standalone package

- **Status:** Accepted, May 13, 2026
- **Phase:** 1 — M1.3 (Theory engine + Pillar 2)
- **Supersedes:** —

## Context

Phase 0 (ADRs 0006 & 0007) put a thin music21 wrapper inside the agent backend
(`backend/agent/app/tools/theory.py`) — just enough to estimate the key and
transpose a score for the proof-of-concept agent loop. PHASE_1.md §1.4-D
demands a real theory engine: six analyzers (key, Roman-numeral progression,
voice-leading, range, cadences, motifs), four validators (parallel
5ths/8ves, instrument range, voicing spacing, rhythm), and **Pillar 2**
transposition with enharmonic respelling and per-instrument range warnings.

That much music-theory surface inside the FastAPI app would:

- mix concerns (HTTP routing vs music21 semantics) that have very different
  iteration cadences,
- couple the eventual evaluation harness (`packages/theory/python/tests/*`)
  to the web framework, and
- prevent the (future) MCP tool server, the e2e test harness, and any
  Modal-side workers from reusing the same code without dragging in
  FastAPI / Anthropic.

## Decision

Extract a standalone Python package, `stockhausen-theory`, that owns every
musical operation:

```
packages/theory/python/
├── pyproject.toml             # hatchling, music21 dep, ruff/mypy/pytest config
├── README.md
├── stockhausen_theory/
│   ├── __init__.py            # public surface (re-exports analyzers, validators, transpose)
│   ├── py.typed               # PEP-561 marker so consumers get strict types
│   ├── score_io.py            # parse_score / serialise_score / extract_notes
│   ├── transpose.py           # Pillar-2: transpose() and transpose_region()
│   ├── instrument_ranges.py   # practical ranges (piano, violin, viola, …)
│   ├── analyzers/             # key, progression, voice_leading, range, cadences, motifs
│   └── validators/            # voice_leading, range, voicing, rhythm
└── tests/                     # pytest, fixture-driven, isolated from agent app
```

The agent backend depends on this package as an editable path dependency
(`uv` `[tool.uv.sources]`). `app/tools/theory.py` is now a 60-line shim that
re-exports the package's public surface so the existing FastAPI routes keep
working without churn. New routes (`/theory/progression`, `/theory/cadences`,
`/theory/validate/voice-leading`, `/theory/transpose-region`, …) live in
`app/routes/theory.py` and are thin pass-throughs.

In parallel, `packages/theory/ts/` ships **types only** (no runtime code) at
`@stockhausen/theory-types`. The desktop app imports them in `lib/api.ts` so
the analyzer response shapes are checked at compile time. The TypeScript
package is a workspace dependency; the Python package is an editable
`path` dependency. There is no shared codegen — the surface is tight and
moves slowly enough that hand-keeping the two in sync is cheap and clear.

## Why a package and not just folders inside the backend?

1. **Single source of truth.** Every musical operation routes through one
   module. The agent never invents music theory; it only calls these
   functions.
2. **Independent test surface.** `packages/theory/python/tests/` runs
   without a FastAPI app or an Anthropic key; the agent backend tests
   simply integrate them.
3. **PEP-561 typed.** The `py.typed` marker means downstream consumers
   (the agent, future MCP server, evaluation harnesses) get strict
   type-checking against the public surface.
4. **Stable contract for the frontend.** `@stockhausen/theory-types`
   gives `lib/api.ts` named return types for every route, keeping the
   wire format honest.

## Alternatives considered

1. **Keep everything in `backend/agent/app/tools/`.** Simpler today but
   makes the theory layer impossible to test or reuse outside the FastAPI
   process. Rejected.
2. **Make the theory engine a separate microservice.** Over-engineering
   for an offline-first single-user desktop app. Rejected (NORTH_STAR
   §2 principle 2 — "local-first").
3. **Generate the TypeScript types from Pydantic with `datamodel-code-generator`.**
   Tempting, but the analyzer return shapes are simple enough that hand-
   maintained types are clearer, and we avoid a build-time codegen step.
   Revisit only if the surface explodes.

## Consequences

**Positive**

- Phase 1 §1.4-D ships in full: six analyzers, four validators, Pillar-2
  region transposition with enharmonic respelling and range warnings.
- `pytest packages/theory/python/tests/` runs in <1 s in isolation.
- `mypy --strict` succeeds on both the theory package and the agent
  backend (the package's `py.typed` plus a small `disable_error_code`
  list for music21-stub limitations).
- The desktop app gets richer typed analyzer responses with zero runtime
  cost (types-only package).
- Future Phase-2 capture/transcription code and Phase-3 score-aware
  transformations can import the same theory engine directly.

**Negative**

- One more package to keep in sync (Python ↔ TypeScript types).
  Mitigated by their tiny size and a single integration test
  (`backend/agent/tests/test_theory_routes.py`).
- Editable path install adds a build step on every `uv sync`. Acceptable
  trade-off; build time is ~250 ms.

## Pillar-2 specifics — transposition

`stockhausen_theory.transpose(musicxml, target_key)` transposes the whole
score; `transpose_region(musicxml, …, measure_start, measure_end, part_indices)`
transposes a contiguous measure range, optionally restricted to specific
parts. Both:

1. Compute the interval between the estimated source key and the target
   key (preserving mode when the user gives just a tonic).
2. Apply `music21.stream.Score.transpose()` which performs the enharmonic
   respelling music21 considers idiomatic for the destination key.
3. Compare the transposed pitches to the per-instrument practical range
   from `instrument_ranges.py`. Notes that fall outside the range are
   surfaced as structured `warnings` so the agent's diff overlay (M1.4)
   can show them to the maintainer before they accept the change.

## Out of scope (for this ADR)

- The 10 agent tools that compose these primitives into the
  `ScoreDiff` contract live in ADR-0012 (M1.4).
- The Theory Tutor Panel (Pillar 8) UI lives in ADR-0014 (M1.4).
- Adaptive voice-leading rewriters (suggest the *fix* for parallel 5ths)
  are deferred to Phase 2; the validator just *flags* for now.

## References

- `packages/theory/python/stockhausen_theory/__init__.py`
- `packages/theory/python/tests/`
- `backend/agent/app/routes/theory.py`
- `backend/agent/app/tools/theory.py` (compatibility shim)
- `apps/desktop/src/lib/api.ts` (typed client)
- `packages/theory/ts/src/index.ts` (types-only TS package)
- `docs/phases/PHASE_1.md` §1.4-D
- `NORTH_STAR.md` §2.2 (theory rigor)
