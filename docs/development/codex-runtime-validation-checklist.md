# Codex Runtime Validation Checklist

Use this checklist when changes affect any part of the Codex supported-host path:

- Codex MCP wiring
- explicit-provider LLM distillation on Codex
- high-signal candidate capture
- distillation queue behavior
- retrieval / node ranking
- explicit feedback and node-state governance

This checklist validates `Codex` as a supported product host. It does **not** replace the OpenClaw-first baseline.

## Preconditions

- [ ] `codex` CLI is installed locally and can run real `codex exec` sessions
- [ ] the repository has been built and `dist/cli/index.js` exists
- [ ] `ee install codex` has been run for the validation environment
- [ ] if distillation is part of the pass, an explicit official or compatible LLM API is configured
- [ ] the MCP server env exposes:
  - `EXPERIENCE_ENGINE_ADAPTER=codex`
  - `EXPERIENCE_ENGINE_DISTILLER_MODEL=<configured model>`
  - `EXPERIENCE_ENGINE_DISTILLER_BASE_URL=<provider base URL>`
  - `EXPERIENCE_ENGINE_DISTILLER_API_KEY=<provider api key>`

## Wiring Checks

- [ ] `node dist/cli/index.js doctor codex` reports the adapter as installed, wired, and enabled
- [ ] `codex mcp get experienceengine` shows the shared server as enabled
- [ ] `codex mcp get experienceengine` shows `startup_timeout_sec: 60`
- [ ] the server command points to `dist/cli/index.js codex-mcp-server`

## Read-Only Injection Path

- [ ] run a real `codex exec` session that calls:
  - `experienceengine_lookup_hints`
  - `experienceengine_record_tool_result`
  - `experienceengine_finalize_task`
- [ ] confirm lookup returns `inject` or `inject_conservative`
- [ ] confirm a new `experience_input_records` row is written
- [ ] confirm the injected node ids are persisted into the input record
- [ ] confirm a successful follow-up increments `usage_count` and `helped_count` on injected nodes

## High-Signal Candidate / Distillation Path

- [ ] run a real Codex task with an explicit failure/correction/success sequence
- [ ] confirm at least one `experience_candidates` row is created for that task
- [ ] confirm at least one `distillation_jobs` row is created for the same candidate
- [ ] confirm the candidate leaves `pending` and ends in one of:
  - `distilled`
  - `failed`
  - `discarded`
- [ ] confirm there are no indefinitely stuck `processing` jobs after the pass
- [ ] if the candidate distills successfully, confirm a formal `experience_nodes` row is created or updated

## Follow-Up Retrieval Path

- [ ] rerun a similar read-only task after the candidate is distilled
- [ ] confirm lookup returns `inject` or `inject_conservative`
- [ ] confirm the newly distilled node id appears in the injected set

## Governance Path

- [ ] call `experienceengine_feedback_node` or `experienceengine_feedback_last` from a real Codex session
- [ ] confirm `helped_count` or `harmed_count` changes in SQLite
- [ ] confirm harmful explicit feedback can move a node from `active` to `cooling`
- [ ] confirm a previously `retired` node is not auto-revived by explicit feedback

## Scope Control Path

- [ ] disable the current scope through ExperienceEngine
- [ ] confirm a real Codex lookup returns `skip`
- [ ] re-enable the scope
- [ ] confirm lookup resumes normal injection behavior

## Repository Verification

- [ ] for any substantial change that should affect the live Codex experience, rerun `pnpm build` before real-host validation so Codex reads the latest `dist/`
- [ ] run `pnpm check`
- [ ] confirm repository verification stays green after the Codex validation fixes
- [ ] after the build, run at least one real Codex host session against the updated MCP server instead of relying on tests alone

## Validation Record

Record these artifacts for the pass:

- [ ] Codex CLI version
- [ ] validation date
- [ ] provider path used for distillation
- [ ] session ids used during the pass
- [ ] candidate ids, node ids, and any retry/discard outcomes
- [ ] known limitations or remaining non-blocking gaps

Companion report:

- [docs/development/codex-runtime-validation.md](codex-runtime-validation.md)
