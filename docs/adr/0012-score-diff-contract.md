# ADR-0012 — The ScoreDiff contract: agent tools never mutate the score

- **Status:** Accepted, May 13, 2026
- **Phase:** 1 — M1.4 (Agent v2 + Pillars 4 & 8)
- **Supersedes:** —

## Context

Phase 0 shipped a two-tool agent (`theory_analyze_key`, `score_transpose`)
that wrote the new MusicXML directly back into `ScoreEngine`. That was
fine for a proof of concept but contradicts PHASE_1.md §1.7 (every tool
must propose, never mutate) and the broader North-Star principle of
*never run a musical operation without theory-engine validation*.

Phase 1 demands 10 tools, half of which mutate the score. Without a
disciplined envelope the maintainer cannot:

- preview what the agent is about to change,
- undo a multi-step proposal as a single unit,
- catch stale proposals when the underlying score has moved,
- see structured warnings (voice-leading, range, rhythm) before
  accepting,
- swap reharmonization / generator stubs for real implementations later
  without breaking the tool-call API.

We also want **planner escalation**: hard-reasoning tools (`theory.analyze_form`,
`score.add_section`, `score.reharmonize`) should run through Claude Opus
4.7, while the rest stay on Sonnet 4.6 for cost and latency.

## Decision

**Every score-mutating agent tool returns a `ScoreDiff` envelope.** No
direct mutation, no hidden writes.

```python
class ScoreDiff(BaseModel):
    diff_id: str            # UUID
    base_score_hash: str    # SHA-256 prefix of the score the diff was built against
    description: str        # 1–2 sentence music-theoretic readout
    operations: list[DiffOperation]    # forward + inverse pairs
    warnings: list[TheoryWarning]      # voice-leading, range, rhythm, range
    preview_musicxml: str   # post-diff MusicXML for the overlay
    tool: str               # canonical dotted name (e.g. "score.transpose")
```

A `DiffOperation` carries both the forward payload (post-state MusicXML
+ metadata like target_key/method/at_bar) and its inverse (pre-state
MusicXML). The frontend Undo machinery composes the diff into the
existing operation log (M1.0) without special-casing.

Read-only tools (`theory.analyze_key`, `theory.analyze_roman_numerals`,
`theory.analyze_voice_leading`, `theory.analyze_range`,
`theory.analyze_cadences`, `theory.identify_motifs`, `theory.explain`)
return their analyzer payload directly — they cannot mutate, so no
envelope is needed.

The full surface is at `backend/agent/app/agent_tools.py` (one module
owns the dispatch and Anthropic descriptors); the LLM loop at
`app/llm/anthropic_client.py` picks the model based on which tool the
agent just called:

```python
PLANNER_TOOLS = {
    "theory_analyze_form",
    "score_add_section",
    "score_reharmonize",
}
```

The chat route (`POST /agent/chat`) returns the diffs alongside the
plain-text reply; the frontend's `ScoreEngine` stages the latest diff in
`pendingDiff` and the `DiffOverlay` component renders it in
`--neon-violet` with Accept / Reject / Refine buttons.

## Phase-1 stubs

Two tools ship today as deliberate, transparent stubs:

- `score.reharmonize` — produces an empty diff with a `phase1_stub`
  warning. Real chord-substitution + voice-leading rewrite is parked for
  Phase 2.
- `score.add_section` — same: empty diff + `phase1_stub` warning. The
  Anticipatory Music Transformer / Moonbeam integration on Modal lands
  in Phase 2.

The agent tool surface, descriptors, and dispatch are stable today, so
swapping the body of either function later is a strictly local change.

## Alternatives considered

1. **Direct mutation, like Phase 0.** Cheap to ship; impossible to
   preview / undo / validate. Rejected on every count (NORTH_STAR §2.1,
   §2.2; PHASE_1.md §1.7).
2. **Operation-only diffs (no `preview_musicxml`).** Forces the frontend
   to compute previews, which means replaying music21 in TypeScript.
   Out of the question. We pay a few KB of MusicXML per diff and keep
   one source of truth.
3. **Separate accept-endpoint.** Considered; rejected. The diff already
   carries everything the frontend needs to commit through the existing
   operation-log pipeline. Adding a roundtrip on accept buys nothing.
4. **Use ProseMirror-style transforms.** Beautiful for plain text;
   overkill and impedance-mismatched for MusicXML semantic edits. The
   theory engine reasons in `music21` objects, not character offsets.

## Consequences

**Positive**

- The maintainer always sees what the agent is about to change before
  it changes (PHASE_1.md §1.7).
- Undo composes naturally — each diff lands in the operation log with
  its inverse, so `⌘Z` works without code changes.
- The diff carries `base_score_hash`; when the maintainer keeps editing
  while the agent is thinking, the UI can refuse a stale proposal.
- Stub-then-swap is safe for `score.reharmonize` and `score.add_section`
  — the contract doesn't change when we implement them for real.
- Planner-tool escalation to Opus 4.7 is one constant set away, not a
  rewrite.

**Negative**

- Diffs are large (full MusicXML on both sides). Acceptable on M2 Air;
  if we ever ship to mobile we'll swap to delta encoding.
- The agent has to be coached not to repeat the diff's MusicXML in its
  textual reply. The system prompt covers that (`app/llm/anthropic_client.py`).

## References

- `backend/agent/app/score_diff.py` — envelope types
- `backend/agent/app/agent_tools.py` — 10 tools + Anthropic descriptors
- `backend/agent/app/llm/anthropic_client.py` — loop + planner escalation
- `apps/desktop/src/agent/DiffOverlay.tsx` — UI surface
- `apps/desktop/src/lib/ScoreEngine.tsx` — `pendingDiff` slice
- `docs/phases/PHASE_1.md` §1.7
- `NORTH_STAR.md` §2.1 — local-first; §2.2 — theory rigor
