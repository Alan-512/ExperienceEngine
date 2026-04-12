# Codex Exec Wrapper Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-phase `ee codex exec` wrapper that deterministically owns the ExperienceEngine lifecycle around a non-interactive `codex exec` run instead of relying on the inner Codex agent to call MCP tools on its own.

**Architecture:** Introduce a CLI subcommand that wraps `codex exec` with an outer ExperienceEngine behavior loop. The wrapper performs `lookup_hints -> child codex exec -> record_tool_result -> finalize_task`, rewrites the child prompt with any injected ExperienceEngine guidance, and launches the child process against a temporary Codex config with the `experienceengine` MCP server removed so the nested agent cannot double-write lifecycle events.

**Tech Stack:** TypeScript, existing Codex behavior loop (`createCodexBehaviorLoop`), Node child-process APIs, temporary file helpers in `node:fs` / `node:os`, Vitest, existing CLI dispatch.

---

## Scope

- First phase supports only `ee codex exec [codex-exec-options...] "<prompt>"`.
- First phase does **not** support stdin-delivered prompts, `codex exec review`, or interactive/session commands.
- The wrapper owns lifecycle persistence directly; the nested child must not see the EE MCP server.
- The wrapper should preserve native child stdout/stderr and propagate the child exit status.

## Planned File Map

**Create**
- `src/cli/commands/codex.ts`
- `tests/unit/codex-exec-command.test.ts`

**Modify**
- `src/cli/dispatch.ts`
- `src/install/codex-cli.ts`
- `tests/unit/cli-dispatch.test.ts`
- `tests/unit/codex-cli.test.ts`
- `docs/development/codex-runtime-validation.md`
- `docs/user-guide.md`

## Task 1: Add Codex Config Isolation Helpers

**Files:**
- Modify: `src/install/codex-cli.ts`
- Test: `tests/unit/codex-cli.test.ts`

- [ ] **Step 1: Write failing helper tests**

Cover:
- resolve the effective Codex config path from `CODEX_CONFIG_PATH` when present
- strip `[mcp_servers.experienceengine]` and nested subsections such as `[mcp_servers.experienceengine.env]`
- preserve unrelated Codex config content

Run:
```bash
pnpm vitest run tests/unit/codex-cli.test.ts
```
Expected: FAIL until helper behavior exists.

- [ ] **Step 2: Implement helper APIs**

Add helper(s) that:
- resolve the current Codex config path using env override when present
- create a temporary child config without the EE MCP server registration
- return cleanup metadata for the wrapper command

- [ ] **Step 3: Re-run tests**

Run:
```bash
pnpm vitest run tests/unit/codex-cli.test.ts
```
Expected: PASS

## Task 2: Add `ee codex exec` Routing And Wrapper Logic

**Files:**
- Create: `src/cli/commands/codex.ts`
- Modify: `src/cli/dispatch.ts`
- Test: `tests/unit/cli-dispatch.test.ts`
- Test: `tests/unit/codex-exec-command.test.ts`

- [ ] **Step 1: Write failing command tests**

Cover:
- `runCliCommand("codex", ["exec", ...])` lazy-loads the new codex command module
- wrapper rejects unsupported shapes such as missing prompt or stdin prompt (`-`)
- wrapper extracts `-C/--cd` for the outer EE lookup/finalize cwd
- wrapper rewrites the child prompt when EE injected guidance exists
- wrapper runs the child `codex exec` with a temporary `CODEX_CONFIG_PATH`
- wrapper records the child run outcome and finalizes the EE session
- wrapper preserves the child exit status on failure

Run:
```bash
pnpm vitest run tests/unit/cli-dispatch.test.ts tests/unit/codex-exec-command.test.ts
```
Expected: FAIL until the wrapper is implemented.

- [ ] **Step 2: Implement the wrapper**

Behavior:
- route `ee codex exec ...`
- generate a deterministic EE session id for the wrapped run
- call the Codex behavior loop directly
- prepend a short wrapper notice telling the child agent that EE lifecycle is externally managed and `experienceengine_*` tools are intentionally unavailable in this nested run
- append injected EE guidance only when lookup returns text
- execute the child with `stdio: "inherit"` and the isolated config
- record a single important tool result for the child run
- finalize the task even when the child exits non-zero

- [ ] **Step 3: Re-run tests**

Run:
```bash
pnpm vitest run tests/unit/cli-dispatch.test.ts tests/unit/codex-exec-command.test.ts
```
Expected: PASS

## Task 3: Document And Verify The First-Phase Wrapper

**Files:**
- Modify: `docs/development/codex-runtime-validation.md`
- Modify: `docs/user-guide.md`

- [ ] **Step 1: Update operator docs**

Document:
- wrapper scope and current limitations
- why the nested EE MCP server is removed for wrapped runs
- recommended validation / smoke commands

- [ ] **Step 2: Run verification**

Run:
```bash
pnpm vitest run tests/unit/codex-cli.test.ts tests/unit/cli-dispatch.test.ts tests/unit/codex-exec-command.test.ts
pnpm check
```
Expected: PASS

- [ ] **Step 3: Optional live smoke**

If Codex account state permits, run a real smoke:
```bash
node dist/cli/index.js codex exec -C /mnt/d/project/experienceengine -s read-only "Say ok and exit."
```
Verify that:
- the child run succeeds or fails only on Codex-side external state
- EE persists a `codex` task run without relying on nested MCP calls
