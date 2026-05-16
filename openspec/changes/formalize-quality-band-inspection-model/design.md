## Context

`ExperienceInteractionService` currently derives `qualityBand` directly from a node and also builds quality drivers nearby. That is useful, but it leaves the product contract implicit: callers see a band but do not get a stable reason taxonomy, evidence references, or a consistent way to explain skipped injection when guidance exists but is not ready to ship.

The #3 learning-quality release added scope-level observability. #4 should use that signal only as context for explanations; it must not change candidate admission, node delivery, or intervention decisions.

## Goals / Non-Goals

**Goals:**

- Create one shared Quality Band derivation path.
- Return a structured explanation object that includes band, reason codes, readable reasons, evidence references, and review actions.
- Reuse the same object in CLI and MCP inspection surfaces.
- Make no-injection explanations distinguish absence of guidance from guidance that exists but is not ready or is risky.
- Keep existing `strong`, `building`, and `risky` vocabulary stable.

**Non-Goals:**

- No new lifecycle state.
- No new delivery gate.
- No database migration.
- No numeric quality score.
- No automatic cleanup, retirement, promotion, or policy mutation.

## Decisions

1. Introduce a derived Quality Band explanation object.

   Rationale: callers need more than the band string. The object should include:

   - `band`: `strong | building | risky`
   - `summary`: one concise sentence
   - `reasonCodes`: stable machine-readable reason codes
   - `reasons`: readable explanation bullets
   - `evidenceRefs`: node ids, record ids, injection ids, or task-run refs already available
   - `recommendedAction`: optional review-only next action

   Alternative considered: keep `qualityBand` as a string and add more ad hoc text in each CLI/MCP surface. Rejected because that repeats classification logic and makes future #5 wording consolidation harder.

2. Keep Quality Band derived from existing state.

   Rationale: delivery state, lifecycle state, validation state, helped/harmed counts, hygiene risk, and learning-quality context already carry the evidence needed for this release. A new persisted field would create backfill and drift concerns without improving behavior.

   Alternative considered: persist `quality_band` on nodes. Rejected because the band is a view over mutable governance evidence, not a source of truth.

3. Treat Quality Band as explanatory, not authoritative gating.

   Rationale: delivery eligibility is already governed by delivery state, validation state, policy gates, and intervention scorecards. Quality Band should help users understand trust, not silently alter the runtime path.

   Alternative considered: suppress all `risky` guidance at Quality Band level. Rejected because that duplicates delivery-state gating and risks contradictory behavior.

4. Use Quality Band in no-injection explanations only when evidence exists.

   Rationale: "no relevant guidance exists" and "guidance exists but is building/risky" are different user experiences. The no-injection path should mention Quality Band only when skipped candidate/node evidence is available.

   Alternative considered: always print a Quality Band section in skip output. Rejected because it would add noise when the repo has no relevant learned guidance.

## Risks / Trade-offs

- [Reason taxonomy becomes too broad] -> Keep reason codes small and evidence-backed; add `other` only if unavoidable.
- [Users treat band as a hard score] -> Wording must say Quality Band is derived and explanatory.
- [CLI output becomes verbose] -> Default output shows concise band plus top reasons; verbose/detail surfaces show evidence refs.
- [MCP and CLI drift] -> Both consume the same shared derived model.
- [Hygiene integration overreaches] -> Use existing hygiene severity as context only; do not trigger hygiene jobs or mutate findings.

## Migration Plan

- Implement as additive derived output.
- Preserve existing `qualityBand` fields for compatibility while adding richer explanation fields.
- No rollback migration is needed; reverting the code removes the derived output.

## Open Questions

- Whether repo summary should aggregate the worst band only or present counts by band. The first implementation should prefer counts plus concise summary to avoid hiding mixed-quality repos.

