# Three-Layer Retrieval And Injection Implementation Plan

> Superseded by [2026-03-26-best-practice-retrieval-architecture.md](./2026-03-26-best-practice-retrieval-architecture.md) for the current best-practice target.
>
> This plan remains useful as the historical execution record for the earlier three-layer rollout, but it should no longer be treated as the active end-state implementation plan.

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move ExperienceEngine toward a three-layer retrieval and injection architecture, beginning with a lighter selective gate and a strong-candidate fast path so obviously relevant experience stops being skipped in real Codex usage.

**Architecture:** Keep the existing retrieval pipeline in place for phase 1, but stop using the current trigger gate as a second retrieval system. Add a candidate-quality decision layer and a strong-candidate fast path on top of `retrieveCandidates()`, then surface explainable decision reasons in scorecards and inspection output. Leave lexical/BM25 retrieval and fusion as a second phase with clear extension points.

**Tech Stack:** TypeScript, current controller pipeline (`candidate-retriever`, `intervention-controller`, `trigger-evaluator`), SQLite-backed scorecards, Vitest, existing CLI diagnostics.

---

### Task 1: Lock in phase-1 decision behavior with failing tests

**Files:**
- Modify: `tests/unit/intervention-controller.test.ts`
- Reference: `docs/superpowers/specs/2026-03-25-three-layer-retrieval-injection-design.md`

- [ ] **Step 1: Add failing intervention-controller tests for the new phase-1 behavior**

Extend `tests/unit/intervention-controller.test.ts` to cover:
- `decideIntervention()` injects or injects conservatively when top candidate quality is strong
- `decideIntervention()` skips when candidates are weak or ambiguous
- the fast path prefers the strong top candidate even when prompt wording is long/noisy

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run:

```bash
pnpm exec vitest run tests/unit/intervention-controller.test.ts
```

Expected:
- FAIL on the new phase-1 assertions

- [ ] **Step 3: Commit the failing tests**

```bash
git add tests/unit/intervention-controller.test.ts
git commit -m "test: define phase-one retrieval gate behavior"
```

### Task 2: Refactor trigger evaluation around candidate quality

**Files:**
- Modify: `src/controller/candidate-retriever.ts`
- Modify: `src/controller/node-ranker.ts` only if ranked metadata needs to remain attached after ranking
- Modify: `src/controller/trigger-evaluator.ts`
- Modify: `src/controller/intervention-controller.ts`
- Modify: `src/controller/injection-scorecard.ts` only if shared decision reasons/helpers are needed
- Modify: `tests/unit/candidate-retriever.test.ts`
- Modify: `tests/unit/trigger-evaluator.test.ts`
- Test: `tests/unit/candidate-retriever.test.ts`
- Test: `tests/unit/trigger-evaluator.test.ts`
- Test: `tests/unit/intervention-controller.test.ts`

- [ ] **Step 1: Introduce a candidate-quality input shape and scaffolding tests**

In `src/controller/candidate-retriever.ts`, change the retrieval boundary so phase-1 logic can carry candidate metadata forward. Introduce a scored-candidate structure that can supply:
- top candidate score
- score margin
- scope match
- task family match
- node state
- helped/harmed summary
- validation state
- runtime evidence such as failure/retry/user-correction

If `src/controller/node-ranker.ts` strips needed metadata, update it or add an equivalent metadata-preserving path before `decideIntervention()` consumes the results.

Keep this structure small and explainable. Do not add BM25 or rerank-specific fields yet.

Then extend `tests/unit/trigger-evaluator.test.ts` to cover:
- a strong same-scope active candidate with positive `helped_count` passes without requiring `0.5` lexical overlap
- a weak candidate still fails
- failure or retry signals still short-circuit to allow injection

Also extend `tests/unit/candidate-retriever.test.ts` to cover the new scored-candidate boundary:
- retrieved candidates carry semantic/fused score metadata
- top1/top2 score margin can be derived from the returned structure
- any ranking step used before `decideIntervention()` preserves the metadata instead of collapsing back to bare `ExperienceNode[]`

- [ ] **Step 2: Run the targeted tests to verify the new API and gate rules fail first**

Run:

```bash
pnpm exec vitest run tests/unit/candidate-retriever.test.ts tests/unit/trigger-evaluator.test.ts tests/unit/intervention-controller.test.ts
```

Expected:
- FAIL on the new evaluator API/behavior assertions

- [ ] **Step 3: Implement the lighter selective gate**

Replace the current lexical-heavy decision with a rule set that:
- still fast-paths on runtime failure/retry evidence
- uses candidate-quality signals as the primary decision input
- treats lexical overlap as a secondary hint, not the main veto
- can still return `false` for weak or ambiguous candidates

The result should answer:
- "is this candidate set strong enough to inject?"
- not "does the prompt lexically resemble the trigger string?"

- [ ] **Step 4: Add the strong-candidate fast path in intervention-controller**

In `src/controller/intervention-controller.ts`:
- inspect the retrieved top candidates and their metadata
- detect "obvious wins" such as:
  - same scope
  - same task family
  - `state = active`
  - positive helped history
  - validated reuse or equivalent maturity
  - clear score lead over the next candidate
- choose `inject` or `inject_conservative` before the general gate can veto them

Keep the selection rules deterministic and host-agnostic.

At the same time, extend the intervention decision payload so controller-level diagnostics can be carried forward into runtime scorecards, for example:
- top candidates considered
- top candidate score
- score margin
- fast-path applied / not applied
- final gate reason

- [ ] **Step 5: Re-run the targeted tests**

Run:

```bash
pnpm exec vitest run tests/unit/candidate-retriever.test.ts tests/unit/trigger-evaluator.test.ts tests/unit/intervention-controller.test.ts
```

Expected:
- PASS

- [ ] **Step 6: Commit the phase-1 decision logic**

```bash
git add src/controller/candidate-retriever.ts src/controller/node-ranker.ts src/controller/trigger-evaluator.ts src/controller/intervention-controller.ts src/controller/injection-scorecard.ts tests/unit/candidate-retriever.test.ts tests/unit/trigger-evaluator.test.ts tests/unit/intervention-controller.test.ts
git commit -m "feat: add candidate-quality retrieval gate"
```

### Task 3: Make decision reasons visible in scorecards and inspection

**Files:**
- Modify: `src/controller/injection-scorecard.ts`
- Modify: `src/types/domain.ts`
- Modify: `src/cli/commands/inspect.ts`
- Modify: `src/runtime/service.ts`
- Modify: `src/controller/intervention-controller.ts`
- Test: `tests/unit/inspect-command.test.ts`
- Test: `tests/unit/runtime-service.test.ts`

- [ ] **Step 1: Add failing tests for richer decision explainability**

Extend:
- `tests/unit/runtime-service.test.ts` to assert persisted scorecards include the new decision reasons
- `tests/unit/inspect-command.test.ts` to assert `ee inspect --last` prints the new retrieval/gate reasoning in a concise way

The assertions should cover fields such as:
- top candidates
- semantic score
- lexical score when available
- fused score
- task family match
- top score
- score margin
- fast-path applied / not applied
- gate reason
- final decision reason

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run:

```bash
pnpm exec vitest run tests/unit/runtime-service.test.ts tests/unit/inspect-command.test.ts
```

Expected:
- FAIL on the new scorecard/inspect expectations

- [ ] **Step 3: Extend the scorecard payload**

In `src/types/domain.ts` and `src/controller/injection-scorecard.ts`, add compact explainability fields, for example:
- `topCandidates`
- `semanticScore`
- `lexicalScore`
- `fusedScore`
- `taskFamilyMatch`
- `topCandidateScore`
- `scoreMargin`
- `fastPathApplied`
- `gateReason`
- `decisionReason`

Persist only the minimum information needed for operator debugging and regression analysis.

Update `src/runtime/service.ts` so the richer decision/scorecard payload is carried into `injection_events.scorecard_json` during live runtime writes.

If `buildInjectionScorecard()` cannot derive these fields from selected nodes alone, thread the controller diagnostics through `InterventionDecision` in `src/controller/intervention-controller.ts` and consume that payload from `src/runtime/service.ts`.

- [ ] **Step 4: Update inspection output**

In `src/cli/commands/inspect.ts`, print the new fields in a short, readable format so operators can tell:
- whether candidates existed
- whether fast path fired
- why the final mode was `inject`, `inject_conservative`, or `skip`

- [ ] **Step 5: Re-run the targeted tests**

Run:

```bash
pnpm exec vitest run tests/unit/runtime-service.test.ts tests/unit/inspect-command.test.ts
```

Expected:
- PASS

- [ ] **Step 6: Commit the explainability changes**

```bash
git add src/types/domain.ts src/controller/intervention-controller.ts src/controller/injection-scorecard.ts src/runtime/service.ts src/cli/commands/inspect.ts tests/unit/runtime-service.test.ts tests/unit/inspect-command.test.ts
git commit -m "feat: expose retrieval decision reasons"
```

### Task 4: Guard the operator surfaces against regression

**Files:**
- Modify: `src/cli/commands/doctor.ts`
- Modify: `src/cli/commands/status.ts`
- Modify: `src/cli/dispatch.ts`
- Modify: `src/interaction/service.ts`
- Test: `tests/unit/doctor-command.test.ts`
- Test: `tests/unit/status-command.test.ts`

- [ ] **Step 1: Add failing diagnostics tests**

Extend:
- `tests/unit/doctor-command.test.ts`
- `tests/unit/status-command.test.ts`

to assert that diagnostics remain product-readable after the gate changes and can still summarize:
- injection activity
- current retrieval mode
- recent skip/inject behavior

Do not require full scorecard dumps here; assert only stable summary lines.

- [ ] **Step 2: Run the targeted diagnostics tests**

Run:

```bash
pnpm exec vitest run tests/unit/doctor-command.test.ts tests/unit/status-command.test.ts
```

Expected:
- FAIL if summaries or wording no longer reflect the new gate behavior

- [ ] **Step 3: Update doctor/status summaries**

First add or extend a shared runtime summary helper in `src/interaction/service.ts` so operator commands can query:
- recent injection count
- recent skip count
- recent inject / inject_conservative count
- whether strong-candidate fast path has fired recently

Then modify `src/cli/commands/doctor.ts` and `src/cli/commands/status.ts` so they can summarize the new decision model without overwhelming users.

If `ee status` is not currently routed in `src/cli/dispatch.ts`, add or restore that route so the operator surface described in the spec is actually executable from the CLI.

Keep the output focused on:
- whether retrieval is active
- whether recent decisions are mostly skip or inject
- whether the system is now seeing strong candidates but still skipping

- [ ] **Step 4: Re-run the targeted diagnostics tests**

Run:

```bash
pnpm exec vitest run tests/unit/doctor-command.test.ts tests/unit/status-command.test.ts
```

Expected:
- PASS

- [ ] **Step 5: Commit the diagnostics updates**

```bash
git add src/interaction/service.ts src/cli/dispatch.ts src/cli/commands/doctor.ts src/cli/commands/status.ts tests/unit/doctor-command.test.ts tests/unit/status-command.test.ts
git commit -m "feat: summarize retrieval gate health"
```

### Task 5: Prove the phase-1 fix in real Codex runtime

**Files:**
- No new source files required
- Reference: `AGENTS.md` in repo root if present from Codex install
- Reference: real DB at `~/.experienceengine/sqlite/experienceengine.db`

- [ ] **Step 1: Rebuild the runtime**

Run:

```bash
pnpm build
```

Expected:
- PASS

- [ ] **Step 2: Re-run real Codex task prompts that previously skipped**

Run one or more real `codex exec` prompts that are intentionally close to the known mature nodes, such as:

```bash
codex exec "Fix the failing payments auth test in ExperienceEngine. Keep the fix narrow, inspect the repo first, and explain the likely root cause and first corrective step. Do not modify files."
```

Expected:
- Codex naturally calls `experienceengine_lookup_hints`
- the result is no longer an obvious false-negative `skip`

- [ ] **Step 3: Verify DB evidence**

Inspect the SQLite DB or equivalent CLI outputs to confirm:
- new `task_runs` rows with `host = codex`
- corresponding `injection_events`
- decision modes reflect the new phase-1 logic

Representative checks:

```bash
node dist/cli/index.js inspect --last
sqlite3 ~/.experienceengine/sqlite/experienceengine.db "SELECT host, session_id, final_status FROM task_runs ORDER BY created_at DESC LIMIT 5;"
sqlite3 ~/.experienceengine/sqlite/experienceengine.db "SELECT session_id, mode, injection_count FROM injection_events ORDER BY created_at DESC LIMIT 5;"
```

Expected:
- recent Codex sessions appear
- at least one of the previously skipped prompts now injects or injects conservatively

- [ ] **Step 4: Run the focused regression suite**

Run:

```bash
pnpm exec vitest run tests/unit/trigger-evaluator.test.ts tests/unit/intervention-controller.test.ts tests/unit/runtime-service.test.ts tests/unit/inspect-command.test.ts tests/unit/doctor-command.test.ts tests/unit/status-command.test.ts tests/unit/codex-mcp-server.test.ts tests/integration/plugin-runtime.test.ts
pnpm exec tsc -p tsconfig.json --noEmit
```

Expected:
- PASS

- [ ] **Step 5: Commit the runtime verification notes**

If any source files changed during verification cleanups:

```bash
git add <changed-files>
git commit -m "test: verify phase-one codex retrieval runtime"
```

If no source files changed, record the verification outcome in the execution log instead of creating an empty commit.

### Task 6: Queue phase-2 retrieval work without implementing it yet

**Files:**
- Modify: `docs/superpowers/specs/2026-03-25-three-layer-retrieval-injection-design.md` only if implementation findings require a small addendum
- Optionally create: `docs/superpowers/plans/2026-03-25-hybrid-retrieval-followup.md` only if phase-2 needs a dedicated follow-up plan immediately

- [ ] **Step 1: Record phase-1 findings**

After the runtime verification, capture:
- what signals were most predictive
- whether lexical overlap still has any residual value
- which candidate-quality thresholds were needed

- [ ] **Step 2: Decide whether phase-2 needs its own follow-up plan now**

If phase-1 clearly resolves the current blocker and no immediate retrieval expansion is required, stop here.

If phase-2 should begin immediately, create a follow-up plan focused only on:
- BM25/sparse retrieval
- rank fusion
- rerank interface

- [ ] **Step 3: Commit only if docs changed**

```bash
git add docs/superpowers/specs/2026-03-25-three-layer-retrieval-injection-design.md docs/superpowers/plans/2026-03-25-hybrid-retrieval-followup.md
git commit -m "docs: capture phase-one retrieval findings"
```

---

## Phase-1 Findings

- The live blocker was in the decision layer, not primary retrieval. Real runtime checks showed the mature `payments auth` node was already being retrieved, but a hard gate still returned `skip`.
- `scoreMargin` cannot be treated as a strict fast-path requirement when the competing runner-up is an immature `candidate` with no helped history. In the real Codex scope, fresh sandbox-related candidates compressed the margin enough to suppress a clearly reusable active node.
- The phase-1 fix keeps the gate quality-driven while allowing a mature same-scope active node to bypass immature competition. This is what moved the real Codex `payments auth` prompt from `skip` to `inject`.
- The new `doctor/status/scorecard` summaries are necessary, not optional. They exposed the real failure mode quickly:
  - top candidates existed
  - the top score was strong
  - fast path did not fire
  - the decision still ended in `candidate_quality_rejected`
- Phase 2 should still target lexical/BM25 and fusion, but phase 1 already resolved the current production-style false negative without requiring retrieval replacement.
