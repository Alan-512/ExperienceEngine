# Design: Retrieval policy inspection surface

## Goals

- Reuse existing `inspect --last --verbose`, interaction inspection, and Codex MCP summary surfaces.
- Make stage diagnostics understandable without requiring raw scorecard JSON.
- Preserve all existing scorecard fields for compatibility.

## Non-Goals

- No new retrieval stage.
- No score tuning.
- No new persistence table.
- No separate chat-participant style explanation flow.

## Approach

1. Add a derived `retrievalPolicySummary` to `ExperienceLastInspection`.
2. Build the summary from the persisted `InjectionScorecard`:
   - stage name, candidate counts, accepted/rejected/skipped/backfilled counts, and reason codes
   - semantic mode inferred from the `semantic_rerank_backfill` stage reason codes
   - top candidate policy components, sorted by absolute contribution
   - rejected candidate reason codes
3. Print the summary in `ee inspect --last --verbose`.
4. Include the summary in Codex MCP scorecard summaries so host-native inspect can explain why retrieval matched.

## Compatibility

The new summary is additive. Existing fields (`retrievalNotes`, `policyReasons`, `retrievalPolicyDiagnostics`, `topCandidates`) remain unchanged.
