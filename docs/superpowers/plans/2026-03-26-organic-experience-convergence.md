# Organic Experience Convergence Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce fragmentation among organically learned experiences and let clearly high-value new lessons enter a controlled faster promotion path without making ExperienceEngine more conservative.

**Architecture:** Add family-aware merge eligibility and structured lesson-overlap scoring so near-duplicate natural experiences converge into fewer stronger nodes. Extend distillation and lifecycle state management with a `priority_candidate` path, where LLMs can recommend higher-value experiences but the runtime still applies hard promotion checks and conservative injection rules.

**Tech Stack:** TypeScript, Node.js, SQLite repositories, Vitest, existing ExperienceEngine distillation/feedback/runtime pipeline

---

## File Structure

### New files

- Create: `src/distillation/experience-family.ts`
  - Shared family classification and adjacent-family compatibility helpers for merge eligibility.
- Create: `tests/unit/experience-family.test.ts`
  - Verifies family matching and adjacency behavior.

### Existing files to modify

- Modify: `src/types/domain.ts`
  - Add `priority_candidate` state and new internal promotion metadata types.
- Modify: `src/analyzer/llm-learning-gate.ts`
  - Allow LLM learning gate output to carry `promotion_signal` and `promotion_reason`.
- Modify: `src/distillation/llm-distiller.ts`
  - Parse and preserve promotion recommendation fields from distillation output.
- Modify: `src/distillation/queue-worker.ts`
  - Expand reusable-node search beyond same `task_type`; apply family-aware merge and controlled priority promotion.
- Modify: `src/distillation/merge-decider.ts`
  - Include family compatibility and structured lesson overlap in merge payload and fallback merge logic.
- Modify: `src/feedback/state-transition.ts`
  - Add `priority_candidate` transitions and downgrade behavior.
- Modify: `src/controller/intervention-controller.ts`
  - Permit `priority_candidate` nodes to participate in `inject_conservative` decisions.
- Modify: `src/controller/injection-scorecard.ts`
  - Surface promotion and merge diagnostics for inspect/status/doctor.
- Modify: `src/cli/commands/inspect.ts`
  - Render priority-candidate state and fast-promotion metadata.
- Modify: `src/cli/commands/status.ts`
  - Add aggregate counts for `priority_candidate` and recent convergence metrics.
- Modify: `src/cli/commands/doctor.ts`
  - Add recent convergence / fast-promotion diagnostics.
- Modify: `src/interaction/service.ts`
  - Expose convergence and promotion summaries from recent runtime activity.
- Modify: `src/store/sqlite/repositories/node-repo.ts`
  - Ensure new state and fields round-trip cleanly.

### Existing tests to modify

- Modify: `tests/unit/trigger-evaluator.test.ts`
- Modify: `tests/unit/intervention-controller.test.ts`
- Modify: `tests/unit/inspect-command.test.ts`
- Modify: `tests/unit/status-command.test.ts`
- Modify: `tests/unit/doctor-command.test.ts`
- Modify: `tests/unit/node-repo.test.ts`
- Modify: `tests/integration/plugin-runtime.test.ts`

---

### Task 1: Define family-aware convergence primitives

**Files:**
- Create: `src/distillation/experience-family.ts`
- Test: `tests/unit/experience-family.test.ts`

- [ ] **Step 1: Write the failing family tests**

```ts
import { describe, expect, it } from "vitest";
import { areTaskFamiliesMergeCompatible, resolveExperienceFamily } from "../../src/distillation/experience-family.js";

describe("experience-family", () => {
  it("groups test_debug and bug_fix into adjacent executable-debug families", () => {
    expect(resolveExperienceFamily("test_debug")).toBe(resolveExperienceFamily("bug_fix"));
    expect(areTaskFamiliesMergeCompatible("test_debug", "bug_fix")).toBe(true);
  });

  it("keeps unrelated families incompatible", () => {
    expect(areTaskFamiliesMergeCompatible("performance", "config_debug")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/unit/experience-family.test.ts`
Expected: FAIL because `experience-family.ts` does not exist yet.

- [ ] **Step 3: Implement family helpers**

```ts
// src/distillation/experience-family.ts
const FAMILY_MAP = {
  bug_fix: "execution_debug",
  test_debug: "execution_debug",
  build_debug: "execution_debug",
  config_debug: "configuration_debug",
  integration_fix: "integration_boundary",
  feature_add: "delivery_change",
  refactor: "delivery_change",
  performance: "optimization",
  general: "general"
} as const;

export const resolveExperienceFamily = (taskType: TaskType): ExperienceFamily => FAMILY_MAP[taskType];

export const areTaskFamiliesMergeCompatible = (left: TaskType, right: TaskType): boolean =>
  resolveExperienceFamily(left) === resolveExperienceFamily(right);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/unit/experience-family.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/distillation/experience-family.ts tests/unit/experience-family.test.ts
git commit -m "test: define experience-family merge helpers"
```

### Task 2: Expand merge eligibility and convergence scoring

**Files:**
- Modify: `src/distillation/queue-worker.ts`
- Modify: `src/distillation/merge-decider.ts`
- Modify: `tests/unit/intervention-controller.test.ts`
- Modify: `tests/integration/plugin-runtime.test.ts`

- [ ] **Step 1: Write the failing convergence tests**

```ts
it("updates an existing same-family node instead of adding a new near-duplicate", async () => {
  // Seed an active test_debug node about EROFS
  // Distill a bug_fix candidate carrying the same core EROFS lesson
  // Expect merge action UPDATE and support_count increment on the existing node
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/integration/plugin-runtime.test.ts -t "same-family node"`
Expected: FAIL because reusable-node search is still limited to the same `task_type`.

- [ ] **Step 3: Implement family-aware reusable-node search**

```ts
// src/distillation/queue-worker.ts
const compatibleNodes = nodeRepo
  .listByScope(candidate.scope_id)
  .filter((node) => node.node_type === candidate.node_type)
  .filter((node) => areTaskFamiliesMergeCompatible(node.task_type, candidate.task_type));

// score structured overlap
const overlapScore =
  triggerSimilarity(node.trigger_pattern, distilled.trigger_pattern) * 0.35 +
  triggerSimilarity(node.compact_hint, distilled.compact_hint) * 0.35 +
  stepOverlap(node.recommended_steps, distilled.recommended_steps) * 0.15 +
  stepOverlap(node.avoid_steps, distilled.avoid_steps) * 0.15;
```

- [ ] **Step 4: Update merge fallback policy**

```ts
// src/distillation/merge-decider.ts
// Prefer UPDATE when:
// - family compatible
// - overlap score exceeds threshold
// - existing node is active or has stronger helped/support history
```

- [ ] **Step 5: Run the focused tests**

Run: `pnpm exec vitest run tests/integration/plugin-runtime.test.ts -t "same-family node" tests/unit/intervention-controller.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/distillation/queue-worker.ts src/distillation/merge-decider.ts tests/integration/plugin-runtime.test.ts tests/unit/intervention-controller.test.ts
git commit -m "feat: converge same-family organic experience nodes"
```

### Task 3: Add high-value promotion recommendation fields

**Files:**
- Modify: `src/types/domain.ts`
- Modify: `src/analyzer/llm-learning-gate.ts`
- Modify: `src/distillation/llm-distiller.ts`
- Test: `tests/unit/node-repo.test.ts`

- [ ] **Step 1: Write the failing type and parsing tests**

```ts
it("preserves promotion recommendation metadata on distilled candidates", () => {
  // Expect promotion_signal and promotion_reason to survive parse/applyFallbacks
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/unit/node-repo.test.ts -t "promotion recommendation"`
Expected: FAIL because the metadata does not exist yet.

- [ ] **Step 3: Add promotion metadata types**

```ts
export type PromotionSignal = "normal" | "high_value";

// ExperienceNode / ExperienceCandidateDraft additions
promotion_signal?: PromotionSignal;
promotion_reason?: string;
```

- [ ] **Step 4: Extend LLM parse/passthrough flow**

```ts
// llm-learning-gate.ts / llm-distiller.ts
candidate may also include:
- promotion_signal
- promotion_reason
```

- [ ] **Step 5: Run focused tests**

Run: `pnpm exec vitest run tests/unit/node-repo.test.ts tests/unit/inspect-command.test.ts -t "promotion"`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/types/domain.ts src/analyzer/llm-learning-gate.ts src/distillation/llm-distiller.ts tests/unit/node-repo.test.ts
git commit -m "feat: carry promotion recommendation metadata"
```

### Task 4: Introduce `priority_candidate` lifecycle

**Files:**
- Modify: `src/types/domain.ts`
- Modify: `src/feedback/state-transition.ts`
- Modify: `src/controller/intervention-controller.ts`
- Modify: `src/store/sqlite/repositories/node-repo.ts`
- Modify: `tests/unit/intervention-controller.test.ts`
- Modify: `tests/unit/node-repo.test.ts`

- [ ] **Step 1: Write the failing lifecycle tests**

```ts
it("promotes high-value candidates into priority_candidate before active", () => {
  // high-value + hard quality checks => priority_candidate
});

it("allows priority candidates to inject conservatively", () => {
  // selected node state priority_candidate -> inject_conservative
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run tests/unit/intervention-controller.test.ts tests/unit/node-repo.test.ts -t "priority_candidate"`
Expected: FAIL because the state does not exist.

- [ ] **Step 3: Implement new lifecycle state**

```ts
// state-transition.ts
if (node.state === "candidate" && node.promotion_signal === "high_value" && passesPromotionChecks(node)) {
  return "priority_candidate";
}
if (node.state === "priority_candidate" && (node.helped_count >= 1 || node.support_count >= 2)) {
  return "active";
}
```

- [ ] **Step 4: Allow conservative injection from priority candidates**

```ts
// intervention-controller.ts
const selectedMode =
  topNode.state === "priority_candidate" ? "inject_conservative" : existingMode;
```

- [ ] **Step 5: Run focused tests**

Run: `pnpm exec vitest run tests/unit/intervention-controller.test.ts tests/unit/node-repo.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/types/domain.ts src/feedback/state-transition.ts src/controller/intervention-controller.ts src/store/sqlite/repositories/node-repo.ts tests/unit/intervention-controller.test.ts tests/unit/node-repo.test.ts
git commit -m "feat: add priority candidate promotion path"
```

### Task 5: Surface convergence and promotion diagnostics

**Files:**
- Modify: `src/controller/injection-scorecard.ts`
- Modify: `src/cli/commands/inspect.ts`
- Modify: `src/cli/commands/status.ts`
- Modify: `src/cli/commands/doctor.ts`
- Modify: `src/interaction/service.ts`
- Modify: `tests/unit/inspect-command.test.ts`
- Modify: `tests/unit/status-command.test.ts`
- Modify: `tests/unit/doctor-command.test.ts`

- [ ] **Step 1: Write the failing diagnostics tests**

```ts
it("shows merge decision and promotion signal in inspect output", () => {
  // expect inspect to print merge decision, promotion signal, and priority state
});

it("shows priority candidate counts in status output", () => {
  // expect status summary to include priority_candidate
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run tests/unit/inspect-command.test.ts tests/unit/status-command.test.ts tests/unit/doctor-command.test.ts`
Expected: FAIL because the new diagnostics are not rendered yet.

- [ ] **Step 3: Extend scorecards and summaries**

```ts
// scorecard fields
mergeDecision?: "ADD" | "UPDATE" | "NONE";
mergeReason?: string;
promotionSignal?: "normal" | "high_value";
priorityPromotionApplied?: boolean;
```

- [ ] **Step 4: Render the new diagnostics**

```ts
// inspect.ts / status.ts / doctor.ts
// print:
// - node state
// - promotion signal
// - fast promotion applied
// - merge decision
```

- [ ] **Step 5: Run focused tests**

Run: `pnpm exec vitest run tests/unit/inspect-command.test.ts tests/unit/status-command.test.ts tests/unit/doctor-command.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/controller/injection-scorecard.ts src/cli/commands/inspect.ts src/cli/commands/status.ts src/cli/commands/doctor.ts src/interaction/service.ts tests/unit/inspect-command.test.ts tests/unit/status-command.test.ts tests/unit/doctor-command.test.ts
git commit -m "feat: report convergence and priority promotion diagnostics"
```

### Task 6: End-to-end validation on organic learning

**Files:**
- Modify: `tests/integration/plugin-runtime.test.ts`
- Modify: `tests/unit/runtime-service.test.ts`

- [ ] **Step 1: Write the failing end-to-end tests**

```ts
it("converges repeated same-family organic lessons into one stronger node", async () => {
  // replay nearby bug_fix/test_debug EROFS runs
  // expect one dominant node with support_count increment
});

it("lets a high-value first-seen lesson enter priority_candidate", async () => {
  // replay a successful, structured troubleshooting lesson
  // expect priority_candidate rather than plain candidate
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/integration/plugin-runtime.test.ts -t "organic lesson"`
Expected: FAIL because current convergence and promotion logic still fragment or leave nodes in plain candidate.

- [ ] **Step 3: Implement minimal fixes required by the red tests**

```ts
// wire the queue-worker + state transitions + runtime summaries together
// do not add extra product-facing features beyond the spec
```

- [ ] **Step 4: Run full validation**

Run: `pnpm exec vitest run tests/unit/experience-family.test.ts tests/unit/lexical-retriever.test.ts tests/unit/candidate-retriever.test.ts tests/unit/intervention-controller.test.ts tests/unit/node-repo.test.ts tests/unit/inspect-command.test.ts tests/unit/status-command.test.ts tests/unit/doctor-command.test.ts tests/unit/runtime-service.test.ts tests/integration/plugin-runtime.test.ts`
Expected: PASS

- [ ] **Step 5: Run typecheck and build**

Run: `pnpm exec tsc -p tsconfig.json --noEmit && pnpm build`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add tests/integration/plugin-runtime.test.ts tests/unit/runtime-service.test.ts
git commit -m "test: validate organic experience convergence flow"
```

---

Plan complete and saved to `docs/superpowers/plans/2026-03-26-organic-experience-convergence.md`. Ready to execute?
