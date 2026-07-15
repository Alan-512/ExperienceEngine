# ExperienceEngine User Guide

## What ExperienceEngine Is

ExperienceEngine is a local experience layer for coding agents.

It watches real tasks, extracts short reusable guidance, and later decides whether to inject that guidance into similar work. It also records whether the intervention helped or harmed the result.

In practice, this means:
- repeated debugging or test-fix tasks can get a short strategy hint
- noisy or harmful prior patterns can be cooled or retired
- the system gradually learns which guidance is actually useful

It also means ExperienceEngine separates:

- `task history`
  - broad runtime records of what happened
- `reusable experience`
  - only the subset of tasks that produced transferable decision guidance

So a task can be recorded without being promoted into learning.

For a focused explanation of what ExperienceEngine stores and how an experience node is governed, see:

- [docs/development/experience-model.md](development/experience-model.md)

For a practical end-to-end workflow on a real repository, see:

- [docs/development/real-repo-playbook.md](development/real-repo-playbook.md)
- [docs/development/real-repo-usage-template.md](development/real-repo-usage-template.md)
- [docs/development/experienceengine-self-hosted-case-study.md](development/experienceengine-self-hosted-case-study.md)
- [docs/development/function-plotter-cold-start-case-study.md](development/function-plotter-cold-start-case-study.md)

## Core Learning Baseline

ExperienceEngine currently treats `OpenClaw` as the primary baseline host for validating the learning core:

- candidate capture
- async distillation
- injection quality
- feedback attribution
- retirement behavior

`Claude Code` and `Codex` remain supported product hosts. They continue to reuse ExperienceEngine's shared interaction/runtime surfaces, but they are not the equal-weight baseline for the first strict learning validation loop.

The baseline acceptance checklist lives at:

- [docs/development/openclaw-core-validation-checklist.md](development/openclaw-core-validation-checklist.md)
- [docs/development/openclaw-baseline-evaluation.md](development/openclaw-baseline-evaluation.md)
- [docs/development/openclaw-high-confidence-scenarios.md](development/openclaw-high-confidence-scenarios.md)

## What You See As a User

Most of the time ExperienceEngine stays quiet.

When it injects guidance, you will usually see a lightweight notice like:

```text
[ExperienceEngine] Injected 1 strategy hint for this task.
```

If there is no intervention, it stays silent during the task. The delivery decision is still recorded, so `ee inspect --last` and host-side inspection can explain whether ExperienceEngine skipped because the match was weak, the node was not safe to ship yet, or the decision stayed in a conservative path.

When ExperienceEngine is less certain but still sees a credible same-family match, it may choose a conservative injection instead of skipping entirely. In that case the injected block stays smaller by default, but mature low-risk nodes can still include a short `Goal / Steps / Avoid` structure when that makes the guidance more actionable.

ExperienceEngine now uses a deterministic match scorecard before live delivery. Same-repo, high-match experience can ship directly when trust is already strong. Same-repo conservative experience can be promoted after a successful high-match reuse. Cross-repo matches are allowed only as conservative candidates unless later evidence proves they are safe in the new scope.

When you inspect the latest turn, you may also see a learning decision such as:

```text
Learning status: captured
Learning reason: provider routing debugging exposed a reusable configuration pattern
```

or:

```text
Learning status: rejected
Learning reason: task stayed in expression-layer refinement: wording, copy, or presentation changes are recorded but not learned
```

This is intentional. ExperienceEngine now records broad task history, but it only promotes tasks with transferable decision value into the reusable experience pool.

When the host surfaces task-finalization metadata, ExperienceEngine can also show a lightweight feedback reminder after an injected turn so the user can quickly mark whether the hint helped or harmed.

You can also turn inline notices off:

```bash
ee config set notices.inline false
```

## Install And First Run

ExperienceEngine installation now starts from the host you want to use.

That means the first installation step belongs to the host you want to use, not to the `ee` CLI.

Install ExperienceEngine through the host setup flow for:

- `OpenClaw`
  - host-native plugin install:
    - `openclaw plugins install @alan512/experienceengine`
  - after installing, restart the gateway before the first real task:
    - `openclaw gateway restart`
  - `v0.5.0` contains the package-local supervisor/worker runtime, but plugin load alone proves only routine interaction
  - use the authenticated package activation flow below when `learning_runtime_active` is not yet true
  - operator-managed fallback:
    - `ee install openclaw`
  - strict production-runtime gate:
    - `ee verify openclaw-production`
  - if OpenClaw requests security approval, review the scan and explicitly rerun the EE-managed command with `--approve-host-security-scan`; the unsafe flag is never added silently
- `Codex`
  - EE-managed Codex setup:
    - `ee install codex`
  - native/manual fallback:
    - `codex mcp add experienceengine --env EXPERIENCE_ENGINE_HOME=$HOME/.experienceengine -- npx -y @alan512/experienceengine codex-mcp-server`
  - if you already have an ExperienceEngine home, replace `$HOME/.experienceengine` with that existing path; the managed installer preserves a previously registered host home instead of silently switching data roots
  - after the managed path, start a new Codex session in this repo so Codex-native hooks, MCP wiring, and the `AGENTS.md` instruction block are picked up
  - the manual MCP fallback only installs the tool surface; use `ee install codex` or `ee repair codex` when hook lifecycle capture/injection is needed
- `Claude Code`
  - host-native marketplace install:
    - add the bundled marketplace from GitHub:
    - `/plugin marketplace add https://github.com/Alan-512/ExperienceEngine.git`
  - install the bundled plugin:
    - `/plugin install experienceengine@experienceengine`
  - `ee install claude-code` remains the explicit operator fallback when you need direct hooks + MCP wiring outside the marketplace flow
  - after installation, start a new Claude Code session so the plugin hooks and bundled MCP config are loaded
- `Google Antigravity`
  - EE-managed setup:
    - `ee install antigravity`
  - validated headless CLI run:
    - `ee agy exec -C <project-path> "<prompt>"`
  - explicit Agent Desktop project activation:
    - `ee antigravity activate-project -C <project-path>`
  - after the managed path, start Antigravity Agent Desktop in an activated project or use `ee agy exec -C <project-path>` so the `.mcp.json` MCP configuration and `.agents/hooks.json` lifecycle hooks are loaded

Across all hosts, the intended product journey is the same:

1. install ExperienceEngine through the host-specific setup path
2. initialize shared ExperienceEngine state with `ee init`
3. restart or open a fresh host session until the repo is `Ready`
4. keep routine review and feedback inside the host agent when the host supports it cleanly
5. use `ee` as the operator fallback for validation, repair, and deeper inspection

The host-specific differences are real, but they sit underneath one shared model:

- installation mechanics differ by host
- routine interaction should feel similar wherever the host supports it
- CLI remains the explicit fallback and operator surface

Then continue using your host agent normally.

For most users, ExperienceEngine should stay in the background and be inspected through the host agent itself. Typical prompts are:

- "What did ExperienceEngine just inject?"
- "Why did that ExperienceEngine hint match?"
- "Mark the last ExperienceEngine intervention as helpful or harmful."

OpenClaw also supports these additional phase-2 routine questions in-session:

- "Is ExperienceEngine ready here?"
- "Is ExperienceEngine still warming up in this repo?"
- "Why didn't ExperienceEngine inject anything just now?"

For `OpenClaw`, `Codex`, `Claude Code`, and `Google Antigravity`, these routine follow-ups should stay in the host session first.

Use the `ee` CLI only when you need explicit validation, repair, or operator-style troubleshooting:

```bash
ee init
ee doctor <openclaw|claude-code|codex|antigravity>
ee status
```

Use `ee init` once to initialize ExperienceEngine's shared distillation, embedding, and secret state. New host installations should reuse that same shared EE state instead of asking you to re-enter the same API key per host window.

LLM fallback has two layers:

- ExperienceEngine provider fallback: `ee config set distillation.fallback_chain "gemini:gemini-2.5-flash,openai:gpt-4o-mini"`
- OpenRouter request fallback: `ee config set secret.EXPERIENCE_ENGINE_FALLBACK_MODELS "openai/gpt-4o-mini,deepseek/deepseek-chat"`

Use the ExperienceEngine fallback chain when a request should move to another configured provider after fallbackable HTTP statuses such as `429`, `500`, `502`, `503`, or `504`. Use OpenRouter fallback models when the primary provider is OpenRouter and you want the `models` list sent inside a single OpenRouter request. The fallback trigger statuses can be changed with `ee config set distillation.fallback_codes "429,503"`.

For Codex, `ee status` and `ee doctor codex` also show whether the `ee` CLI fallback is available on `PATH`. Codex MCP wiring can still be healthy without that fallback, but explicit operator commands such as `ee inspect --last` need either a PATH-visible `ee` binary or an explicit package invocation.

In practical terms, the routine loop currently looks like this:

- `Codex`
  - ask the host agent first for recent injections, matching reasons, and helped / harmed feedback
- `Claude Code`
  - ask the host agent first for recent injections, matching reasons, and helped / harmed feedback
- `OpenClaw`
  - ask the host agent first for recent injections, matching reasons, readiness, warm-up progress, recent silence, and helped / harmed feedback
  - keep CLI/operator fallback for deeper inspection, repair, and advanced management

For onboarding and first value, ExperienceEngine now uses a two-layer product model:

- `Setup state`
  - `Installed`
  - `Initialized`
  - `Ready`
- `Value state`
  - `Warming up`
  - `First value reached`

These are not one linear state machine.

Examples:

- a repo can already be `Ready` while still `Warming up`
- a repo can be `Ready` and already have reached first value

In practice:

- installation into a host gets you to `Installed`
- `ee init` moves the shared product state toward `Initialized`
- a restart or new host session usually completes `Ready`
- real task activity moves the value layer from `Warming up` toward `First value reached`

`First value reached` must be tied to visible output from real work, such as:

- a visible real task record
- a visible learning decision
- a visible intervention

These do **not** count by themselves:

- a static onboarding message
- a generic warm-up explanation
- a recommendation not tied to a real observed task run

You do **not** need to clone the repository or run `pnpm build` for normal user installation.

### Operational CLI

After the host setup succeeds, the host agent remains the primary interaction surface.

Use `ee` for:

- one-time shared initialization after the first host setup
- installation validation
- repair guidance
- runtime status checks
- learning and intervention inspection
- quick helped / harmed feedback

ExperienceEngine surfaces are grouped by workflow tier:

- `Routine`
  - host-first review and feedback
  - `ee status`
  - `ee doctor <host>`
  - `ee inspect --last`
  - `ee helped` / `ee harmed`
- `Operator`
  - `ee install|upgrade|repair <host>`
  - `ee inspect review`
  - `ee inspect hygiene`
  - `ee inspect export-drafts`
  - managed backup/export/import/rollback
- `Advanced / experimental`
  - `ee maintenance ...`
  - raw evaluation commands
  - broker internals and developer diagnostics

Workflow tier is separate from mutation risk. Operator review, hygiene, and export drafts are operator-tier but read-only. Install, upgrade, import, and rollback are operator-tier and high-impact.

`ee status` and `ee doctor` now also summarize recent retrieval health in product language. `ee status` defaults to a concise daily progress view; use `ee status --verbose` when you need host wiring details, model configuration, raw retrieval counters, second-opinion counters, and full learning-quality diagnostics.

Their roles are intentionally different:

- `ee status`
  - daily progress view
  - current setup/value state
  - next practical step
- `ee doctor <host>`
  - explicit validation and troubleshooting
  - install and wiring verification
  - repair-oriented next steps

The most useful inspection command during product debugging is still:

```bash
ee inspect --last
```

That output now tells you both:

- what was injected
- whether the finalized task was learned, rejected from learning, or only kept as runtime history
- whether the intervention was a normal injection or a conservative one
- why ExperienceEngine acted that way in plain language instead of only raw gate fields
- how trustworthy the selected guidance currently is

For deeper operator diagnostics of the host execution trace layer, you can inspect retained trace summaries and, when explicitly enabled, a specific diagnostic trace snapshot:

```bash
ee inspect --trace <capsule-id>
ee inspect --trace <capsule-id> --projection
```

- `ee inspect --last --verbose`: Displays trace summary/provenance when runtime trace evidence was used but no full diagnostic snapshot was retained.
- `ee inspect --trace <capsule-id>`: Displays full diagnostic trace snapshot information only when a snapshot or legacy trace capsule exists, including normalized events, host capability profile, capture metadata, and evidence references.
- `ee inspect --trace <capsule-id> --projection`: Projects a retained diagnostic snapshot into a standard `ExperienceInput` record, evaluates learning eligibility (e.g. failure repair success, retry patterns), and displays projected tool events and eligibility diagnostics in plain text.

When you inspect a specific node, ExperienceEngine now also shows a lightweight quality judgment layer:

- a `quality band` (`strong`, `building`, or `risky`)
- a short summary, reason codes, readable reasons, and evidence references behind that judgment
- a review-only action for `building` or `risky` guidance when a closer look is useful
- a compact applicability profile covering best fit, scope validity, confidence, risk, and when to avoid reuse

The same Quality Band model is also exposed in host-native MCP inspection payloads and in `ee inspect repo` as a current-scope distribution. It is explanatory only: it helps you judge whether guidance is strong, still building, or risky, but it does not by itself change delivery state, mutate nodes, or gate injection.

### Operator Review Workflow

Use the operator review workflow when you want one read-only checkpoint across the current repo before deciding what to inspect next.

The fallback CLI entry point is:

```bash
ee inspect review
```

For a specific workspace and a smaller checklist:

```bash
ee inspect review --cwd /path/to/repo --limit 3
```

The review report summarizes:

- repo policy health and circuit state
- hygiene finding counts
- export draft counts
- autonomous governance status, recent automatic actions, guarded actions, failures, and legacy pending approvals
- recommended review order
- prioritized review items
- review-only next actions
- drill-down commands for detailed read-only reports

The drill-down commands are manual inspection steps:

```bash
ee inspect repo
ee inspect hygiene
ee inspect export-drafts
ee inspect governance
```

In MCP-capable hosts, ask the host agent to inspect the ExperienceEngine operator review or read `experienceengine://review`. The structured payload uses the same source names as the CLI: `repo_policy`, `hygiene`, `export_drafts`, and `governance`.

This workflow is intentionally read-only. It does not:

- restore repo policy
- cool or retire nodes
- write attribution or review events
- create backups or snapshots
- write instruction files, skills, or docs
- export guidance automatically
- open a console or mutation dashboard
- coordinate team workflows

## Autonomous Hygiene Governance

ExperienceEngine runs hygiene governance automatically through the host-attached runtime. Host startup, prompt lookup, posttask finalization, and stop events wake a cheap due check for the current canonical scope. The persisted schedule, lease, backoff, finding hash, and action budget decide whether real governance work runs, so frequent host restarts do not multiply governance frequency.

The automatic path applies validated experience-store mutations without routine user approval:

- exact duplicate merges that preserve evidence
- near-duplicate and conflicted semantic merges with evidence preserved
- stale shadow-only retirement
- delivery downgrades from live eligibility to conservative delivery
- quarantine for invalidated or harmed live guidance
- guarded promotion to conservative delivery
- guarded soft-retire for records that should leave delivery

High-impact experience-node actions use guarded automatic execution instead of approval. Guarded execution keeps the mutation reversible and conservative: rows are not physically deleted, before/after snapshots and affected row hashes are recorded, merged or promoted canonical guidance cannot become directly eligible for live injection, and retired/conflicting source nodes are quarantined. Broad rewrites, export writing, repo policy changes, and restore actions are outside automatic experience-store governance and are rejected unless a separate explicit workflow owns them.

Read-only inspection surfaces:

```bash
ee inspect governance
ee inspect review
```

MCP resources:

```text
experienceengine://governance
experienceengine://governance/approvals
experienceengine://review
```

Fallback drain command:

```bash
ee maintenance governance drain --cwd /path/to/repo
```

That command is for explicit operator troubleshooting or catch-up. It uses the same scheduler, lease, validator, audit, and rollback snapshot path as host-attached governance. An optional keeper can wake the same drain path for stricter wall-clock schedules, but it does not bypass budgets, leases, deterministic validators, guarded execution rules, or rollback safeguards.

## Governed Portable Experience

ExperienceEngine connects retrieval, attribution, and lifecycle layers to support governed, cautious sharing of experience nodes across different repositories and scopes.

### Portability Bands & SemVer Compatibility

When retrieving experience candidates for a task, ExperienceEngine calculates a cross-repository compatibility scorecard. This scorecard determines how safe the guidance is in the current environment using the following **Portability Bands**:
- `validated_portable`: Highly compatible. The node matches the local programming language, and any shared dependencies have verified SemVer compatibility.
- `cautiously_portable`: Medium compatibility. Reused with caution, usually limited to conservative delivery state until local execution success is demonstrated.
- `incompatible`: The node requires frameworks or languages not present in the current project. Delivery is blocked.

Compatibility scoring factors in **SemVer matching penalties**:
- Framework or dependency version mismatches subtract penalty points (e.g. minor or major version drift).
- Language mismatches (e.g., trying to use Python guidance in a TypeScript codebase) flag the node as incompatible.

### Causal Trajectory Attribution

During post-task finalization, ExperienceEngine verifies if the host agent actually adopted the expectations of an injected hint. This **Causal Trajectory Attribution** produces a precise verdict:
- `adoption_detected`: The agent successfully matched the expectations of the injected hint (e.g., specific file modifications or CLI tool executions).
- `non_adoption_detected`: The agent completed the task but did not follow the suggested guidance.
- `unverifiable`: The task ended in failure, or outcomes could not be traced clearly.

These trajectory verdicts prevent false positives in outcome attribution, ensuring that helpfulness or harm is only counted if the agent actually used the guidance.

### Quarantine Leases & Shadow-Probe Release

To ensure quarantined nodes have a safe path back to eligibility without erasing historical lessons:
1. **Quarantine Leases**: When a node is quarantined due to harm or invalidation, it is given a lease duration.
2. **Lease Expiration**: Once the lease expires, the node is transitioned to a special `shadow_probe` delivery state.
3. **Shadow Probe**: While in `shadow_probe`, the node is evaluated silently behind the scenes. If the agent finishes tasks using this guidance without any new harm, a **no-harm pass counter** is incremented.
4. **Conservative Restoration**: Upon successfully passing the shadow probe, the node is restored to `conservative_only` delivery (rather than direct live eligibility).
5. **Repeated-Harm Retirement**: If the node causes repeated harm during its shadow probe or live recovery, it is permanently retired.
6. **Preservation of History**: Throughout this cycle, historical helped/harmed counts, original delivery states, and release attempt logs are strictly preserved.

## How MCP Interaction Works

For `Codex` and `Claude Code`, ExperienceEngine is designed to keep routine review and management inside the host session first.

That means after installation, you usually do not leave the agent session to manage ExperienceEngine. Instead, you ask the agent naturally and the host uses its native EE wiring for routine interaction.

This is one host-specific implementation of the same shared product model described above:

- host-native install or wiring gets the repo to `Installed`
- shared `ee init` state gets the product to `Initialized`
- a fresh host session gets the repo to `Ready`
- routine inspection and feedback stay inside the host when the host supports them cleanly
- CLI remains the explicit fallback and operator path

Typical examples:
- "What did ExperienceEngine just inject?"
- "Why did that ExperienceEngine hint match?"
- "Show the recent injected turns."
- "List active warning nodes."
- "Pause ExperienceEngine for this project."
- "Mark the last ExperienceEngine intervention as helpful or harmful."
- "Create a backup of ExperienceEngine state."
- "Rollback ExperienceEngine to backup `<id>`."

### MCP Interaction Model

`Codex` exposes a layered MCP surface:

- `Direct tools`
  - core loop actions like lookup, recording important tool outcomes, finalize, last-feedback, capabilities, and doctor
- `Routine read resources`
  - read-only state like last interaction, recent history, repo summary, and routine node views
- `Brokered advanced actions`
  - lower-frequency inspect, admin, maintenance, and high-impact plan/execute flows exposed through a small broker tool surface instead of many direct schemas

For `Codex`, this means routine host-native interaction stays discoverable, while long-tail admin and maintenance actions are reached through brokered actions rather than public prompts or one-tool-per-action registration.

`Claude Code` still uses both `hooks` and `MCP`:

- hooks drive runtime capture and injection
- MCP drives inspect, control, and operational interaction

So the two hosts share the same product model, but they do not expose the exact same interaction shape.

For high-impact operator actions outside routine experience governance, ExperienceEngine does not execute immediately. It uses a:

```text
plan -> review -> explicit confirmation -> execute
```

workflow.

That applies to:
- install
- repair
- upgrade
- backup
- export
- import
- rollback

Autonomous experience governance is different: it is constrained to the experience store and uses guarded automatic execution plus rollback snapshots instead of routine human approval.

## Current Governance Surface

Today, ExperienceEngine's minimal governance surface is:

- MCP for in-session inspection and control
- `ee` CLI for explicit fallback, maintenance, and operator workflows

A dedicated standalone review UI is still deferred. The current product shape is intentionally CLI/MCP-first rather than UI-first.

That does not mean every host surface is identical today:

- `Codex` and `Claude Code` use MCP-native host interaction for routine use
- `OpenClaw` now supports six in-session routine interaction families through the plugin path:
  - what was injected
  - why it matched
  - helped / harmed feedback
  - readiness in the current repo
  - warm-up / first-value progress
  - recent silence on the latest turn
- advanced operator actions still remain more explicit in CLI across all hosts

## Host-Specific Setup

Before installing ExperienceEngine into any host, make sure the host CLI itself already works on this machine:

- `openclaw` for the OpenClaw plugin/runtime integration
- `claude` for the Claude Code adapter
- `codex` for the Codex adapter

ExperienceEngine wires itself into an existing host environment. It does not install the host CLI for you.

If you are installing ExperienceEngine into a repo for the first time, prefer:

```bash
ee install codex
```

That command wires the shared MCP server and writes the local `AGENTS.md` instruction block for the current repo.

If you are operating or debugging the product directly, the explicit fallback commands still exist:

```bash
ee install openclaw
ee install claude-code
ee install codex
```

These are operator-facing controls, not the preferred public onboarding path.

## Embedding Retrieval

ExperienceEngine now supports a multi-provider embedding stack inside a staged hybrid retrieval pipeline.

Retrieval is now hybrid by default:

- query normalization and rewrite happen first so retrieval keeps engineering intent when prompt wording shifts
- lexical and semantic retrieval are fused into one candidate shortlist instead of treating semantic retrieval as the unquestioned main path
- policy enrichment stays separate from retrieval scoring, so maturity and governance signals do not replace retrieval evidence
- reranking can promote a better-matching candidate above older score advantages, especially when an external reranker is configured

Default behavior (`embeddingProvider = "api"`):

- ExperienceEngine first tries API embeddings for better retrieval quality
- if `OPENAI_API_KEY` is present, it prefers OpenAI `text-embedding-3-small`
- otherwise it tries Gemini `gemini-embedding-001` when `GEMINI_API_KEY` is present
- otherwise it tries Jina `jina-embeddings-v3` when `JINA_API_KEY` is present
- if no API provider is available, or the selected API provider fails, ExperienceEngine falls back to legacy hash-based retrieval
- the managed local model is optional and is no longer installed by default

Prompt-time behavior:

- first-turn or prompt-only retrieval may not have any tool names or failure signatures yet
- ExperienceEngine treats those fields as opportunistic evidence, not required retrieval inputs
- when prompt-only evidence is sparse, lexical, semantic, and policy stages still run with the task summary and context summary alone

Offline behavior (`embeddingProvider = "local"`):

- install the optional local runtime first: `npm install -g @huggingface/transformers`
- the default local model is `Xenova/multilingual-e5-small`
- the default dtype is `q8`, so ExperienceEngine prefers the quantized ONNX artifact
- the first semantic retrieval may trigger a one-time model download
- the cache lives under `~/.experienceengine/models/embeddings`
- if a cached ONNX file is corrupted, ExperienceEngine clears that model cache and retries once before falling back

Legacy behavior (`embeddingProvider = "legacy"`):

- ExperienceEngine skips semantic providers and uses the legacy hash-based retrieval path only

Environment variables:

- `OPENAI_API_KEY` — enables OpenAI embeddings and makes OpenAI the preferred API provider
- `GEMINI_API_KEY` — enables Gemini `gemini-embedding-001`
- `JINA_API_KEY` — enables Jina `jina-embeddings-v3`
- `EXPERIENCE_ENGINE_EMBEDDING_API_PROVIDER` — force a specific API provider (`openai`, `jina`, or `gemini`)

Notes:

- The default embedding strategy on this branch is now `api` instead of `local`. Users who want fully local retrieval should install the optional local runtime and set `embeddingProvider = "local"` explicitly.
- `ee install ...` and `ee doctor ...` warn when `npm` or `pnpm` is pointed at a non-official registry
- the recommended registry for managed model downloads is `https://registry.npmjs.org`
- `ee doctor ...` reports a first-value readiness summary so users can see how much captured evidence exists before the first durable node is promoted

### Offline Profiles, Manifest Health, and Vector Migration

For air-gapped or sensitive environments, ExperienceEngine supports fully offline semantic retrieval:
- **Offline Profiles**: Set `embeddingProvider = "local"` and configure an offline profile (such as `strict-offline`) in settings. ExperienceEngine will rely entirely on local ONNX model assets.
- **Manifest Health Verification**: When running `ee doctor`, the system validates the health of the local offline profile. It reads the model manifest files, checks checksums, and detects corrupted assets. If a strict-offline profile is active but files are missing or corrupt, a warning is raised automatically.
- **Vector Migration**: Upgrading embedding models or altering dimensions requires vector migration. ExperienceEngine tracks vector migration status for every node (`migrated`, `pending`, etc.) along with timestamps and migration errors. You can inspect this status via `ee inspect node:<id>` or `ee doctor`.

Maintenance:

```bash
ee maintenance embeddings-reset
```

That command clears the configured managed embedding cache for the active model and immediately rebuilds it.

### OpenClaw Advanced Commands

Explicit host install:

```bash
ee install openclaw
```

What happens:
- ExperienceEngine installs as an OpenClaw plugin/runtime integration (not `src/adapters/`)
- OpenClaw runtime events are used for intervention and persistence
- host-native routine interaction may become active before the package-local production background runtime
- package-local supervisor/worker activation is accepted only when closure, signed install attestation, configuration/route, activation handshake, lease, and fencing evidence are current
- async hybrid posttask review stays disabled by default unless the runtime is explicitly overridden
- management remains mostly through CLI fallback today
- install ends with a short cold-start note so users know capture is active before the first formal hint appears

#### Activate the exact installed package generation

After plugin installation and Gateway restart, first initialize shared provider and embedding state:

```bash
ee init
```

Then ask the authenticated OpenClaw command surface for the current runtime projection:

```text
/experienceengine_status
```

If the result reports that package activation initialization is required, prepare an exact revision-bound request:

```text
/experienceengine_prepare_package_activation
```

This command is read-only. Its `result` field contains the exact values required for initialization:

```text
package_generation_id
expected_projection_revision
expected_launch_revision
control_request_id
authorization_id
```

Copy the complete `result` JSON object without editing it:

```text
/experienceengine_initialize_package_activation <exact-result-json>
```

The initialization command requires all five identity, revision, and idempotency fields above. It uses compare-and-swap revisions and exact package-generation matching. Missing fields, changed required fields, cross-generation payloads, and stale requests are rejected rather than being applied to a different package or runtime authority.

Finally verify the operator projection:

```bash
ee verify openclaw-production
```

`ee verify openclaw-production` returns non-zero when package, configuration, route, activation handshake, supervisor, worker, schema, or fencing authority is missing or stale. It does not turn a local-pack run into published-channel evidence.

#### Runtime control commands

The package-local OpenClaw service also exposes authenticated controls:

```text
/experienceengine_pause_learning <json>
/experienceengine_resume_learning <json>
/experienceengine_retry_blocked_system_work <json>
/experienceengine_request_drain <json>
/experienceengine_repair_explanation
```

Mutating controls require the current revision-bound JSON fields returned by status or the corresponding preparation/repair flow. Prefer `repair_explanation` when the required next action or payload is unclear; do not guess revisions.

Do not collapse these states:

```text
interaction_active
learning_runtime_active
production_learning_ready
```

Plugin load or a successful routine command can satisfy only `interaction_active`. `ee status` is informational; `ee verify openclaw-production` returns non-zero when current production authority is incomplete or stale.

Published evidence is also split:

```text
installed_artifact_runtime_smoke_passed
artifact_runtime_validated
support_claim_allowed
```

The first is direct installed-package execution, the second additionally requires a real OpenClaw install/Gateway/agent-turn/restart path, and the final support claim remains gated by channel, platform, upgrade/repair, documentation, and quality/benchmark evidence.

Local state changes:
- OpenClaw plugin install state and config are updated through the OpenClaw CLI
- ExperienceEngine-managed product state is written under `~/.experienceengine`

Useful commands:

```bash
ee doctor openclaw
ee repair openclaw
ee upgrade openclaw
ee verify openclaw-production
```

First validation:

```bash
ee doctor openclaw
openclaw plugins info experienceengine
```

Success looks like:
- doctor reports the adapter as installed
- OpenClaw reports the plugin as loaded or enabled
- `ee verify openclaw-production` reports current production authority when the background runtime is actually active
- `production_learning_ready` may still remain false until the exact published channel and quality gates pass

Current prepublication evidence:

- local-pack real-host preflight passed on OpenClaw `2026.4.1` under Linux/WSL and native Windows
- local-pack real-host preflight also passed on OpenClaw `2026.7.1` under WSL with Node `24.18.0`
- the previous tarball is superseded by later documentation and remediation changes and must not be published
- only an artifact rebuilt from the committed `v0.5.0` release boundary and matching the external candidate evidence may be published
- exact npm and ClawHub `v0.5.0` artifacts still require independent post-publication validation
- the matched-block benchmark/quality gate remains separate from runtime activation

### Claude Code Advanced Commands

Explicit host install:

```bash
ee install claude-code
```

What happens:
- ExperienceEngine writes Claude hooks into the global user settings file `~/.claude/settings.json`
- ExperienceEngine registers its shared MCP server with Claude Code globally (`-s user` mode)
- install ends with a short cold-start note so users know capture is active before the first formal hint appears

Local state changes:
- global user settings file `~/.claude/settings.json`
- ExperienceEngine-managed product state under `~/.experienceengine`
- Any duplicate project-local settings and `.mcp.json` files are automatically pruned to prevent conflicts

After install:
- new Claude sessions use the updated hooks
- agent-side inspection and management can happen through MCP

Useful commands:

```bash
ee doctor claude-code
ee upgrade claude-code
```

First validation:

```bash
ee doctor claude-code
claude mcp get experienceengine
```

Success looks like:
- doctor reports Claude hooks as present
- `claude mcp get experienceengine` shows the server as connected
- in a new Claude session, the agent can inspect ExperienceEngine through MCP

Host note:
- Claude uses both `hooks` and `MCP`
- hooks drive runtime capture and injection
- MCP drives inspect/control/operational interaction

### Codex Advanced Commands

Explicit host install:

```bash
ee install codex
```

What happens:
- ExperienceEngine registers its shared MCP server with Codex
- new Codex MCP sessions can use ExperienceEngine interaction surfaces
- ExperienceEngine writes Codex-native global hooks and enables the `hooks` feature
- first use after managed setup may require manual Codex hook approval; open `/hooks` and approve `UserPromptSubmit`, `PostToolUse`, and `Stop`
- install ends with a short cold-start note so users know capture is active before the first formal hint appears

Local state changes:
- global user hook config in `~/.codex/hooks.json`
- global user Codex MCP config in the active runtime's `~/.codex/config.toml`
- ExperienceEngine-managed product state under `~/.experienceengine`
- Any duplicate project-local hook configurations and `.cmd` launchers are pruned safely

Useful commands:

```bash
ee doctor codex
ee upgrade codex
ee codex exec -C /path/to/repo -s read-only "Say ok and exit."
printf "Say ok and exit." | ee codex exec -C /path/to/repo -s read-only -
ee codex exec --ee-session-id ci-smoke-1 -C /path/to/repo -s read-only "Say ok and exit."
```

First validation:

```bash
ee doctor codex
codex mcp get experienceengine
```

Success looks like:
- doctor reports the adapter as installed
- `codex mcp get experienceengine` shows the server as enabled
- doctor reports Codex hooks as healthy and the hooks feature as enabled
- a new `codex exec` session can call ExperienceEngine MCP resources or tools

Host note:
- ExperienceEngine installs a longer `startup_timeout_sec` for Codex automatically
- this avoids MCP handshake failures on slower local startups
- ExperienceEngine installs Codex-native hooks for prompt-time guidance, tool-result capture, and stop/finalize writeback
- `UserPromptSubmit` is synchronous because it decides prompt-time injection
- `PostToolUse` and `Stop` are queued for background processing by default
- `PreToolUse` is not registered by default; set `EXPERIENCE_ENGINE_CODEX_PRETOOL_HOOK_ENABLED=1` only for synchronous gating experiments
- `~/.codex/hooks.json` is the global user hook wiring, while MCP config is owned by each runtime's Codex home
- Codex hook review is not CLI-only: any Codex surface that loads the global hooks can ask for approval; approve `UserPromptSubmit`, `PostToolUse`, and `Stop`, plus `PreToolUse` only when explicitly enabled
- `ee repair codex` refreshes global hooks and removes stale project-scoped ExperienceEngine MCP config
- if Codex still cannot see ExperienceEngine or doctor reports hook drift, run `ee repair codex`
- `ee codex exec` is a deterministic wrapper for non-interactive runs
- the wrapper owns `lookup -> child codex exec -> record -> finalize` outside the child process
- for wrapped runs, ExperienceEngine removes the nested `experienceengine` MCP server from the child Codex config temporarily so lifecycle evidence is not double-written
- use prompt `-` when you want the wrapper to read task instructions from stdin; child Codex still receives a wrapped prompt argument and does not inherit stdin
- use `--ee-session-id <id>` when CI or debugging needs a stable ExperienceEngine session id
- `codex exec review` is not wrapped yet; keep using native Codex review or the MCP/CLI surfaces for review workflows

Diagnostics note:
- `ee doctor codex` separates global hook health, hooks feature enablement, MCP registration, and PATH-visible `ee` CLI fallback
- Windows Codex App can have healthy global hooks even when a Windows `codex` CLI is not installed
- WSL Codex CLI must have its own MCP registration in the WSL Codex home; it reuses the same global `~/.codex/hooks.json`
- on WSL, `ee doctor codex` also warns when `codex` resolves to a WindowsApps shim instead of the Linux Codex CLI

### Google Antigravity Advanced Commands

Antigravity has multiple product entries. ExperienceEngine's current `antigravity` adapter targets **Antigravity Agent Desktop**, the standalone **Antigravity CLI (`agy`)**, and **Antigravity IDE** lifecycle hooks. EE data remains user-level under the configured ExperienceEngine home, while project experience is isolated by project scope. Antigravity uses user-level plugin and MCP configuration by default; project `.mcp.json` and `.agents/hooks.json` activation remains available as a fallback.

Explicit host install:

```bash
ee install antigravity
```

What happens:
- ExperienceEngine records user-level Antigravity adapter state under the configured ExperienceEngine home.
- By default, it installs user-level Antigravity plugin wiring for Agent Desktop and `agy` CLI, plus global Agent Desktop MCP configuration.
- It does not need to activate each new Agent Desktop project after user-level install. If global plugin loading is unavailable or needs recovery, use the project activation fallback.
- The hook contract spike still runs before hook installation; if it fails, installation falls back to `mcp_only`. Use `--mcp-only` when you intentionally want only the MCP inspection/control surface.
- All command paths in user-level `hooks.json` and `mcp_config.json` are registered using absolute paths resolved via `packageRoot` for portability.
- Antigravity supports both stdio MCP calls and an advanced artifact-assisted analyzer that automatically parses planning and verification markdown files (`task.md`, `walkthrough.md`, `implementation_plan.md`) to reconstruct outcomes and check off completed tasks.
- The installation ends with a short cold-start note so users know capture is active before the first formal hint appears.

Local state changes:
- user-level ExperienceEngine adapter state under `~/.experienceengine`
- Agent Desktop plugin under `~/.gemini/config/plugins/experienceengine`
- Antigravity CLI plugin under `~/.gemini/antigravity-cli/plugins/experienceengine`
- Agent Desktop MCP config under `~/.gemini/antigravity/mcp_config.json`
- fallback project MCP config in `.mcp.json` only when `ee antigravity activate-project -C <project-path>` or a compatibility path writes it
- fallback project hooks config in `.agents/hooks.json` only when project activation is used

Useful commands:

```bash
ee doctor antigravity
ee repair antigravity
ee upgrade antigravity
ee antigravity activate-project -C <project-path>
ee agy exec -C <project-path> "<prompt>"
```

First validation:

```bash
ee doctor antigravity
```

Success looks like:
- doctor reports the adapter as installed and healthy.
- global plugin/MCP files are created with the correct configurations and paths.
- Antigravity Agent Desktop loads the MCP server successfully and can call an ExperienceEngine MCP tool such as `experienceengine_get_capabilities`.
- `ee agy exec -C <project-path>` loads the user-level plugin hooks in headless CLI mode while still supplying `--add-dir` for reliable workspace discovery.

Validated CLI invocation:

```bash
ee agy exec -C <project-path> "<prompt>"
```

Host note:
- The Antigravity IDE application is tracked as a separate surface. `ee doctor antigravity` reports the IDE command, whether an IDE MCP tool cache has been observed under `~/.gemini/antigravity-ide/mcp/experienceengine`, and whether IDE hooks are observed through the shared global plugin surface. Real-host validation showed the IDE loads `~/.gemini/config/plugins/experienceengine/hooks.json` for lifecycle hooks while storing its MCP tool cache under the IDE-specific state directory.
- The PATH-visible `antigravity` command may point to the separate IDE shell. `ee doctor antigravity` reports that command separately and uses `agy` for CLI availability.
- `ee agy exec -C <project>` invokes `agy --add-dir <project>` internally because direct `agy` workspace discovery can fail on Windows when symlink creation is unavailable.
- CLI/operator commands such as `ee install antigravity`, `ee doctor antigravity`, and `ee repair antigravity` configure and inspect user-level adapter state plus global plugin/MCP wiring. `ee antigravity activate-project -C <project>` remains the fallback for project-local MCP and hook wiring.
- ExperienceEngine installs relative-path hooks for prompt-time guidance (`PreInvocation`), tool-use allow/capture (`PreToolUse`, `PostToolUse`), and session-end finalization (`Stop`).
- To prevent infinite loops during preinvocation, the hook mutations are structured to gate execution per session ID, ensuring safe one-time injection per prompt context.
- If Antigravity says hooks are misconfigured or MCP registration is missing, run `ee repair antigravity`.

Developer source-repo host validation lives at:

- [docs/development/source-repo-host-validation.md](development/source-repo-host-validation.md)

Source-repo host validation matrix:

| Host path | Source-repo validation status | Notes |
| --- | --- | --- |
| Windows Codex App | Validated | Project hooks are healthy, default events are `UserPromptSubmit`, `PostToolUse`, and `Stop`, and task runs write to the shared project scope. |
| WSL Codex CLI | Validated | WSL `codex exec` with shared `.codex/hooks.json` writes to the same ExperienceEngine home and `scope_id` as Windows Codex App. |
| Claude Code on Windows | Validated | Real hooks fired `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, and `SessionEnd`; `SessionEnd` drained through the background queue and wrote to the shared project scope. |
| OpenClaw on WSL | Validated | WSL OpenClaw gateway loaded the current ExperienceEngine plugin and wrote task runs to the shared ExperienceEngine home. ExperienceEngine now resolves the real project root from OpenClaw hook payloads or nearby repo markers before scope resolution. If OpenClaw only reports its global workspace, ExperienceEngine isolates that session instead of reusing unrelated global-workspace experience. OpenClaw validated with `openrouter/tencent/hy3-preview:free`; the bare `tencent/hy3-preview:free` id is marked missing by OpenClaw's model registry. |
| Google Antigravity Agent Desktop on Windows | Validated global plugin wiring | Real Agent Desktop loaded user-level plugin hooks; MCP `experienceengine_get_capabilities` was callable; real hooks fired `PreInvocation`, `PreToolUse`, `PostToolUse`, and `Stop`; `PreToolUse` accepted `{ "decision": "allow" }`; task runs wrote to the shared project scope without project-local `.mcp.json` or `.agents/hooks.json`. |
| Antigravity CLI (`agy`) on Windows | Validated with `--add-dir`; wrapper added | `agy --add-dir <project-path> --print --dangerously-skip-permissions --print-timeout 5m "<prompt>"` loaded hooks and wrote task runs to the shared project scope. Direct project auto-discovery without `--add-dir` can fail when Windows symlink creation is not permitted, so users should prefer `ee agy exec -C <project>`. |
| Antigravity IDE on Windows | Validated global plugin hooks | Real IDE Agent loaded `~/.gemini/config/plugins/experienceengine/hooks.json`, fired `PreInvocation`, `PreToolUse`, `PostToolUse`, and `Stop`, and wrote task runs to the shared project scope. IDE MCP tool cache files are stored under `~/.gemini/antigravity-ide/mcp/experienceengine`; no IDE-specific EE plugin directory is required for validated hooks. |

This matrix is source-repo validation only. Published npm package validation and host-native marketplace validation must be called out separately during release preparation.

Developer validation docs:

- [docs/development/codex-runtime-validation.md](development/codex-runtime-validation.md)
- [docs/development/codex-runtime-validation-checklist.md](development/codex-runtime-validation-checklist.md)

## CLI Fallback

Even though MCP is the main user interaction model for Claude/Codex, the `ee` CLI still exists as:
- fallback
- automation
- scripting
- recovery path

Use MCP first for normal day-to-day interaction inside Claude/Codex.

For the common routine loop, keep these actions in the host session first:
- ask what ExperienceEngine just injected
- ask why it matched
- mark the last intervention as helped or harmed

Use `ee` directly when:
- the host session cannot currently access MCP
- you are scripting or automating locally
- you are repairing or recovering a broken local setup

Useful fallback commands:

```bash
# Routine fallback
ee inspect --last
ee inspect --trace <capsule-id>
ee inspect --trace <capsule-id> --projection
ee helped
ee harmed

# Operator inspection
ee inspect recent injected 10
ee inspect review
ee inspect repo
ee inspect hygiene
ee inspect export-drafts
ee inspect backups
ee inspect active
ee inspect node <id>
ee inspect state retired
ee inspect type warning
ee feedback --last helped
ee feedback node <id> harmed
ee disable scope
ee enable scope
ee cool node <id>
ee retire node <id>
ee backup
ee export
ee import <snapshot-path>
ee rollback <backup-id>
```

## Doctor, Repair, and Upgrade

If something feels wrong in normal use, ask the host agent to inspect ExperienceEngine first.

Use the `ee` CLI when you need explicit local validation or the host cannot currently surface enough state.

CLI fallback:

```bash
ee doctor openclaw
ee doctor claude-code
ee doctor codex
```

What doctor tells you:
- whether the adapter is installed
- recorded version vs current local package version
- whether the host wiring is present
- where ExperienceEngine is storing its state
- whether a newer remote release exists
- how many raw task records / task runs / pending candidates / formal nodes exist today
- the next step to reach first durable value when the system is still warming up

Use repair when host wiring drifted and you need an explicit local recovery step:

```bash
ee repair openclaw
```

Upgrade refreshes host wiring against the current local package version:

```bash
ee upgrade openclaw
ee upgrade claude-code
ee upgrade codex
```

Recommended order:

1. `ee doctor <adapter>`
2. if wiring drifted, run repair or upgrade
3. start a new host session
4. verify the host can see ExperienceEngine again

## Backups, Exports, Imports, and Rollbacks

ExperienceEngine now supports managed state snapshots.

### What gets included

Managed snapshots cover ExperienceEngine-owned state only:
- SQLite database
- `settings.json`
- adapter install-state files

This is deliberate. ExperienceEngine does **not** try to snapshot every host's private internal files.

### Default locations

Managed artifacts live under:

```text
~/.experienceengine/backups
~/.experienceengine/exports
```

### Backup

Use backup when you want a restorable checkpoint of current ExperienceEngine state.

In an MCP-capable host, ask the agent to create a backup first. The agent should show a plan and only execute after you confirm.

CLI fallback:

```bash
ee backup
ee inspect backups
```

### Export

Use export when you want a portable snapshot of ExperienceEngine-managed state that can later be imported.

This is useful for:
- moving to another machine
- preserving a known-good state before larger experiments

CLI fallback:

```bash
ee export
```

### Import

Import restores a valid ExperienceEngine snapshot directory.

Before import overwrites current ExperienceEngine state, the system creates a safeguard backup automatically.

In MCP-capable hosts, prefer asking the agent to plan the import first.

CLI fallback:

```bash
ee import <snapshot-path>
```

### Rollback

Rollback restores one of the managed backups.

Before rollback overwrites current ExperienceEngine state, the system also creates a safeguard backup automatically.

In MCP-capable hosts, prefer asking the agent to plan the rollback first.

CLI fallback:

```bash
ee rollback <backup-id>
```

## Recommended Safe Workflow

For risky changes:

1. Create a backup first.
2. Make the host or product changes.
3. If the result is bad, rollback to the backup.
4. If moving state between environments, use export/import rather than copying files manually.

## Experience Review and Control

### Review what happened last

For normal day-to-day usage in Claude Code or Codex, ask the host agent first:

- "What did ExperienceEngine just inject?"
- "Why did that ExperienceEngine hint match?"

Fallback CLI:

```bash
ee inspect --last
```

This view now also shows:
- the injected node trigger pattern
- origin record ids when they exist
- the node evidence summary attached to each injected hint

### Review recent injected turns

In MCP-capable hosts, ask:

- "Show the recent injected ExperienceEngine turns."

Fallback CLI:

```bash
ee inspect recent injected 10
```

### Review current node inventory

In MCP-capable hosts, ask for the current active strategies or warnings first.

Fallback CLI:

```bash
ee inspect active
ee inspect type warning
ee inspect state cooling
ee inspect node <id>
```

### Manually correct feedback

In MCP-capable hosts, prefer asking the agent to mark the last intervention as helpful or harmful.

Fallback CLI:

```bash
ee helped
ee harmed
ee feedback --last helped
ee feedback --last harmed
ee feedback node <id> helped
ee feedback node <id> harmed
```

`ee helped` and `ee harmed` are shortcuts for the common “last injected guidance helped / harmed” case.

### Temporarily pause interventions

In MCP-capable hosts, prefer asking the agent to pause or resume ExperienceEngine for the current scope.

Fallback CLI:

```bash
ee disable scope
ee enable scope
```

## Current Product Boundary

What is already mature enough to use:
- real runtime integration on OpenClaw
- real runtime integration on Claude Code
- real runtime integration on Codex
- MCP-native inspect/control workflows on Claude/Codex
- in-session routine review and feedback workflows on OpenClaw
- managed state backup and restore over MCP `plan + confirm`

What is still intentionally simpler:
- OpenClaw does not use the same MCP-native interaction shape as Claude/Codex
- user-facing docs are lighter than a full product site
- CLI fallback is still more complete than some host-side surfaces

## If Something Feels Wrong

Start here:

```bash
ee doctor openclaw
ee doctor claude-code
ee doctor codex
```

If the runtime state itself is the concern:
- create a backup first
- then repair or upgrade

If ExperienceEngine guidance is noisy rather than broken:
- inspect active nodes
- mark the last intervention as harmed
- cool or retire the offending node
- disable the current scope temporarily if needed

### Quick troubleshooting by host

OpenClaw:
- run `ee doctor openclaw`
- if doctor shows wiring drift, run `ee repair openclaw`
- if OpenClaw still looks stale, open a new host session or restart the gateway

Claude Code:
- run `ee doctor claude-code`
- verify `claude mcp get experienceengine`
- if MCP or hooks are missing, run `ee install claude-code`
- start a new Claude session after reinstall or upgrade

Codex:
- run `ee doctor codex`
- verify `codex mcp get experienceengine`
- if doctor reports disabled hooks, stale Claude hook entries, WSL path drift, or missing MCP wiring, run `ee repair codex`
- then start a new Codex session so the MCP connection is recreated

### What ExperienceEngine does not back up

Managed backups and exports do not include:
- host-private internal state unrelated to ExperienceEngine
- your repositories or workspace files
- provider credentials
- arbitrary third-party plugin state

If those matter to you, back them up separately.

## Trace Capture Boundaries and Limits

ExperienceEngine implements a strict, governed host execution trace layer. EE can read rich host trace evidence during a task, but normal operation persists distilled experience and bounded trace provenance rather than raw agent execution recordings.

To prevent database bloat, performance bottlenecks, and potential privacy leaks, the trace capture pipeline enforces the following boundaries and limits:

- **Runtime Capture vs Diagnostic Persistence**: `traceCaptureEnabled` allows trace evidence to inform attribution and distillation. It does not by itself persist new `trace_capsules`, `trace_events`, or `trace_evidence_refs` rows.
- **Normal Persistence**: Normal finalized tasks can retain trace completeness, host/capability status, evidence category counts, dropped/redaction summary, source provenance, and learning use/rejection reason.
- **Diagnostic Snapshots**: Full trace details are persisted only when diagnostic snapshot persistence is explicitly enabled for a host or scope. Deprecated full-capture settings are treated as compatibility aliases for diagnostic snapshots.

### 1. Default Configuration & Privacy
- **Metadata-Only Mode**: By default, full trace event payload persistence is disabled (`traceMetadataOnly = true`). The system only records lightweight trace metadata (completeness, duration, counts) until explicitly enabled via configuration.
- **Secrets Redaction**: All raw execution trace event payloads, tool arguments, error messages, and command outputs are run through a robust multi-pass redaction filter. Standard API keys, passwords, bearer tokens, and private credentials are automatically scrubbed and replaced with SHA-256 deterministic markers before database write.

### 2. Physical Limits & TTL Bounds
- **Event Limits**: A single diagnostic snapshot is limited to a maximum of **100 events** (`traceMaxEvents`). If a long-running agent session generates more events, the oldest events are trimmed in a rolling fashion to enforce the boundary.
- **Evidence References Limits**: Each diagnostic snapshot retains at most **50 evidence references** (`traceMaxEvidenceRefs`) (e.g. file paths, task artifacts, and transcript hooks).
- **Time-to-Live (TTL)**: Diagnostic snapshots are cleaned up automatically. Any retained snapshot and its nested events/references older than **30 days** (`traceRetentionDays`) are permanently pruned during background maintenance cycles.

### 3. Evaluation and Completeness Gates
- **Completeness Threshold**: Trace capsules carry a computed completeness score from `0.0` to `1.0`. Low-completeness traces (completeness score `< 0.6`) or traces marked as unstable are restricted from promoting candidates to high-value active status unless they satisfy strict minimum evidence rules.
