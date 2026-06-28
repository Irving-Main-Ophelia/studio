# ADR-0017 — Tool-honesty convention: "work or fail loudly"

- **Status:** Accepted, June 27, 2026
- **Phase:** 3.5 — M3.5.0 (truth pass)
- **Supersedes:** nothing. Codifies an existing, already-followed pattern so it is a rule, not folklore.

## Context

Stockhausen advertises a tool surface to two consumers: the **LLM** (the Anthropic tool
descriptors in `agent_tools.py`) and the **frontend** (chat, dialogs, panels that call the
local FastAPI). Some of that surface is fully implemented; some is intentionally ahead of its
phase (audio AMT-on-GPU, per-track stem render). The danger is a tool that **silently returns a
success-shaped payload while doing nothing** — an empty diff presented as "done", or a stub body
rendered as a real result. That erodes trust faster than a missing feature, and it makes the docs
lie (see `docs/reference-daws/REFINE_AND_ERADICATE.md` §1).

The June 27, 2026 truth pass (M3.5.0) found the backend already largely follows a good pattern —
this ADR writes it down so every future tool inherits it.

## Decision

**Every tool in the advertised surface either works or fails loudly.** No silent empty-diff
successes; no stub payload that looks like a real one. Concretely, three contracts:

### 1. Score-mutating tool that changes nothing → typed `TheoryWarning`, never a silent empty diff

A tool that returns a `ScoreDiff` (ADR-0012) but produced no change MUST attach a typed
`TheoryWarning` (`app/score_diff.py`) explaining why, so the diff overlay can say "unchanged —
here's why". The `kind` is a stable machine string; `detail` is a one-sentence human reason.

Established kinds:

| `kind` | Raised by | Means |
|---|---|---|
| `no_substitutions` | `score_reharmonize` | Claude produced no chord substitutions for the range; score unchanged. |
| `generation_failed` | `score_add_section` | Generation fell back; the new section was not produced. |
| `range` / voice-leading kinds | `score_transpose`, `score_replace_bars`, … | Result is valid but flags an instrument-range or voice-leading concern. |

The preview MusicXML equals the base MusicXML in the "changed nothing" case — that is allowed
**only** when a warning explains it. A `ScoreDiff` with `preview == base` and **no** warning is a bug.

### 2. Non-symbolic agent tool not yet implemented → `{"stub": true, "reason": …}`

An agent tool (dispatched through `dispatch_tool`) whose real implementation needs infrastructure
that is not present (e.g. Modal GPU) returns a plain dict with an explicit `stub` flag and a
`reason`. It never fabricates data. Current honest stubs:

- `audio_stem_separate` → `{"stub": true, "reason": "Requires Demucs v4 on Modal GPU…", "stems": []}`
- `audio_transcribe` → `{"stub": true, "reason": "Requires YourMT3+ on Modal GPU.", "musicxml": null}`
- `score_import_audio` → `{"stub": true, "reason": "Requires Demucs v4 + YourMT3+ on Modal GPU."}`

The tool's Anthropic `description` must also carry the word **STUB** so the LLM does not promise it.

> Note: this is distinct from the local AMT pipeline at `POST /audio/import`, which is **real**
> (Basic Pitch + GAPS in a Python 3.12 venv). "Stub" means *not implemented*, not *optional dependency*.

### 3. HTTP route not yet implemented → `{"status": "stub", "reason": …}`

A FastAPI route that cannot yet do the real work returns `200` with `{"status": "stub",
"reason": …}` plus any cheap real data it *can* compute (e.g. the part list). It never returns a
fabricated success. Current honest route stubs:

- `POST /export/minus-one` → `{"status": "stub", "reason": "…requires the sfizz.wasm sample render pipeline…", "omit_part_name": …}`
- `POST /export/stems` → `{"status": "stub", "reason": "…requires sfizz.wasm full render…", "parts": […]}`

A route that genuinely requires a missing dependency to run **at all** (vs. being unimplemented)
raises `HTTPException(503, detail=…)` instead — also loud, also honest (e.g. `/audio/import` when
the AMT venv is absent, `/style/apply` without an API key).

### 4. The frontend must surface every "can't do this" path

The UI renders each of the above as an explicit, visible message — never as a silent success:

- A `ScoreDiff` with warnings → the diff overlay lists them (it already reads `warnings`).
- A `{"stub": true}` or `{"status": "stub"}` payload → an explicit "Not available yet — <reason>"
  message; the result is **not** shown as a completed action.
- A `503` → the existing error path shows the `detail`.

## Consequences

- Adding a new tool means choosing one of the three shapes above up front; "return empty and we'll
  fill it in later" is not allowed.
- `main.py` carries a one-line router registry (router → phase → real|stub) so the ground truth is
  visible without spelunking (added in M3.5.0).
- Tests should assert the warning/stub shape, not just the happy path (a `ScoreDiff` whose preview
  equals base must carry a warning).
- Phase docs must not describe a shipped tool as a stub, nor vice-versa — drift in either direction
  is the same bug (this ADR pairs with the M3.5.0 reconciliation of `PHASE_1.md` / `parking-lot.md`).

## Key files

| Area | Path |
|------|------|
| Typed warning + diff envelope | `backend/agent/app/score_diff.py` (`TheoryWarning`, `ScoreDiff`) |
| Agent tools + honest stubs | `backend/agent/app/agent_tools.py` |
| Route stubs | `backend/agent/app/routes/export.py` (`/minus-one`, `/stems`) |
| Router registry | `backend/agent/app/main.py` |
| Diff overlay (renders warnings) | `apps/desktop/src/agent/DiffOverlay.tsx` |
