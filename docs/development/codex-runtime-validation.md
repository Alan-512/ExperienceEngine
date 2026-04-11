# Codex Runtime Validation

This document records the March 17, 2026 real-host validation pass for ExperienceEngine v3 on `Codex`.

`Codex` is a supported product host for ExperienceEngine. This pass validates that the shared MCP-first runtime, high-signal candidate flow, distillation flow, and governance flow work end to end on a real local Codex CLI session. It does **not** replace the OpenClaw-first baseline for core learning validation.

For the current product phase, governance and review are exercised through the shared MCP surface and the `ee` CLI fallback. A standalone review UI is still deferred and is not part of this Codex validation pass.

## Scope

Included in this pass:

- Codex MCP wiring and doctor checks
- deterministic `ee evaluate codex-lifecycle` fallback for adapter-local lifecycle validation
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

## Deterministic Fallback Harness

When real nested `codex exec` validation is blocked by host-side limits such as auth expiry, usage caps, billing state, or inconsistent MCP tool obedience, use the deterministic fallback harness:

```bash
pnpm evaluate:codex-lifecycle
# or
ee evaluate codex-lifecycle
```

This harness does not depend on a live nested Codex model turn. Instead, it seeds an isolated ExperienceEngine home, drives the existing Codex behavior loop in-process, waits for async posttask work to settle, and writes `codex-lifecycle.json` plus `codex-lifecycle.md` under `artifacts/evaluations/codex/...`.

Acceptance meaning:

- the Codex adapter can persist lookup, tool-result, and finalize evidence deterministically
- the bounded async postmortem path can write review events and policy-gated artifacts
- PR-level lifecycle regressions can be caught even when the external Codex host is unavailable

## Environment Used

- Date: `2026-03-17`
- Workspace: `/mnt/d/project/ExperienceEngine`
- Codex CLI: `codex-cli 0.114.0`
- ExperienceEngine build: local `dist/cli/index.js`
- Codex MCP server entrypoint: `node --no-warnings /mnt/d/project/experienceengine/dist/cli/index.js codex-mcp-server`
- Distillation provider path exercised in this pass:
  - `EXPERIENCE_ENGINE_ADAPTER=codex`
  - `ee config set distillation.provider <provider id>`
  - `ee config set distillation.model <model id>`
  - provider-specific credential env

Preferred provider/model selection:

```bash
ee models list openrouter
ee config set distillation.provider openrouter
ee config set distillation.model openai/gpt-5.4-mini
export OPENROUTER_API_KEY=...
```

Provider-first examples:

- OpenAI:
  - `ee config set distillation.provider openai`
  - `ee config set distillation.model gpt-5.4`
  - `OPENAI_API_KEY=<provider api key>`

- Anthropic:
  - `ee config set distillation.provider anthropic`
  - `ee config set distillation.model claude-sonnet-4-20250514`
  - `ANTHROPIC_API_KEY=<provider api key>`

- Gemini:
  - `ee config set distillation.provider gemini`
  - `ee config set distillation.model gemini-2.5-flash`
  - `GEMINI_API_KEY=<provider api key>`

- Azure OpenAI:
  - `ee config set distillation.provider azure_openai`
  - `ee config set distillation.model <azure deployment name>`
  - `AZURE_OPENAI_ENDPOINT=https://<resource>.openai.azure.com`
  - `AZURE_OPENAI_API_KEY=<provider api key>`
  - `AZURE_OPENAI_API_VERSION=2024-10-21`

- Bedrock:
  - `ee config set distillation.provider bedrock`
  - `ee config set distillation.model <bedrock model id>`
  - `AWS_ACCESS_KEY_ID=<aws access key>`
  - `AWS_SECRET_ACCESS_KEY=<aws secret>`
  - `AWS_REGION=<aws region>`
  - `AWS_SESSION_TOKEN=<optional session token>`

- DeepSeek:
  - `ee config set distillation.provider deepseek`
  - `ee config set distillation.model deepseek-chat`
  - `DEEPSEEK_API_KEY=<provider api key>`

- Moonshot:
  - `ee config set distillation.provider moonshot`
  - `ee config set distillation.model moonshot-v1-8k`
  - `MOONSHOT_API_KEY=<provider api key>`

- MiniMax:
  - `ee config set distillation.provider minimax`
  - `ee config set distillation.model MiniMax-M1-80k`
  - `MINIMAX_API_KEY=<provider api key>`

- Volcengine Ark:
  - `ee config set distillation.provider volcengine_ark`
  - `ee config set distillation.model <ark model id>`
  - `VOLCENGINE_ARK_API_KEY=<provider api key>`

- Tencent Hunyuan:
  - `ee config set distillation.provider tencent_hunyuan`
  - `ee config set distillation.model <hunyuan model id>`
  - `TENCENT_HUNYUAN_API_KEY=<provider api key>`

- Baidu Qianfan:
  - `ee config set distillation.provider baidu_qianfan`
  - `ee config set distillation.model <qianfan model id>`
  - `BAIDU_QIANFAN_API_KEY=<provider api key>`

Legacy generic config still works, but is treated as `openai_compatible`:

- `EXPERIENCE_ENGINE_DISTILLER_MODEL=<configured model>`
- `EXPERIENCE_ENGINE_DISTILLER_BASE_URL=<compatible chat completions URL>`
- `EXPERIENCE_ENGINE_DISTILLER_API_KEY=<provider api key>`

Current host state was re-checked at the end of the pass:

- `node dist/cli/index.js doctor codex` reports `installed: true`, `host_wired: true`, `host_enabled: true`
- `codex mcp get experienceengine` reports:
  - `enabled: true`
  - `transport: stdio`
  - `startup_timeout_sec: 60`
  - masked env entries for `EXPERIENCE_ENGINE_ADAPTER`, `EXPERIENCE_ENGINE_HOME`, `EXPERIENCE_ENGINE_DISTILLER_PROVIDER`, `EXPERIENCE_ENGINE_DISTILLER_MODEL`, and the provider credential env

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
2. Distillation configuration needed to be explicit and provider-backed instead of inferring host reuse or collapsing all vendors into one generic path.
   - Fix area: `src/distillation/host-llm.ts`, `src/install/codex-installer.ts`, `src/config/load-config.ts`
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
- Codex does not provide a supported host-LLM reuse path for ExperienceEngine distillation.
- LLM distillation requires an explicitly configured official or compatible provider API.
- Some v3 conceptual objects are still represented through current SQLite tables rather than one-to-one schema names from the strategy documents.

## Re-Run Guidance

Use the checklist companion document for future reruns:

- [docs/development/codex-runtime-validation-checklist.md](codex-runtime-validation-checklist.md)
