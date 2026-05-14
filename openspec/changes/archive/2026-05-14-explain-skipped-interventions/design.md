## Context

The current retrieval and intervention stack already produces diagnostics and scorecards. The missing product behavior is a stable, user-readable explanation for silence. This should reuse existing diagnostics instead of adding a new decision engine.

## Goals / Non-Goals

**Goals:**

- Add stable skip reason codes for prompt-time no-injection decisions.
- Surface those reasons through inspect/explain paths.
- Keep default prompt output concise and avoid adding noise to normal tasks.

**Non-Goals:**

- Change ranking thresholds.
- Promote candidates faster.
- Inject no-injection explanations into every prompt.
- Add new host-specific explanation behavior.

## Decisions

### Skip reasons derive from existing diagnostics

The skip reason should be built from retrieval diagnostics, delivery mode, policy decisions, and scorecard state. Avoid a second parallel reason engine.

Alternative considered:
- Add a separate skip classifier. Rejected because it could diverge from the actual intervention decision.

### Skip reason precedence is ordered

Multiple skip causes can apply at once. The explanation layer must derive one primary reason with a deterministic precedence order, while preserving secondary details when useful.

Initial precedence:

```text
1. scope_disabled
2. repo_policy_blocked_or_circuit_open
3. holdout_suppressed
4. no_candidate
5. candidate_not_mature
6. delivery_state_shadow_only
7. recent_harm_or_quarantined
8. semantic_match_policy_rejected
9. task_family_mismatch
10. low_confidence_or_score_margin
11. record_only_diagnostic_candidate
```

This precedence should be revisited after `tighten-injection-policy` lands, because the skip taxonomy should explain the final injection policy rather than a provisional one.

### Explain on demand, not by default

No-injection explanations should appear in inspect/explain surfaces and explicit host routine follow-ups, not as routine prompt injection text.

Alternative considered:
- Always tell the agent why EE skipped. Rejected because it adds prompt noise and weakens the "minimal intervention" product value.

## Risks / Trade-offs

- [Reasons become too generic] -> Use stable codes plus concise human-readable details.
- [Reasons diverge from scorecard] -> Derive them from the same decision/diagnostic data.
- [Users expect action from every skip] -> Explain when continued work is the correct next step.
- [Taxonomy churn after injection policy tightening] -> Implement `tighten-injection-policy` before finalizing the skip reason taxonomy, or keep this change explicitly provisional.
