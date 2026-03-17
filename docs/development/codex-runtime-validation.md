# Codex Runtime Validation

This document records the March 17, 2026 real-host validation pass for ExperienceEngine v3 on `Codex`.

`Codex` is a supported product host for ExperienceEngine. This pass validates that the shared MCP-first runtime, high-signal candidate flow, distillation flow, and governance flow work end to end on a real local Codex CLI session. It does **not** replace the OpenClaw-first baseline for core learning validation.

## Scope

Included in this pass:

- Codex MCP wiring and doctor checks
- real `codex exec` lookup, tool-result recording, and finalize flow
- high-signal candidate creation from a real failure/correction/success task
- async distillation job completion into a formal node
- follow-up retrieval and injection of the newly distilled node
- explicit harmful feedback and node state transition
- scope disable / enable behavior in a real Codex session

Excluded from this pass:

- OpenClaw live-host rerun
- Claude Code live-host rerun
- product UX refinement outside the Codex runtime path

## Environment Used

- Date: `2026-03-17`
- Workspace: `/mnt/d/project/ExperienceEngine`
- Codex CLI: `codex-cli 0.114.0`
- ExperienceEngine build: local `dist/cli/index.js`
- Codex MCP server entrypoint: `node --no-warnings /mnt/d/project/experienceengine/dist/cli/index.js codex-mcp-server`
- Distillation provider path exercised in this pass:
  - `EXPERIENCE_ENGINE_USE_HOST_LLM=true`
  - `EXPERIENCE_ENGINE_ADAPTER=codex`
  - `CODEX_CONFIG_PATH=<api-backed codex config>`
  - provider API key forwarded through MCP server env

Current host state was re-checked at the end of the pass:

- `node dist/cli/index.js doctor codex` reports `installed: true`, `host_wired: true`, `host_enabled: true`
- `codex mcp get experienceengine` reports:
  - `enabled: true`
  - `transport: stdio`
  - `startup_timeout_sec: 60`
  - masked env entries for `CODEX_CONFIG_PATH`, `EXPERIENCE_ENGINE_ADAPTER`, `EXPERIENCE_ENGINE_HOME`, `EXPERIENCE_ENGINE_USE_HOST_LLM`, and the provider API key

## Scenarios Executed

### 1. Real MCP Injection + Finalize

Session:

- `codex-real-v2-inject`

Task summary:

- `Fix the failing payments auth test in ExperienceEngine`

Observed result:

- `experienceengine_lookup_hints` returned an inject path
- `experienceengine_finalize_task` completed with `outcome_signal = success`
- the persisted input record was:
  - `input_1c424d12-26c5-41af-8df9-d61899027dd9`
- the persisted injected nodes were:
  - `node_codex_real_v2_active`
  - `node_codex_real_v2_candidate`

Acceptance meaning:

- Codex can call the ExperienceEngine MCP server in a real session
- finalize persists evidence into SQLite
- successful injected follow-up tasks update usage/helped counters

### 2. High-Signal Candidate Capture

Session:

- `codex-high-signal-sqlite-v2`

Task summary:

- `Repair the broken sqlite ledger migration in ExperienceEngine`

Observed result:

- the high-signal task produced a persisted input record:
  - `input_ee114cc1-44df-4fff-bd2f-f0a47d86b7df`
- a formal candidate was created:
  - `candidate_1a61cdadec7d`
- the candidate ended in:
  - `lifecycle_state = distilled`
  - `retry_count = 1`
  - `distilled_node_id = node_ab09c21971c1`
- the linked distillation job ended in:
  - `status = succeeded`
  - `retry_count = 1`

Acceptance meaning:

- Codex high-signal sessions can create real ExperienceCandidates
- async distillation jobs are created and completed
- retry handling works without losing the candidate

### 3. Follow-Up Injection of the Distilled Node

Session:

- `codex-high-signal-sqlite-v2-followup-2`

Task summary:

- `Repair the broken sqlite ledger migration in ExperienceEngine`

Observed result:

- the follow-up input record was:
  - `input_4dcb86c0-cf5d-44c3-852d-960e00300855`
- lookup returned `inject_conservative`
- the injected node set included:
  - `node_ab09c21971c1`
  - `node_codex_real_v2_active`
  - `node_codex_real_v2_candidate`

Acceptance meaning:

- the freshly distilled Codex node is retrievable on the next similar task
- the node-ranking path now prefers the exact new match instead of losing to unrelated older active nodes

### 4. Explicit Harmed Feedback -> Cooling

Target node:

- `node_ab09c21971c1`

Observed result after explicit harmed feedback:

- `usage_count = 1`
- `helped_count = 1`
- `harmed_count = 3`
- `state = cooling`

Acceptance meaning:

- real Codex feedback actions now drive state transitions
- explicit harmful feedback is not just counted; it changes governance state

### 5. Scope Disable / Enable

Observed result:

- after disabling the current scope, a real Codex lookup returned `skip`
- after re-enabling the scope, the same lookup path resumed normal injection behavior

Acceptance meaning:

- Codex can exercise the operational control surface through the shared MCP server
- scope-level pause/resume behavior works in a real host session

## Issues Found During This Pass

The following runtime issues were discovered while running the real Codex scenarios and were fixed before the pass was closed:

1. Legacy or incompatible embeddings on older nodes could break retrieval for mixed-history state.
   - Fix area: `src/store/vector/embeddings.ts`, `src/controller/candidate-retriever.ts`, `src/store/vector/node-index.ts`
2. Codex installation did not forward host-LLM configuration strongly enough for distillation.
   - Fix area: `src/distillation/host-llm.ts`, `src/install/codex-cli.ts`, `src/install/codex-installer.ts`
3. Distillation could stall in `processing` or fail late on provider/auth issues.
   - Fix area: `src/distillation/llm-distiller.ts`, `src/distillation/queue-worker.ts`
4. Exact new Codex nodes could lose ranking priority to older unrelated active nodes.
   - Fix area: `src/controller/node-ranker.ts`
5. Explicit `feedback_node` updated counts but did not drive node state transitions.
   - Fix area: `src/interaction/service.ts`

These fixes were verified again in real Codex sessions and then covered by repository tests.

## Repository Verification After Fixes

Repository verification completed after the Codex fixes:

- `pnpm check`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`

Final result for the repository pass:

- `51` test files passed
- `202` tests passed

## Final Result

Status for this Codex pass:

- `PASS`

What this means:

- the v3 Codex runtime path is now validated as a real supported host path
- the core Codex chain `lookup -> tool result -> finalize -> candidate -> distillation -> follow-up injection -> feedback/state transition` works end to end
- no known blocking Codex runtime bug remained open at the end of this pass

## Current Limitations

- This pass did not rerun OpenClaw or Claude Code live-host validation.
- OpenClaw remains the primary core-learning baseline host.
- Codex host-LLM reuse currently requires an API-backed provider configuration visible through `CODEX_CONFIG_PATH` and the required provider env keys.
- A plain ChatGPT login session is not, by itself, enough to guarantee a usable distillation endpoint for ExperienceEngine.
- Some v3 conceptual objects are still represented through current SQLite tables rather than one-to-one schema names from the strategy documents.

## Re-Run Guidance

Use the checklist companion document for future reruns:

- [docs/development/codex-runtime-validation-checklist.md](codex-runtime-validation-checklist.md)
