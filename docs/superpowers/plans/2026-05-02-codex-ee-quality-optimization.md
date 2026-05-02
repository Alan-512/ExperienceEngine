# Codex EE Quality Optimization Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ExperienceEngine more visibly useful in Codex by explaining skip decisions, using structured match evidence, promoting proven same-scope experience faster, and allowing direct injection when trust and match quality are both high.

**Architecture:** Keep the existing LLM usage model: posttask distillation remains the learning path, and selective sync second-opinion remains the optional high-risk review path. Add deterministic retrieval-governance layers between retrieval and delivery: structured match scorecards, explicit skip reasons, direct/conservative/skip routing bands, and lifecycle promotion rules that turn successful same-scope reuse into eligible direct injection.

**Tech Stack:** TypeScript, Vitest, node:sqlite, existing ExperienceEngine controller/runtime/interaction services, Codex MCP integration

---

## Audit Baseline

This plan is grounded in the local Codex audit from `2026-04-11` through `2026-05-02`.

Observed state:
- Codex runtime is wired and active through MCP.
- Real data root: `/home/seed/.experienceengine`, symlinked to `/mnt/d/ExperienceEngineData/.experienceengine`.
- Codex had 99 task runs in the audit window.
- Injection happened, but it was concentrated in the `ExperienceEngine` scope.
- Other active repos such as `函数绘图` and `模拟射箭` produced concrete learned nodes but did not show comparable reuse.
- Most learned nodes stayed in `shadow_only` or `conservative_only`; very few reached `active / eligible`.
- The shell-level `ee` command was not discoverable even though the Codex MCP runtime was active.

Product diagnosis:
- EE is learning, but visible reuse is too conservative.
- The product is conservative in the wrong place: it should be strict about match boundaries, but decisive once a high-trust node has a high-quality match.
- Skip decisions are not explainable enough for operators to distinguish "no candidate" from "withheld by governance".
- Promotion from learned candidate to direct-injectable guidance is too slow for same-scope repeated problems.

## Non-Goals

- Do not add a new LLM call path for ordinary retrieval.
- Do not make every learned candidate directly injectable.
- Do not weaken quarantine, harmed-signal, or delivery-state safeguards.
- Do not widen cross-scope reuse before same-scope behavior is validated.
- Do not reframe manual helped/harmed feedback as required for normal operation.

## LLM Boundary

This rollout keeps the existing LLM boundaries:

- **Posttask distillation / learning gate:** LLM may summarize experience and determine whether the task produced reusable learning.
- **Selective sync second-opinion:** LLM may review high-risk or ambiguous live decisions when the configured gate asks for it.

Ordinary retrieval, match scorecard construction, skip explanation, delivery routing, and lifecycle promotion should be deterministic and testable without calling an LLM.

## Desired Delivery Policy

Use a two-axis decision model:

- **Trust:** Is the experience itself reliable?
- **Match:** Is this task structurally the same kind of problem?

Decision bands:

- operator-facing `direct inject`: high trust + high match.
- `inject_conservative`: high trust + medium match, or medium trust + high match.
- `skip`: low match, low trust, quarantine/harm risk, holdout, or no usable candidate.

Internal naming must stay aligned with current code:
- direct injection maps to existing `InjectionMode` value `inject`
- conservative injection maps to `inject_conservative`
- skip maps to `skip`

Do not introduce a new internal enum value named `direct_inject` unless the whole codebase is intentionally migrated.

Key product rule:

> ExperienceEngine should be conservative about match boundaries, not about using proven guidance after the match is clear.

## File Map

**Core matching and routing**
- Modify: `src/types/domain.ts`
- Modify: `src/controller/candidate-retriever.ts`
- Modify: `src/controller/trigger-evaluator.ts`
- Modify: `src/controller/intervention-controller.ts`
- Modify: `src/controller/injection-scorecard.ts`
- Test: `tests/unit/candidate-retriever.test.ts`
- Test: `tests/unit/trigger-evaluator.test.ts`
- Test: `tests/unit/intervention-controller.test.ts`

**Lifecycle and feedback governance**
- Modify: `src/experience-management/node-lifecycle-governance.ts`
- Modify: `src/feedback/automatic-attribution.ts`
- Modify: `src/feedback/feedback-manager.ts`
- Modify: `src/feedback/state-transition.ts`
- Modify: `src/runtime/service.ts`
- Modify: `src/store/sqlite/repositories/node-repo.ts`
- Test: `tests/unit/runtime-service.test.ts`
- Test: `tests/unit/node-repo.test.ts`

**Explainability and operator surfaces**
- Modify: `src/interaction/service.ts`
- Modify: `src/cli/commands/inspect.ts`
- Modify: `src/cli/commands/status.ts`
- Modify: `src/cli/commands/doctor.ts`
- Test: `tests/unit/interaction-service.test.ts`
- Test: `tests/unit/inspect-command.test.ts`
- Test: `tests/unit/status-command.test.ts`
- Test: `tests/unit/doctor-command.test.ts`

**Persistence and diagnostics**
- Modify: `src/store/sqlite/schema.sql`
- Modify: `src/store/sqlite/db.ts`
- Modify if broadening existing events: `src/store/sqlite/repositories/injection-repo.ts`
- Create if adding a new decision table: `src/store/sqlite/repositories/intervention-decision-event-repo.ts`
- Test: `tests/unit/sqlite-db.test.ts`

**Docs**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/development/inspect-last-layering-spec.md`
- Modify: `docs/development/codex-runtime-validation.md`
- Modify if user-facing behavior changes: `docs/user-guide.md`
- Modify release notes when shipped: `docs/releases/<version>.md`

---

## Task 1: Persist All Delivery Decisions, Including Skip

**Files:**
- Modify: `src/types/domain.ts`
- Modify: `src/store/sqlite/schema.sql`
- Modify: `src/store/sqlite/db.ts`
- Modify if broadening existing events: `src/store/sqlite/repositories/injection-repo.ts`
- Create if adding a new decision table: `src/store/sqlite/repositories/intervention-decision-event-repo.ts`
- Modify: `src/runtime/service.ts`
- Modify: `src/controller/intervention-controller.ts`
- Modify: `src/controller/trigger-evaluator.ts`
- Modify: `src/controller/injection-scorecard.ts`
- Modify: `src/interaction/service.ts`
- Modify: `src/cli/commands/inspect.ts`
- Test: `tests/unit/sqlite-db.test.ts`
- Test: `tests/unit/runtime-service.test.ts`
- Test: `tests/unit/intervention-controller.test.ts`
- Test: `tests/unit/trigger-evaluator.test.ts`
- Test: `tests/unit/interaction-service.test.ts`
- Test: `tests/unit/inspect-command.test.ts`

- [ ] **Step 1: Define a persisted decision model**

Current implementation detail to fix first:
- `InjectionEvent.mode` currently excludes `skip`.
- `runtime/service.ts` only writes an injection event when `decision.mode !== "skip"`.
- On skip, runtime clears `session.lastInjectionEvent`, so `inspect --last` cannot explain the skipped decision after the fact.

Introduce either:
- a new `intervention_decision_events` table, or
- a backward-compatible broadening of `injection_events` into delivery-decision events.

Prefer the additive new table if it keeps existing injection-event semantics simpler. The persisted decision must store:
- session id
- scope id
- task type
- task summary
- planned decision mode: `inject | inject_conservative | skip`
- effective mode after evaluation delivery: `inject | inject_conservative | skip | shadow`
- delivery mode: `live | holdout | shadow`
- delivered boolean
- selected node ids
- top withheld candidate ids
- scorecard or diagnostics JSON
- primary skip reason when mode is `skip`
- created time

The persisted model must distinguish "no usable guidance" from "usable guidance withheld by holdout/shadow evaluation". Do not collapse shadow or holdout withholding into an unexplained plain skip.

- [ ] **Step 2: Define skip reason types**

Add a typed reason set such as:

```ts
export type SkipReason =
  | "no_candidate"
  | "unknown_task_type"
  | "scope_mismatch"
  | "task_type_mismatch"
  | "tech_stack_mismatch"
  | "failure_signature_mismatch"
  | "artifact_mismatch"
  | "negative_evidence"
  | "withheld_low_confidence"
  | "withheld_delivery_state"
  | "quarantined_or_recent_harm"
  | "holdout"
  | "second_opinion_skip";
```

Keep existing string reasons mapped into this enum instead of deleting them abruptly.

- [ ] **Step 3: Add failing persistence and skip-explanation tests**

Cover:
- runtime persists a decision record when `decision.mode === "skip"`
- `inspect --last` can explain the most recent skip after a skipped prompt build
- no candidate returns `no_candidate`
- unknown task type returns `unknown_task_type`
- candidate found but low match returns `withheld_low_confidence`
- candidate found but quarantined returns `quarantined_or_recent_harm`
- holdout returns `holdout`
- second-opinion rejection returns `second_opinion_skip`

Run:

```bash
pnpm vitest run tests/unit/sqlite-db.test.ts tests/unit/runtime-service.test.ts tests/unit/trigger-evaluator.test.ts tests/unit/intervention-controller.test.ts tests/unit/interaction-service.test.ts tests/unit/inspect-command.test.ts
```

Expected: FAIL until structured reasons are propagated.

- [ ] **Step 4: Persist reason in scorecard/event payloads**

Ensure `InjectionScorecard` or the new decision diagnostics payload carries:
- primary skip reason
- human-readable explanation
- top withheld candidate id when applicable
- delivery-state reason when applicable

If `InjectionScorecard.mode` remains `Exclude<InjectionMode, "skip">`, create a separate `DecisionScorecard` or intentionally widen the scorecard type. Do not force skip into a type that still excludes skip.

- [ ] **Step 5: Render reasons in inspect surfaces**

Update `inspect --last`, host-native routine explanation, and interaction service output so a skipped decision can say:

```text
skip: withheld_low_confidence
Reason: A candidate was found, but failure signature and artifact signals did not match this task.
```

- [ ] **Step 6: Run tests**

Run:

```bash
pnpm vitest run tests/unit/sqlite-db.test.ts tests/unit/runtime-service.test.ts tests/unit/trigger-evaluator.test.ts tests/unit/intervention-controller.test.ts tests/unit/interaction-service.test.ts tests/unit/inspect-command.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/types/domain.ts src/store/sqlite/schema.sql src/store/sqlite/db.ts src/store/sqlite/repositories/injection-repo.ts src/store/sqlite/repositories/intervention-decision-event-repo.ts src/runtime/service.ts src/controller/intervention-controller.ts src/controller/trigger-evaluator.ts src/controller/injection-scorecard.ts src/interaction/service.ts src/cli/commands/inspect.ts tests/unit/sqlite-db.test.ts tests/unit/runtime-service.test.ts tests/unit/trigger-evaluator.test.ts tests/unit/intervention-controller.test.ts tests/unit/interaction-service.test.ts tests/unit/inspect-command.test.ts
git commit -m "feat: persist and explain delivery decisions"
```

## Task 2: Introduce Match Scorecard

**Files:**
- Modify: `src/types/domain.ts`
- Modify: `src/controller/candidate-retriever.ts`
- Modify: `src/controller/injection-scorecard.ts`
- Modify: `src/interaction/service.ts`
- Modify: `src/cli/commands/inspect.ts`
- Test: `tests/unit/candidate-retriever.test.ts`
- Test: `tests/unit/interaction-service.test.ts`
- Test: `tests/unit/inspect-command.test.ts`

- [ ] **Step 1: Define match-scorecard types**

Add a deterministic scorecard structure:

```ts
export type MatchBand = "high" | "medium" | "low";

export interface MatchScorecard {
  scopeMatch: "same" | "related" | "cross" | "none";
  taskTypeMatch: MatchBand;
  techStackMatch: MatchBand;
  failureSignatureMatch: MatchBand;
  artifactMatch: MatchBand;
  intentMatch: MatchBand;
  negativeEvidence: string[];
  overallMatchBand: MatchBand;
  directInjectEligible: boolean;
}
```

Do not use LLM calls to fill this. Use available retrieval context, node metadata, trigger text, task type, evidence summaries, file extensions, command/tool names, and failure signatures.

Important source-of-truth boundary:
- `ExperienceNode` does not currently persist first-class artifact or failure-signature fields for every node.
- `ExperienceCandidate` has fields such as `failure_signature`, and node text fields include `trigger_pattern`, `compact_hint`, `retrieval_text`, and `evidence_summary`.
- Current-task signals can come from `RetrievalContext`.

Therefore this task must explicitly distinguish:
- stored structured signals
- derived textual signals
- missing or unknown signals

Do not treat missing evidence as explicit negative evidence. Unknown evidence should lower confidence; explicit mismatch should lower match.

- [ ] **Step 2: Add failing candidate match tests**

Cover:
- same repo + same failure signature + same artifact yields `high`
- same repo + same framework but different failure signature yields `medium` or `low`
- same repo but clear negative evidence yields `low`
- cross repo with generic CLI-wrapper experience can be `medium`
- cross repo with repo-specific UI bug remains `low`

Run:

```bash
pnpm vitest run tests/unit/candidate-retriever.test.ts
```

Expected: FAIL until scorecard construction exists.

- [ ] **Step 3: Implement deterministic scorecard construction**

Keep the initial implementation simple:
- exact scope match is strong positive evidence
- task type match is positive but not sufficient alone
- repeated failure signature is strong positive evidence
- matching file type, framework, command, or API provider is positive evidence
- conflicting failure signatures or unrelated artifact families become negative evidence
- negative evidence can cap `overallMatchBand` at `medium` or `low`

Add a small deterministic signal extractor if needed:
- derive artifact families from file extensions and known framework terms in node/retrieval text
- derive provider/host terms from evidence summaries
- derive failure signatures from candidate metadata when available and text fallback when not

Keep this extractor covered by unit tests.

- [ ] **Step 4: Attach scorecard to top candidates**

Ensure top candidate summaries in `InjectionScorecard` include their match scorecard so inspect can explain why a node was injected or withheld.

- [ ] **Step 5: Render match scorecard summaries**

Show compact operator-facing output in `--verbose`. The default `inspect --last` output should keep a short product-facing explanation and avoid raw scorecard detail unless it is necessary to explain the decision.

```text
Match: high
Signals: same scope, matching WXML artifact, matching compile-error signature
Negative evidence: none
```

- [ ] **Step 6: Run tests**

Run:

```bash
pnpm vitest run tests/unit/candidate-retriever.test.ts tests/unit/interaction-service.test.ts tests/unit/inspect-command.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/types/domain.ts src/controller/candidate-retriever.ts src/controller/injection-scorecard.ts src/interaction/service.ts src/cli/commands/inspect.ts tests/unit/candidate-retriever.test.ts tests/unit/interaction-service.test.ts tests/unit/inspect-command.test.ts
git commit -m "feat: add structured match scorecards"
```

## Task 3: Route Direct, Conservative, And Skip Decisions By Trust Plus Match

**Files:**
- Modify: `src/controller/trigger-evaluator.ts`
- Modify: `src/controller/intervention-controller.ts`
- Modify: `src/controller/injection-scorecard.ts`
- Test: `tests/unit/trigger-evaluator.test.ts`
- Test: `tests/unit/intervention-controller.test.ts`

- [ ] **Step 1: Define trust bands**

Use existing node fields:
- `delivery_state`
- `state`
- `usage_count`
- `helped_count`
- `harmed_count`
- `consecutive_harmed_count`
- `validation_state`
- `priority_promotion_applied`

Suggested trust bands:
- `high`: eligible node, no recent harm, strong support/helped signal, or validated by same-scope reuse
- `medium`: conservative-only node with strong evidence but limited reuse
- `low`: shadow-only, quarantined, recently harmed, weak evidence, or unknown task type

- [ ] **Step 2: Add failing routing tests**

Cover:
- high trust + high match => `inject`
- high trust + medium match => `inject_conservative`
- medium trust + high match => `inject_conservative`
- low match => `skip`
- negative evidence prevents direct injection
- quarantined or recent harm always skips regardless of textual similarity

Run:

```bash
pnpm vitest run tests/unit/trigger-evaluator.test.ts tests/unit/intervention-controller.test.ts
```

Expected: FAIL until routing uses trust + match.

- [ ] **Step 3: Implement direct injection gate**

Direct injection requires:
- `matchScorecard.overallMatchBand === "high"`
- trust band is `high`
- delivery state is `eligible`
- no quarantine/harm blocker
- no high-risk second-opinion downgrade

- [ ] **Step 4: Implement conservative injection gate**

Conservative injection is allowed when:
- trust is `high` and match is `medium`
- trust is `medium` and match is `high`
- node delivery state is `eligible` or `conservative_only`
- no hard blocker exists

Limit conservative injection to the best candidate unless existing policy explicitly allows more.

- [ ] **Step 5: Implement skip gate**

Skip when:
- no candidate exists
- match is `low`
- negative evidence contains a hard mismatch
- delivery state is `shadow_only` or `quarantined`
- harmed/quarantine policy blocks reuse
- holdout suppresses delivery

- [ ] **Step 6: Run tests**

Run:

```bash
pnpm vitest run tests/unit/trigger-evaluator.test.ts tests/unit/intervention-controller.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/controller/trigger-evaluator.ts src/controller/intervention-controller.ts src/controller/injection-scorecard.ts tests/unit/trigger-evaluator.test.ts tests/unit/intervention-controller.test.ts
git commit -m "feat: route experience delivery by trust and match"
```

## Task 4: Promote Same-Scope Reuse Faster

**Files:**
- Modify: `src/types/domain.ts`
- Modify: `src/experience-management/node-lifecycle-governance.ts`
- Modify: `src/feedback/automatic-attribution.ts`
- Modify: `src/feedback/feedback-manager.ts`
- Modify: `src/feedback/state-transition.ts`
- Modify: `src/runtime/service.ts`
- Modify: `src/store/sqlite/repositories/node-repo.ts`
- Test: `tests/unit/runtime-service.test.ts`
- Test: `tests/unit/node-repo.test.ts`

- [ ] **Step 1: Add failing promotion tests**

Cover:
- a `priority_candidate / conservative_only` node used in same scope with high match and successful outcome becomes `eligible`
- success without enough attribution remains `uncertain` and does not promote
- harmful same-scope reuse does not promote and may quarantine
- cross-scope conservative reuse does not immediately promote to direct injection

Run:

```bash
pnpm vitest run tests/unit/runtime-service.test.ts tests/unit/node-repo.test.ts
```

Expected: FAIL until promotion rules exist.

- [ ] **Step 2: Add deterministic promotion signal**

Promotion should require:
- same-scope reuse
- high match scorecard
- delivered guidance was present on the successful run
- automatic attribution says no harm
- final task outcome is successful
- node has no recent harmed streak

Do not require manual `helped`, but manual `helped` should strengthen the promotion path.

Do not claim that deterministic attribution proves the agent actually used the guidance. Current automatic feedback can mark success as uncertain rather than helped. This promotion path should be named and stored as something like `same_scope_high_match_success`, not `auto_helped`, unless a stronger usage signal is implemented.

Store enough evidence for later audit:
- node id
- decision id or injection event id
- match band
- scope relationship
- final outcome
- attribution verdict
- promotion reason

- [ ] **Step 3: Update lifecycle governance**

Implement:

```text
priority_candidate / conservative_only
  + same-scope high-match reuse success
  -> active / eligible
```

Keep:

```text
candidate / shadow_only
  -> not live until priority promotion or explicit governance path

quarantined
  -> never auto-promote
```

- [ ] **Step 4: Record review events**

Add review events such as:
- `promote_eligible`
- `restore_conservative`
- `withhold_match_risk`

Use existing review-event infrastructure where possible.

- [ ] **Step 5: Run tests**

Run:

```bash
pnpm vitest run tests/unit/runtime-service.test.ts tests/unit/node-repo.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/types/domain.ts src/experience-management/node-lifecycle-governance.ts src/feedback/automatic-attribution.ts src/feedback/feedback-manager.ts src/feedback/state-transition.ts src/runtime/service.ts src/store/sqlite/repositories/node-repo.ts tests/unit/runtime-service.test.ts tests/unit/node-repo.test.ts
git commit -m "feat: promote proven same-scope experience"
```

## Task 5: Add Cross-Scope Reuse Tiers Without Enabling Broad Direct Injection

**Files:**
- Modify: `src/types/domain.ts`
- Modify: `src/runtime/service.ts`
- Modify: `src/store/sqlite/repositories/node-repo.ts`
- Modify: `src/controller/candidate-retriever.ts`
- Modify: `src/controller/trigger-evaluator.ts`
- Modify: `src/controller/injection-scorecard.ts`
- Test: `tests/unit/runtime-service.test.ts`
- Test: `tests/unit/node-repo.test.ts`
- Test: `tests/unit/candidate-retriever.test.ts`
- Test: `tests/unit/trigger-evaluator.test.ts`

- [ ] **Step 1: Define reuse tiers**

Add a node-level or derived tier:

```ts
export type ReuseTier =
  | "repo_specific"
  | "host_specific"
  | "tech_stack_specific"
  | "general_coding_pattern";
```

Initial derivation can be deterministic:
- repo-specific if evidence names repo-local files, product terms, or domain entities
- host-specific if the pattern is about Codex/OpenClaw/Claude host behavior
- tech-stack-specific if it names frameworks like Cocos, WeChat Mini Program, WXML, OpenRouter, SQLite
- general coding pattern if it is about broad CLI/process/test workflow behavior

- [ ] **Step 2: Add failing cross-scope tests**

Cover:
- runtime has an explicit gated cross-scope candidate source; current `resolveExactScopeInjectableNodes()` remains exact-scope
- node repository can return same-scope and permitted cross-scope candidate pools separately
- repo-specific nodes do not inject across repo
- tech-stack-specific nodes can conservative-inject across matching stack
- host-specific nodes can conservative-inject across same host
- general coding patterns can conservative-inject across repo
- direct injection remains same-scope only in this rollout

Run:

```bash
pnpm vitest run tests/unit/runtime-service.test.ts tests/unit/node-repo.test.ts tests/unit/candidate-retriever.test.ts tests/unit/trigger-evaluator.test.ts
```

Expected: FAIL until reuse-tier rules exist.

- [ ] **Step 3: Implement tier-aware candidate eligibility**

Current implementation detail to fix:
- `runtime/service.ts` currently calls `resolveExactScopeInjectableNodes()`.
- `NodeRepository.listLiveInjectableByExactScope()` filters only one scope.
- Existing tests assert other-scope nodes remain excluded.

Keep exact-scope direct injection intact, but add an explicitly named cross-scope source, for example:
- `listConservativeCrossScopeCandidates()`
- `resolveConservativeCrossScopeCandidates()`

This source must be disabled by default unless the rollout explicitly enables it, or it must be gated so it only returns conservative-eligible candidates after reuse-tier filtering.

Rules:
- same scope may direct-inject when trust + match are high
- cross scope never direct-injects in this rollout
- cross scope can conservative-inject only when reuse tier permits it and match is at least medium
- negative evidence overrides tier permission

- [ ] **Step 4: Surface reuse tier in scorecard**

Inspect should show:

```text
Reuse tier: tech_stack_specific
Cross-scope delivery: conservative only
```

- [ ] **Step 5: Run tests**

Run:

```bash
pnpm vitest run tests/unit/runtime-service.test.ts tests/unit/node-repo.test.ts tests/unit/candidate-retriever.test.ts tests/unit/trigger-evaluator.test.ts tests/unit/inspect-command.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/types/domain.ts src/runtime/service.ts src/store/sqlite/repositories/node-repo.ts src/controller/candidate-retriever.ts src/controller/trigger-evaluator.ts src/controller/injection-scorecard.ts tests/unit/runtime-service.test.ts tests/unit/node-repo.test.ts tests/unit/candidate-retriever.test.ts tests/unit/trigger-evaluator.test.ts tests/unit/inspect-command.test.ts
git commit -m "feat: classify cross-scope experience reuse"
```

## Task 6: Improve Status And Doctor For Codex Operator Readiness

**Files:**
- Modify: `src/cli/commands/doctor.ts`
- Modify: `src/cli/commands/status.ts`
- Modify: `src/config/config-schema.ts`
- Modify: `src/install/codex-installer.ts`
- Test: `tests/unit/doctor-command.test.ts`
- Test: `tests/unit/status-command.test.ts`

- [ ] **Step 1: Add failing CLI-discoverability tests**

Cover:
- Codex MCP wired and active but `ee` command missing from PATH should produce a warning, not a runtime failure
- doctor should show the MCP launcher path
- status should distinguish MCP runtime readiness from CLI fallback readiness

Run:

```bash
pnpm vitest run tests/unit/doctor-command.test.ts tests/unit/status-command.test.ts
```

Expected: FAIL until CLI readiness is represented.

- [ ] **Step 2: Add operator readiness checks**

Doctor should report:
- MCP command path
- configured `EXPERIENCE_ENGINE_HOME`
- whether the shell `ee` command is discoverable
- fallback launcher path when `ee` is not on PATH

If Codex install inspection already owns part of this state, keep the readiness check there and have doctor/status consume that shared inspection result instead of duplicating shell probing logic.

- [ ] **Step 3: Update status wording**

Keep it concise:

```text
Codex runtime: active
Codex MCP: wired
Operator CLI: not on PATH
Fallback: node <package>/dist/cli/index.js
```

- [ ] **Step 4: Run tests**

Run:

```bash
pnpm vitest run tests/unit/doctor-command.test.ts tests/unit/status-command.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/doctor.ts src/cli/commands/status.ts src/config/config-schema.ts src/install/codex-installer.ts tests/unit/doctor-command.test.ts tests/unit/status-command.test.ts
git commit -m "feat: report Codex operator CLI readiness"
```

## Task 7: Update Documentation And Validation Playbook

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/development/inspect-last-layering-spec.md`
- Modify: `docs/development/codex-runtime-validation.md`
- Modify: `docs/user-guide.md`
- Modify: `docs/releases/<version>.md`

- [ ] **Step 1: Document decision bands**

Describe:
- direct injection
- conservative injection
- skip with structured reason
- trust + match policy

- [ ] **Step 2: Document operator explanation**

Add examples for:
- no candidate
- low match
- delivery-state withheld
- quarantine/recent harm
- holdout
- second-opinion skip

Respect the inspect layering contract:
- default `inspect --last` stays product-facing and compact
- `inspect --last --verbose` carries raw match scorecard fields, candidate scores, and detailed negative evidence

- [ ] **Step 3: Document validation commands**

Use source-repo validation commands:

```bash
pnpm test
EXPERIENCE_ENGINE_HOME=/home/seed/.experienceengine node dist/cli/index.js status
EXPERIENCE_ENGINE_HOME=/home/seed/.experienceengine node dist/cli/index.js doctor codex
EXPERIENCE_ENGINE_HOME=/home/seed/.experienceengine node dist/cli/index.js inspect --last
```

State clearly that local source-repo validation is not the same as published npm package validation.

- [ ] **Step 4: Run docs-related tests or lint if available**

Run:

```bash
pnpm test -- tests/unit/inspect-command.test.ts tests/unit/status-command.test.ts tests/unit/doctor-command.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add README.md README.zh-CN.md docs/development/inspect-last-layering-spec.md docs/development/codex-runtime-validation.md docs/user-guide.md docs/releases/<version>.md
git commit -m "docs: document trust and match delivery policy"
```

---

## End-To-End Validation

After all tasks:

- [ ] Run full unit suite.

```bash
pnpm test
```

- [ ] Run Codex runtime status from source repo.

```bash
EXPERIENCE_ENGINE_HOME=/home/seed/.experienceengine node dist/cli/index.js status
```

- [ ] Run Codex doctor from source repo.

```bash
EXPERIENCE_ENGINE_HOME=/home/seed/.experienceengine node dist/cli/index.js doctor codex
```

- [ ] Inspect the latest decision.

```bash
EXPERIENCE_ENGINE_HOME=/home/seed/.experienceengine node dist/cli/index.js inspect --last
```

- [ ] Manually validate these behavior scenarios in a local data copy or controlled fixture:
  - same-scope high-match successful reuse promotes to eligible
  - high-trust high-match eligible node direct-injects
  - high-trust medium-match node conservative-injects
  - low-match candidate skips with structured reason
  - cross-scope tech-stack match conservative-injects only
  - quarantined or recent-harm node never injects

## Acceptance Criteria

- `inspect --last` can explain why a decision skipped, conservative-injected, direct-injected, or held out.
- High-trust same-scope high-match nodes can direct-inject.
- Conservative-only nodes can promote after same-scope high-match successful reuse without requiring manual `helped`.
- Cross-scope reuse is possible only through explicit reuse tiers and remains conservative in this rollout.
- Match scorecards include positive and negative evidence.
- No ordinary retrieval path adds a new LLM call.
- Codex doctor/status distinguish active MCP runtime from missing shell CLI fallback.

## Rollout Notes

Ship this behind deterministic tests first. If a release is cut after implementation, release notes must make clear that:
- automatic outcome attribution remains the normal path
- manual helped/harmed remains an override path
- direct injection is gated by trust + match, not by raw similarity alone
- local source validation, published npm validation, and host-native validation are different levels of evidence
