# Codex Lifecycle Validation Harness Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic Codex validation harness that proves the Codex lifecycle path can persist lookup, tool-result, finalize, and bounded postmortem governance evidence without depending on a live nested `codex exec` session.

**Architecture:** Add a new `ee evaluate codex-lifecycle` path backed by a focused evaluation module. The harness will seed an isolated ExperienceEngine home, drive the existing Codex behavior loop in-process, wait for async posttask work to settle, then emit a small report plus JSON/Markdown artifacts that summarize persisted SQLite evidence.

**Tech Stack:** TypeScript, Vitest, existing `src/evaluation/*` evaluation patterns, existing Codex MCP behavior loop, SQLite repositories.

---

### Task 1: Define the CLI surface first

**Files:**
- Modify: `tests/unit/evaluate-command.test.ts`
- Modify: `src/cli/commands/evaluate.ts`

- [ ] **Step 1: Write the failing evaluate-command tests**

Add assertions for:
- usage text mentioning `codex-lifecycle`
- routing `ee evaluate codex-lifecycle --repo-root /repo --output-dir /tmp/out`
- concise console output of harness summary paths

- [ ] **Step 2: Run the targeted test to verify it fails**

Run: `pnpm vitest run tests/unit/evaluate-command.test.ts`
Expected: FAIL because `codex-lifecycle` is not a supported evaluate target yet.

- [ ] **Step 3: Implement minimal evaluate-command routing**

Add a new target branch in `src/cli/commands/evaluate.ts` with dependency injection support for the new harness runner.

- [ ] **Step 4: Re-run the targeted test to verify it passes**

Run: `pnpm vitest run tests/unit/evaluate-command.test.ts`
Expected: PASS

### Task 2: Add a deterministic Codex harness module

**Files:**
- Create: `tests/unit/codex-lifecycle-validation.test.ts`
- Create: `src/evaluation/codex-lifecycle-validation.ts`
- Modify: `src/adapters/codex/mcp-server.ts`

- [ ] **Step 1: Write the failing harness test**

Cover one deterministic run that:
- seeds an isolated EE home
- injects one Codex node
- records one successful tool result
- finalizes the task
- waits for async postmortem work
- verifies persisted `task_runs`, `injection_events`, `review_events`, and `hybrid_review_artifacts`

- [ ] **Step 2: Run the targeted harness test to verify it fails**

Run: `pnpm vitest run tests/unit/codex-lifecycle-validation.test.ts`
Expected: FAIL because the harness module and/or supporting Codex behavior-loop hooks do not exist yet.

- [ ] **Step 3: Implement the harness**

Implement a focused evaluation module that:
- creates or uses an isolated runtime home under the output directory
- seeds a deterministic Codex node in repo scope
- drives `lookupHints -> recordToolResult -> finalizeTask`
- enables deterministic async postmortem writeback with a bounded executor
- writes JSON and Markdown artifacts plus a structured summary

- [ ] **Step 4: Keep the Codex adapter path reusable**

If needed, extend `createCodexBehaviorLoop` with small harness-safe hooks only:
- optional runtime worker options
- an explicit wait method for background lifecycle work

- [ ] **Step 5: Re-run the targeted harness test to verify it passes**

Run: `pnpm vitest run tests/unit/codex-lifecycle-validation.test.ts`
Expected: PASS

### Task 3: Document and wire the public workflow

**Files:**
- Modify: `docs/development/codex-runtime-validation-checklist.md`
- Modify: `docs/development/codex-runtime-validation.md`
- Modify: `package.json`

- [ ] **Step 1: Add a lightweight deterministic-validation note**

Document that `ee evaluate codex-lifecycle` is the deterministic fallback for validating the Codex lifecycle when live nested Codex host runs are blocked by auth, billing, or model behavior.

- [ ] **Step 2: Add a package script**

Add a script such as `evaluate:codex-lifecycle` that runs the new evaluate target through `tsx`.

- [ ] **Step 3: Run focused docs/command tests**

Run:
- `pnpm vitest run tests/unit/evaluate-command.test.ts tests/unit/codex-lifecycle-validation.test.ts`

Expected: PASS

### Task 4: Run broader verification

**Files:**
- No new files expected

- [ ] **Step 1: Run the broader related suite**

Run:
- `pnpm vitest run tests/unit/codex-mcp-server.test.ts tests/unit/runtime-service.test.ts tests/unit/evaluate-command.test.ts tests/unit/codex-lifecycle-validation.test.ts`

Expected: PASS

- [ ] **Step 2: Run repository verification**

Run: `pnpm check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-04-11-codex-lifecycle-validation-harness.md \
  src/adapters/codex/mcp-server.ts \
  src/cli/commands/evaluate.ts \
  src/evaluation/codex-lifecycle-validation.ts \
  tests/unit/codex-lifecycle-validation.test.ts \
  tests/unit/evaluate-command.test.ts \
  docs/development/codex-runtime-validation-checklist.md \
  docs/development/codex-runtime-validation.md \
  package.json
git commit -m "feat: add codex lifecycle validation harness"
```
