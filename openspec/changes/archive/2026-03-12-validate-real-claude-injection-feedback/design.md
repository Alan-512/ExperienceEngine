## Design Summary

This change mirrors the real-validation path previously used on OpenClaw, but applies it to Claude Code's hook-driven adapter.

The adapter already supports:

1. `UserPromptSubmit` -> prompt-time intervention
2. `PostToolUse` -> tool evidence accumulation
3. `SessionEnd` -> finalization into the core runtime

The remaining gap is not data plumbing; it is proving that the stored behavior matches product intent in real Claude runs.

## Validation Strategy

1. Seed or reuse a Claude scope that already contains a relevant strategy node.
2. Run a real similar follow-up prompt and verify:
   - Claude receives ExperienceEngine prompt-time context
   - `experience_input_records.injected_node_ids_json` is non-empty
3. Run a real negative-control prompt in a different task family and verify:
   - no prompt-time ExperienceEngine context is emitted
   - finalized record persists empty injected node ids
4. Run real injected outcomes and verify node counters:
   - injected success increments `usage_count` / `helped_count`
   - injected failure increments `usage_count` / `harmed_count`
5. Promote any newly useful live payload sequence into the Claude fixture corpus when it adds host-shape or behavior coverage.

## Scope Control

This change does not redesign Claude policy thresholds or node analysis. It only verifies that the existing policy behaves correctly in real Claude runs and captures representative evidence in the repository.
