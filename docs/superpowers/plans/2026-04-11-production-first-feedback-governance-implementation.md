# Production-First Feedback Governance Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement production-first delivery gating and feedback adjudication foundations so ExperienceEngine removes risky experience from live injection faster without losing bounded `priority_candidate` canary launches.

**Architecture:** Keep existing lifecycle states, add a separate persisted `delivery_state`, and route live injection eligibility through that state instead of `state` alone. Replace `success => auto helped` with a conservative automatic feedback model, then project lifecycle and delivery together from deterministic runtime-owned rules before optionally extending async posttask review to per-node writeback.

**Tech Stack:** TypeScript, node:sqlite, existing SQLite repositories, Vitest, runtime/intervention controller pipeline, hybrid posttask worker.

---

## Planned File Map

**Create**
- `tests/unit/delivery-state-governance.test.ts`

**Modify**
- `src/types/domain.ts`
- `src/store/sqlite/schema.sql`
- `src/store/sqlite/db.ts`
- `src/store/sqlite/repositories/node-repo.ts`
- `src/store/sqlite/repositories/review-event-repo.ts`
- `src/experience-management/node-lifecycle-governance.ts`
- `src/feedback/feedback-manager.ts`
- `src/feedback/state-transition.ts`
- `src/runtime/service.ts`
- `src/controller/candidate-retriever.ts`
- `src/controller/intervention-controller.ts`
- `src/controller/injection-scorecard.ts`
- `src/interaction/service.ts`
- `src/hybrid/types.ts`
- `src/hybrid/validators.ts`
- `src/hybrid/workers/postmortem-review.ts`
- `src/hybrid/workers/postmortem-review-llm.ts`
- `tests/unit/runtime-service.test.ts`
- `tests/unit/intervention-controller.test.ts`
- `tests/unit/interaction-service.test.ts`
- `tests/unit/node-repo.test.ts`
- `tests/unit/sqlite-db.test.ts`
- `tests/unit/hybrid/validators.test.ts`
- `tests/unit/hybrid/postmortem-review.test.ts`
- `tests/unit/hybrid/postmortem-review-llm.test.ts`
- `tests/integration/plugin-runtime.test.ts`

## Design Constraints

- Do **not** remove or rename the existing lifecycle states.
- Do **not** let worker outputs mutate lifecycle or delivery state directly.
- Do **not** preserve `success => auto helped`.
- Do **not** allow ordinary `candidate` nodes into live injection.
- Do preserve a bounded live path for `priority_candidate`.
- Do keep runtime writeback deterministic and policy-owned.
- Do land schema changes additively with safe backfills.

## Task 1: Add Delivery-State Persistence And Query Boundaries

**Files:**
- Create: `tests/unit/delivery-state-governance.test.ts`
- Modify: `src/types/domain.ts`
- Modify: `src/store/sqlite/schema.sql`
- Modify: `src/store/sqlite/db.ts`
- Modify: `src/store/sqlite/repositories/node-repo.ts`
- Modify: `src/store/sqlite/repositories/review-event-repo.ts`
- Test: `tests/unit/node-repo.test.ts`
- Test: `tests/unit/sqlite-db.test.ts`

- [ ] **Step 1: Write failing repository/schema tests**

Cover:
- `experience_nodes` persists `delivery_state`, `consecutive_harmed_count`, `last_feedback_verdict`, `quarantined_at`, `quarantine_reason`
- `review_events` accepts new event types including `mark_uncertain`, `quarantine`, `restore_conservative`, `restore_eligible`
- live node queries exclude `shadow_only` and `quarantined`
- shadow/evaluation queries still include `candidate`

Run:
```bash
pnpm vitest run tests/unit/node-repo.test.ts tests/unit/sqlite-db.test.ts tests/unit/delivery-state-governance.test.ts
```
Expected: FAIL on missing fields and query behavior.

- [ ] **Step 2: Add domain types and additive schema columns**

Add:
- `DeliveryState`
- `FeedbackVerdict`
- expanded `ReviewEvent["event_type"]`
- persisted node fields for delivery-state governance

Backfill defaults:
- `candidate -> shadow_only`
- `priority_candidate -> conservative_only`
- `active -> eligible`
- `cooling -> conservative_only`
- `retired -> quarantined`

- [ ] **Step 3: Update repositories**

Implement:
- node row mapping for new fields
- live query method based on `delivery_state`
- shadow-capable query method for evaluation-style callers
- review-event repository support for new event types

- [ ] **Step 4: Re-run tests**

Run:
```bash
pnpm vitest run tests/unit/node-repo.test.ts tests/unit/sqlite-db.test.ts tests/unit/delivery-state-governance.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/types/domain.ts src/store/sqlite/schema.sql src/store/sqlite/db.ts src/store/sqlite/repositories/node-repo.ts src/store/sqlite/repositories/review-event-repo.ts tests/unit/node-repo.test.ts tests/unit/sqlite-db.test.ts tests/unit/delivery-state-governance.test.ts
git commit -m "feat: add delivery state persistence"
```

## Task 2: Route Live Injection Through Delivery State

**Files:**
- Modify: `src/controller/candidate-retriever.ts`
- Modify: `src/controller/intervention-controller.ts`
- Modify: `src/controller/injection-scorecard.ts`
- Modify: `src/runtime/service.ts`
- Test: `tests/unit/intervention-controller.test.ts`
- Test: `tests/unit/runtime-service.test.ts`

- [ ] **Step 1: Write failing live-injection tests**

Cover:
- ordinary `candidate` nodes do not inject live
- `priority_candidate` can still inject conservatively
- `cooling` nodes cannot normal-inject
- `quarantined` nodes are excluded from live candidate retrieval
- `priority_candidate` exact-scope live retrieval actually works

Run:
```bash
pnpm vitest run tests/unit/intervention-controller.test.ts tests/unit/runtime-service.test.ts
```
Expected: FAIL on old `state`-based behavior.

- [ ] **Step 2: Implement live gating**

Rules:
- `shadow_only` excluded from live retrieval
- `conservative_only` limited to single-node conservative injection
- `eligible` allowed into normal injection
- `quarantined` excluded from live retrieval
- `priority_candidate` remains visible in live retrieval through `delivery_state`, not by accidental `state` leakage

- [ ] **Step 3: Update diagnostics and scorecard**

Surface:
- delivery-state-aware risk reasoning
- clear conservative-injection reason for `priority_candidate` and `cooling`

- [ ] **Step 4: Re-run tests**

Run:
```bash
pnpm vitest run tests/unit/intervention-controller.test.ts tests/unit/runtime-service.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/controller/candidate-retriever.ts src/controller/intervention-controller.ts src/controller/injection-scorecard.ts src/runtime/service.ts tests/unit/intervention-controller.test.ts tests/unit/runtime-service.test.ts
git commit -m "feat: gate live injection by delivery state"
```

## Task 3: Replace Automatic Success Credit With Conservative Feedback

**Files:**
- Modify: `src/feedback/feedback-manager.ts`
- Modify: `src/experience-management/node-lifecycle-governance.ts`
- Modify: `src/feedback/state-transition.ts`
- Modify: `src/runtime/service.ts`
- Test: `tests/unit/runtime-service.test.ts`
- Test: `tests/integration/plugin-runtime.test.ts`

- [ ] **Step 1: Write failing feedback tests**

Cover:
- success with injected nodes does not increment `helped_count`
- success records `uncertain`
- relevant harmful failure increments `harmed_count`
- `consecutive_harmed_count` updates after repeated harmful outcomes
- `priority_candidate` harmful adjudication removes it from live delivery

Run:
```bash
pnpm vitest run tests/unit/runtime-service.test.ts tests/integration/plugin-runtime.test.ts
```
Expected: FAIL on old `success => helped` behavior.

- [ ] **Step 2: Implement conservative automatic feedback**

Rules:
- `success => uncertain`
- relevant harmful failure => `harmed`
- `uncertain` updates usage and review history only
- runtime remains the automatic writeback owner

- [ ] **Step 3: Project lifecycle and delivery together**

Implement deterministic governance that:
- preserves lifecycle-state transitions
- independently sets `delivery_state`
- quarantines nodes on consecutive harm thresholds
- keeps `candidate` shadow-only and `priority_candidate/cooling` conservative-only

- [ ] **Step 4: Re-run tests**

Run:
```bash
pnpm vitest run tests/unit/runtime-service.test.ts tests/integration/plugin-runtime.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/feedback/feedback-manager.ts src/experience-management/node-lifecycle-governance.ts src/feedback/state-transition.ts src/runtime/service.ts tests/unit/runtime-service.test.ts tests/integration/plugin-runtime.test.ts
git commit -m "feat: make automatic feedback production-safe"
```

## Task 4: Make Explicit User Feedback Affect Delivery State

**Files:**
- Modify: `src/interaction/service.ts`
- Modify: `src/experience-management/node-lifecycle-governance.ts`
- Test: `tests/unit/interaction-service.test.ts`

- [ ] **Step 1: Write failing explicit-feedback tests**

Cover:
- explicit `helped` can restore a quarantined node only to `conservative_only`
- explicit `harmed` immediately downgrades live-eligible nodes
- user feedback and automatic feedback share the same deterministic projection rules

Run:
```bash
pnpm vitest run tests/unit/interaction-service.test.ts
```
Expected: FAIL

- [ ] **Step 2: Implement explicit-feedback delivery effects**

Rules:
- explicit `mark_harmed` can downgrade `eligible -> conservative_only` or trigger `quarantined`
- explicit `mark_helped` can restore only to `conservative_only` first
- review events reflect `mark_uncertain`/restore/quarantine transitions when applicable

- [ ] **Step 3: Re-run tests**

Run:
```bash
pnpm vitest run tests/unit/interaction-service.test.ts
```
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/interaction/service.ts src/experience-management/node-lifecycle-governance.ts tests/unit/interaction-service.test.ts
git commit -m "feat: apply delivery state changes to explicit feedback"
```

## Task 5: Extend Posttask Review To Bounded Per-Node Recommendations

**Files:**
- Modify: `src/hybrid/types.ts`
- Modify: `src/hybrid/validators.ts`
- Modify: `src/hybrid/workers/postmortem-review.ts`
- Modify: `src/hybrid/workers/postmortem-review-llm.ts`
- Modify: `src/runtime/service.ts`
- Test: `tests/unit/hybrid/validators.test.ts`
- Test: `tests/unit/hybrid/postmortem-review.test.ts`
- Test: `tests/unit/hybrid/postmortem-review-llm.test.ts`
- Test: `tests/unit/runtime-service.test.ts`

- [ ] **Step 1: Write failing posttask schema tests**

Cover:
- accepted posttask output can include `injected_node_reviews[]`
- each review carries bounded verdict, confidence, and delivery recommendation
- invalid lifecycle mutation instructions are still rejected

Run:
```bash
pnpm vitest run tests/unit/hybrid/validators.test.ts tests/unit/hybrid/postmortem-review.test.ts tests/unit/hybrid/postmortem-review-llm.test.ts tests/unit/runtime-service.test.ts
```
Expected: FAIL

- [ ] **Step 2: Extend worker output shape**

Implement:
- rule fallback emits per-node `uncertain` or `harmed` recommendations where evidence allows
- LLM worker normalizes per-node review output
- no direct lifecycle mutation commands

- [ ] **Step 3: Implement runtime policy-gated writeback**

Rules:
- runtime validates worker output
- runtime maps high/medium-confidence `helped`/`harmed` into deterministic feedback application
- `uncertain` stays non-authoritative
- worker suggestions may downgrade delivery state but cannot bypass quarantine policy

- [ ] **Step 4: Re-run tests**

Run:
```bash
pnpm vitest run tests/unit/hybrid/validators.test.ts tests/unit/hybrid/postmortem-review.test.ts tests/unit/hybrid/postmortem-review-llm.test.ts tests/unit/runtime-service.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hybrid/types.ts src/hybrid/validators.ts src/hybrid/workers/postmortem-review.ts src/hybrid/workers/postmortem-review-llm.ts src/runtime/service.ts tests/unit/hybrid/validators.test.ts tests/unit/hybrid/postmortem-review.test.ts tests/unit/hybrid/postmortem-review-llm.test.ts tests/unit/runtime-service.test.ts
git commit -m "feat: add bounded per-node posttask adjudication"
```

## Final Verification

- [ ] **Step 1: Run focused governance suite**

```bash
pnpm vitest run tests/unit/delivery-state-governance.test.ts tests/unit/node-repo.test.ts tests/unit/sqlite-db.test.ts tests/unit/intervention-controller.test.ts tests/unit/runtime-service.test.ts tests/unit/interaction-service.test.ts tests/unit/hybrid/validators.test.ts tests/unit/hybrid/postmortem-review.test.ts tests/unit/hybrid/postmortem-review-llm.test.ts tests/integration/plugin-runtime.test.ts
```
Expected: PASS

- [ ] **Step 2: Run project-wide quality check**

```bash
pnpm check
```
Expected: PASS
