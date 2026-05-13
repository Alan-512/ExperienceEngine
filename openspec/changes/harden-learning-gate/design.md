## Context

The current learning path already builds `CandidateSourceSignal` and uses `LlmLearningGate`, but the system still needs a harder deterministic boundary between "record this task" and "learn this as future guidance." The architecture roadmap identifies this as the highest priority because candidate quality determines retrieval quality and injection trust.

## Goals / Non-Goals

**Goals:**

- Add a deterministic `LearningEligibilityDecision` before candidate creation.
- Reject low-signal task records while still preserving them as task history.
- Preserve a narrow path for high-confidence successful tasks that encode verified project constraints.
- Make rejection reasons inspectable.
- Add tests for accepted and rejected learning paths.

**Non-Goals:**

- Remove LLM distillation.
- Rewrite candidate or node schema in this change.
- Re-score historical candidates or nodes.
- Change runtime adapter APIs or MCP tools.

## Decisions

### Eligibility runs before LLM candidate judgment

The deterministic gate should run before LLM distillation or candidate persistence. LLMs may summarize accepted tasks, but they must not be the only authority deciding whether a task deserves long-term learning.

Alternative considered:
- Prompt the LLM harder to reject generic cases. Rejected because it keeps the most important product boundary probabilistic.

### Rejections are still task records

Rejected tasks should still persist as task runs/input records/outcomes. The gate only controls candidate creation.

Alternative considered:
- Drop rejected records entirely. Rejected because operator inspection, statistics, and future analysis need task history.

### Successful tasks are not all rejected

Ordinary successful tasks should not become candidates. Successful tasks may become candidates only when they contain verified, reusable project execution constraints such as release steps, host compatibility fixes, or validation order.

Alternative considered:
- Only learn failures. Rejected because some of the most valuable project guidance is discovered during successful but non-obvious execution.

### Rejection reasons are structured

Use stable reason codes such as `expression_layer_only`, `insufficient_substantive_evidence`, and `no_transferable_execution_value` so tests and inspect surfaces can rely on them.

Alternative considered:
- Store only human-readable text. Rejected because it is harder to test and aggregate.

### Eligibility decisions use ordered precedence

The deterministic gate must evaluate reason codes in a fixed order so acceptance and rejection do not depend on incidental signal ordering.

Initial precedence:

```text
1. reject: scope_disabled_or_policy_blocked
2. reject: expression_layer_only
3. reject: insufficient_substantive_evidence
4. accept: failure_repair_success
5. accept: retry_pattern
6. accept: directional_correction
7. accept: objective_verification_change
8. accept: repeated_task_family
9. accept: reusable_error_signature
10. accept: verified_project_constraint
11. reject: no_transferable_execution_value
```

`objective_verification_change` should mean a tool-backed change in evidence, such as a test/build/typecheck/doctor/integration check moving from failing to passing, a previously missing host wiring check becoming healthy, or another explicit tool result proving the task path. A tool-light host run can still qualify only if the finalization payload includes equivalent objective evidence; otherwise it should fall back to `insufficient_substantive_evidence` or `no_transferable_execution_value`.

Alternative considered:
- Let each signal helper return an independent boolean and accept any true value without ordering. Rejected because overlapping signals would produce unstable or hard-to-explain reason codes.

### Fixture examples are part of the contract

The first implementation should add small fixture-style test cases for both accepted and rejected decisions:

```text
reject: docs-only wording edit
reject: ordinary successful file edit with no verification
reject: prompt-only task with no substantive tool evidence
accept: failing test fixed and passing
accept: repeated retry pattern that converges
accept: user corrects wrong implementation direction and final verification passes
accept: successful host compatibility repair with doctor/hook evidence
```

## Risks / Trade-offs

- [Over-rejection hides useful lessons] -> Keep verified successful constraints and repeated task families as accepted paths.
- [Reason storage may require schema changes] -> Prefer reusing existing task/candidate metadata if sufficient; only add schema fields if tests prove no current path can expose the reason.
- [Candidate volume drops abruptly] -> Validate with focused tests and inspect summaries before broader tuning.

## Migration Plan

1. Add tests that describe expected accepted/rejected learning paths.
2. Implement the deterministic eligibility gate without changing external adapter APIs.
3. Wire the gate into finalization before candidate creation.
4. Expose learning reasons through existing inspect or learning summary paths.
5. Validate host compatibility paths for Codex, Claude Code, and OpenClaw.
6. Run focused analyzer/runtime tests, then `pnpm check`.
