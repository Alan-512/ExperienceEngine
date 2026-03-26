# Organic Experience Convergence Design

Date: 2026-03-26

## Summary

ExperienceEngine already records real host activity and can distill it into candidates and nodes. The current problem is not missing capture. The problem is that organically learned experience often fails to mature into strong reusable nodes.

Two failure modes are driving that outcome:

1. similar organic experiences are fragmented into multiple near-duplicate nodes
2. high-value first-seen experiences upgrade too slowly, because they must wait for repeated support or later helpful reuse

This design fixes those two problems without making the product more conservative and without introducing user-facing source explanations.

The design keeps the current philosophy:

- record broadly
- learn broadly
- govern through reuse quality

But it strengthens two parts of the learning loop:

- convergence: merge similar organic experiences into fewer stronger nodes
- acceleration: let clearly high-value new experiences enter a controlled faster promotion path

## Problem Statement

Current organic learning behavior has three characteristics:

- real tasks do create `task_runs`, `experience_candidates`, and `distilled_node_id`
- many naturally learned nodes remain at `state = candidate`
- many of those nodes have `support_count = 1` and never become dominant injection candidates

Investigation of recent Codex data shows that this is mostly caused by fragmentation, not by missing recording and not by broken feedback transitions.

### Fragmentation symptoms

- the same core lesson can appear as multiple nodes with slightly different wording
- closely related prompts can land in adjacent task types such as `test_debug` and `bug_fix`
- merge currently only considers reusable nodes within the same `scope_id + task_type + node_type`
- similarity thresholds are strict enough that wording drift often becomes `ADD` instead of `UPDATE`

### Promotion symptoms

- a new node becomes `active` only after:
  - `support_count >= 2`, or
  - later injected reuse leads to `helped_count >= 1`
- high-value first-seen experiences therefore stay weak for too long
- fragmented nodes make this even worse because each fragment starts at support 1

## Goals

- Reduce fragmentation among organically learned experiences.
- Increase convergence into fewer, stronger, reusable nodes.
- Give clearly high-value new experiences a faster but controlled path toward reuse.
- Preserve the current broad-capture learning model.
- Avoid user-facing complexity around source explanations.

## Non-Goals

- No hard learning gates based on "test vs real" provenance.
- No user-facing taxonomy for seeded versus runtime experience.
- No requirement for manual experience authoring.
- No weakening of helped/harmed governance.

## Design Principles

### 1. Do not reduce recording

All meaningful tasks should still be recorded.

This design is not about blocking candidates from being created. It is about:

- merging better
- promoting better

### 2. Convergence before conservatism

The system should prefer consolidating similar lessons into stronger nodes over spawning many weak candidates.

### 3. LLMs may recommend, but the system decides

LLM distillation can judge whether an experience appears highly reusable, but it should not unilaterally set a node to `active`.

### 4. Fast promotion must remain governable

Any faster path must still be visible in diagnostics and remain reversible through harmed feedback.

## Proposed Changes

## A. Stronger Organic Convergence

### A1. Move from task-type-local merge to family-aware merge

Current reusable-node selection is too narrow because it only searches inside the same:

- `scope_id`
- `task_type`
- `node_type`

This design changes merge eligibility to prefer:

- same scope
- same node type
- same task family or adjacent task families

Examples of adjacent families that should be eligible for reuse comparison:

- `test_debug` <-> `bug_fix`
- `test_debug` <-> `build_debug` when the same failing loop is involved
- `config_debug` <-> `bug_fix` when the core lesson is routing/config diagnosis

This does not mean all task types become interchangeable. It means merge eligibility becomes family-aware instead of rigidly type-local.

### A2. Compare core lesson, not only wording

Merge decisions should be driven by structured lesson similarity, not just trigger or hint phrasing.

Reusable-node scoring should include:

- trigger similarity
- compact hint similarity
- verification-loop similarity
- recommended-step overlap
- avoid-step overlap
- failure/remediation object overlap
- task family compatibility

This should make it easier to merge:

- "Vitest EROFS in read-only sandbox"
- "node_modules/.vite-temp EROFS during test execution"
- "sandbox prevents vitest from writing temp files"

into a single stronger organic lesson when they are genuinely the same operational pattern.

### A3. Favor mature nodes as merge targets

When a new candidate is near-duplicate with an existing mature node, the system should prefer:

- `UPDATE` the mature node
- over `ADD` a fresh node

This preference should strengthen when the existing node already has:

- `state = active`
- higher `support_count`
- positive helped/harmed balance
- validated expectation-correction reuse

The goal is to let real evidence accumulate into a small number of strong nodes.

## B. Faster Controlled Promotion For High-Value Experiences

### B1. Add LLM promotion recommendation

During distillation, the LLM should emit an internal recommendation describing whether the newly distilled experience appears especially reusable.

New internal fields:

- `promotion_signal`
  - `normal`
  - `high_value`
- `promotion_reason`
  - a short explanation of why it appears highly reusable

This signal should reflect things like:

- strong execution ordering
- clear verification loop
- strong warning value
- obvious expectation correction
- highly reusable troubleshooting pattern

### B2. Do not allow direct LLM-to-active promotion

The LLM recommendation is only an input.

The system must still verify hard conditions before taking a faster promotion path, such as:

- the run ended with a clear success or stable remediation path
- the distilled node has a concrete `success_signal`
- the node contains structured steps or explicit avoidance guidance
- the node is not obviously one-off repository noise

### B3. Introduce an intermediate state

Add a new state:

- `priority_candidate`

Updated lifecycle:

- `candidate`
- `priority_candidate`
- `active`
- `cooling`
- `retired`

Meaning:

- `candidate`
  - newly learned, low-confidence, not yet proven
- `priority_candidate`
  - high-value and eligible for earlier cautious reuse
- `active`
  - mature reusable experience

### B4. Promotion rules

Normal path:

- `candidate -> active` when:
  - `support_count >= 2`, or
  - injected reuse produces `helped_count >= 1`

Fast path:

- `candidate -> priority_candidate` when:
  - `promotion_signal = high_value`
  - hard quality checks pass

Priority path:

- `priority_candidate -> active` when:
  - `helped_count >= 1`, or
  - additional supporting reuse confirms the lesson

Fallback:

- `priority_candidate -> candidate` or `cooling` when:
  - harmful reuse appears early, or
  - the experience fails to validate through reuse

This gives obviously useful experiences a faster path to reuse without making them instantly authoritative.

## C. Injection Policy Changes

### C1. Candidate behavior

Plain `candidate` nodes should remain conservative:

- usually skipped
- or only eligible for `inject_conservative` when retrieval confidence is strong

### C2. Priority candidate behavior

`priority_candidate` nodes may be injected conservatively sooner than ordinary candidates.

They should be eligible for:

- `inject_conservative`

when retrieval confidence is strong and the lesson is clearly relevant.

### C3. Active behavior

`active` nodes continue normal injection behavior.

This keeps the product aligned with its current trust model:

- mature nodes drive normal injection
- newly elevated nodes get cautious real-world validation

## D. Diagnostics

This design deliberately avoids heavy source-explanation UX. Diagnostics should instead explain:

- whether a new experience was merged or added
- whether it entered `priority_candidate`
- why it was treated as high-value
- why a near-duplicate was absorbed or not absorbed

Operator-visible diagnostics should include:

- merge decision:
  - `ADD`
  - `UPDATE`
  - `NONE`
- merge reason
- task family compatibility
- promotion signal
- whether fast promotion was applied
- current node state

These should surface in:

- `ee inspect --last`
- `ee doctor`
- `ee status`

## Expected Outcomes

After this design is implemented:

- organically learned experience should converge into fewer, stronger nodes
- repeated real lessons should stop fragmenting into long tails of `support_count = 1`
- clearly high-value new lessons should become reusable earlier
- strong nodes in the main injection pool should represent real recurring lessons more often
- helped/harmed governance remains the final authority on long-term retention

## Risks

### Risk 1: Over-merging distinct lessons

If family-aware merge becomes too permissive, distinct experiences may collapse into one node and lose useful specificity.

Mitigation:

- keep node-type boundaries
- require structured lesson overlap, not only family overlap
- preserve conservative fallback to `ADD` when ambiguity is high

### Risk 2: Fast promotion becomes too aggressive

If `priority_candidate` is too easy to reach, the system may start injecting immature lessons too early.

Mitigation:

- require LLM recommendation plus hard quality checks
- allow only conservative injection from `priority_candidate`
- demote quickly on early harm

### Risk 3: Diagnostics become noisy

If every merge/promotion detail is surfaced, operator output may become harder to read.

Mitigation:

- keep diagnostics compact
- show summary first, detail only in inspect paths

## Success Criteria

- Fewer near-duplicate organic nodes for the same lesson family.
- Higher average `support_count` among organically learned nodes.
- A visible population of `priority_candidate` nodes for clearly high-value first-seen lessons.
- Faster transition of useful organic lessons into `active`.
- Real host tasks more often inject organically learned nodes instead of only long-lived legacy or validation nodes.
