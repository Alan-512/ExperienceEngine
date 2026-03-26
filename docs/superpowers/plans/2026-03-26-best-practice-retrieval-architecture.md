# Best-Practice Retrieval Architecture Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade ExperienceEngine from the current intermediate retrieval stack to a best-practice retrieval architecture that is robust to paraphrases, investigation prompts, and long/noisy task descriptions.

**Architecture:** Keep the current hybrid retrieval, selective gate, and fast-path work. Next, fix input/outcome hygiene, then promote reranking from an interface to a real product stage, then add query rewriting/contextual retrieval as a controlled enhancement. Preserve diagnostics at every step.

**Tech Stack:** TypeScript, current controller/runtime pipeline, SQLite scorecards, Vitest, current CLI diagnostics.

## Current State Before This Plan

The repository has already completed most of the original "intermediate retrieval stack" upgrade work.

What is already in place now:

- input hygiene for investigation-style prompts
- hybrid retrieval using dense + lexical/BM25-style scoring
- fused scoring across retrieval channels
- reranking as an active retrieval stage
- contextual query rewriting
- selective gate based on candidate quality
- strong-candidate fast path
- retrieval diagnostics visible through `inspect`, `doctor`, and `status`
- real Codex-host evidence for:
  - live injection
  - query rewrite participation
  - rerank participation
  - fast-path participation

That means this plan should no longer be interpreted as "build the first usable retrieval architecture."

It should be interpreted as:

> complete and harden the path from a production-capable best-practice-oriented retrieval stack
> toward a fuller best-practice end-state

## What Still Counts As Remaining Best-Practice Work

Even after the currently implemented work, the following still remain outside the fully maxed-out end-state:

- a more explicit standalone BM25 subsystem
- model-grade reranker support
- richer contextual retrieval beyond bounded query rewriting
- more advanced routing / uncertainty-aware retrieval control
- broader repeated host validation beyond the strongest current Codex evidence

Those items should be treated as next-stage enhancement work, not as proof that the current production retrieval path is still "unfinished" in a basic sense.

---

### Task 1: Fix investigation-prompt outcome hygiene

**Files:**
- Modify: `src/input/outcome-resolver.ts`
- Modify: `src/input/input-adapter.ts`
- Test: `tests/unit/outcome-resolver.test.ts`
- Test: `tests/unit/input-adapter.test.ts` (create if missing)

- [ ] **Step 1: Add failing tests for investigation-style prompts**

Cover:
- prompts containing words like `regression` do not become `outcome_signal = failure` before any real tool failure exists
- investigation/read-only prompts default to `unknown`
- explicit tool failures still resolve to `failure`

- [ ] **Step 2: Run the targeted tests to confirm the bug**

```bash
pnpm exec vitest run tests/unit/outcome-resolver.test.ts tests/unit/input-adapter.test.ts
```

- [ ] **Step 3: Implement intent-safe outcome resolution**

Make sure:
- prompt wording does not masquerade as observed failure
- runtime failure is driven by tool evidence or final outcome evidence, not by issue nouns in the prompt

- [ ] **Step 4: Re-run targeted tests**

```bash
pnpm exec vitest run tests/unit/outcome-resolver.test.ts tests/unit/input-adapter.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/input/outcome-resolver.ts src/input/input-adapter.ts tests/unit/outcome-resolver.test.ts tests/unit/input-adapter.test.ts
git commit -m "fix: keep investigation prompts out of failure state"
```

### Task 2: Promote reranking from interface to product stage

**Files:**
- Modify: `src/controller/candidate-retriever.ts`
- Modify: `src/controller/intervention-controller.ts`
- Modify: `src/controller/injection-scorecard.ts`
- Modify: `src/types/domain.ts`
- Modify: `src/cli/commands/inspect.ts`
- Test: `tests/unit/candidate-retriever.test.ts`
- Test: `tests/unit/intervention-controller.test.ts`
- Test: `tests/unit/inspect-command.test.ts`

- [ ] **Step 1: Add failing tests for default rerank participation**

Cover:
- reranking can participate without a custom test-only callback
- rerank score affects top candidate ordering for close hybrid candidates
- scorecard/inspect show rerank diagnostics

- [ ] **Step 2: Run the targeted tests**

```bash
pnpm exec vitest run tests/unit/candidate-retriever.test.ts tests/unit/intervention-controller.test.ts tests/unit/inspect-command.test.ts
```

- [ ] **Step 3: Implement a product rerank stage**

Start with a bounded, explainable stage:
- top-N rerank window only
- deterministic input shape
- explicit weighting against fused score
- no black-box replacement of the whole retrieval stack

If no external reranker is enabled, keep behavior stable and diagnosable.

- [ ] **Step 4: Re-run targeted tests**

```bash
pnpm exec vitest run tests/unit/candidate-retriever.test.ts tests/unit/intervention-controller.test.ts tests/unit/inspect-command.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/controller/candidate-retriever.ts src/controller/intervention-controller.ts src/controller/injection-scorecard.ts src/types/domain.ts src/cli/commands/inspect.ts tests/unit/candidate-retriever.test.ts tests/unit/intervention-controller.test.ts tests/unit/inspect-command.test.ts
git commit -m "feat: promote reranking to retrieval stage"
```

### Task 3: Add contextual retrieval / query rewriting

**Files:**
- Modify: `src/controller/candidate-retriever.ts`
- Add: `src/controller/query-rewrite.ts`
- Test: `tests/unit/candidate-retriever.test.ts`
- Test: `tests/unit/query-rewrite.test.ts`

- [ ] **Step 1: Add failing tests for paraphrase robustness**

Cover:
- long investigation prompts still retrieve the intended mature node family
- read-only analysis prompts do not bury the core task signal
- query rewriting/context enrichment is reflected in diagnostics

- [ ] **Step 2: Run the targeted tests**

```bash
pnpm exec vitest run tests/unit/candidate-retriever.test.ts tests/unit/query-rewrite.test.ts
```

- [ ] **Step 3: Implement bounded contextual retrieval**

Requirements:
- keep the rewritten/enriched query short and deterministic
- only enrich when raw prompt shape is likely to hurt retrieval
- preserve explainability

- [ ] **Step 4: Re-run targeted tests**

```bash
pnpm exec vitest run tests/unit/candidate-retriever.test.ts tests/unit/query-rewrite.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/controller/candidate-retriever.ts src/controller/query-rewrite.ts tests/unit/candidate-retriever.test.ts tests/unit/query-rewrite.test.ts
git commit -m "feat: add contextual retrieval rewriting"
```

### Task 4: Extend operator diagnostics

**Files:**
- Modify: `src/cli/commands/doctor.ts`
- Modify: `src/cli/commands/status.ts`
- Modify: `src/interaction/service.ts`
- Test: `tests/unit/doctor-command.test.ts`
- Test: `tests/unit/status-command.test.ts`

- [ ] **Step 1: Add failing diagnostics tests**

Cover:
- recent runs indicate whether contextual retrieval fired
- recent runs indicate whether reranking participated
- summaries stay compact and operator-readable

- [ ] **Step 2: Run targeted tests**

```bash
pnpm exec vitest run tests/unit/doctor-command.test.ts tests/unit/status-command.test.ts
```

- [ ] **Step 3: Implement compact summaries**

Show:
- recent rerank participation count
- recent contextual retrieval usage
- recent inject/skip mix after the retrieval upgrade

- [ ] **Step 4: Re-run targeted tests**

```bash
pnpm exec vitest run tests/unit/doctor-command.test.ts tests/unit/status-command.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/doctor.ts src/cli/commands/status.ts src/interaction/service.ts tests/unit/doctor-command.test.ts tests/unit/status-command.test.ts
git commit -m "feat: report retrieval-stage diagnostics"
```

### Task 5: Real-host validation

**Files:**
- No new product files required
- Reference: `docs/superpowers/specs/2026-03-26-best-practice-retrieval-architecture-design.md`

- [ ] **Step 1: Run real Codex validation**

Verify in a real repository:
- `experienceengine_lookup_hints` is called naturally
- a paraphrased investigation prompt no longer skips unexpectedly
- `experienceengine_finalize_task` lands a `host=codex` task run

- [ ] **Step 2: Inspect runtime evidence**

Use:

```bash
ee inspect --last
ee doctor codex
ee status
```

And inspect SQLite records if needed.

- [ ] **Step 3: Record findings**

Capture:
- whether query rewriting helped
- whether reranking changed top candidate order
- whether any new over-injection appeared

- [ ] **Step 4: Commit findings if docs are updated**

```bash
git add docs/...
git commit -m "docs: capture best-practice retrieval validation findings"
```

### Final Verification

- [ ] Run the focused retrieval suite

```bash
pnpm exec vitest run tests/unit/candidate-retriever.test.ts tests/unit/intervention-controller.test.ts tests/unit/outcome-resolver.test.ts tests/unit/input-adapter.test.ts tests/unit/inspect-command.test.ts tests/unit/doctor-command.test.ts tests/unit/status-command.test.ts tests/unit/runtime-service.test.ts tests/unit/codex-mcp-server.test.ts tests/integration/plugin-runtime.test.ts
```

- [ ] Run typecheck and build

```bash
pnpm exec tsc -p tsconfig.json --noEmit
pnpm build
```

- [ ] Run real Codex smoke once more

Use a paraphrased, read-only investigation prompt and verify:
- natural lookup
- stable inject/skip decision
- finalized runtime evidence
