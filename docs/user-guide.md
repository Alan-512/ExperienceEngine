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
- `Codex`
  - EE-managed Codex setup:
    - `ee install codex`
  - native/manual fallback:
    - `codex mcp add experienceengine --env EXPERIENCE_ENGINE_HOME=$HOME/.experienceengine -- npx -y @alan512/experienceengine codex-mcp-server`
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

Across all three hosts, the intended product journey is the same:

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

For `OpenClaw`, `Codex`, and `Claude Code`, these routine follow-ups should stay in the host session first.

Use the `ee` CLI only when you need explicit validation, repair, or operator-style troubleshooting:

```bash
ee init
ee doctor <openclaw|claude-code|codex>
ee status
```

Use `ee init` once to initialize ExperienceEngine's shared distillation, embedding, and secret state. New host installations should reuse that same shared EE state instead of asking you to re-enter the same API key per host window.

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

`ee status` and `ee doctor` now also summarize recent retrieval health in product language. They still show the raw counters, but they additionally explain whether ExperienceEngine is mostly injecting, mostly staying conservative, or still skipping too many close-match tasks in the current repo.

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

When you inspect a specific node, ExperienceEngine now also shows a lightweight quality judgment layer:

- a `quality band` (`strong`, `building`, or `risky`)
- the short drivers behind that judgment
- a compact applicability profile covering best fit, scope validity, confidence, risk, and when to avoid reuse

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
- recommended review order
- prioritized review items
- review-only next actions
- drill-down commands for detailed read-only reports

The drill-down commands are manual inspection steps:

```bash
ee inspect repo
ee inspect hygiene
ee inspect export-drafts
```

In MCP-capable hosts, ask the host agent to inspect the ExperienceEngine operator review or read `experienceengine://review`. The structured payload uses the same source names as the CLI: `repo_policy`, `hygiene`, and `export_drafts`.

This workflow is intentionally read-only. It does not:

- restore repo policy
- cool or retire nodes
- write attribution or review events
- create backups or snapshots
- write instruction files, skills, or docs
- export guidance automatically
- open a console or mutation dashboard
- coordinate team workflows

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

For high-impact actions, ExperienceEngine does not execute immediately. It uses a:

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
- if the API provider fails, ExperienceEngine falls back to the managed local model
- if the local model fails, ExperienceEngine falls back to legacy hash-based retrieval

Prompt-time behavior:

- first-turn or prompt-only retrieval may not have any tool names or failure signatures yet
- ExperienceEngine treats those fields as opportunistic evidence, not required retrieval inputs
- when prompt-only evidence is sparse, lexical, semantic, and policy stages still run with the task summary and context summary alone

Offline behavior (`embeddingProvider = "local"`):

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

- The default embedding strategy on this branch is now `api` instead of `local`. Users who want fully local retrieval should set `embeddingProvider = "local"` explicitly.
- `ee install ...` and `ee doctor ...` warn when `npm` or `pnpm` is pointed at a non-official registry
- the recommended registry for managed model downloads is `https://registry.npmjs.org`
- `ee doctor ...` reports a first-value readiness summary so users can see how much captured evidence exists before the first durable node is promoted

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
- OpenClaw uses the shared background learning loop by default
- async hybrid posttask review stays disabled by default unless the runtime is explicitly overridden
- management remains mostly through CLI fallback today
- install ends with a short cold-start note so users know capture is active before the first formal hint appears

Local state changes:
- OpenClaw plugin install state and config are updated through the OpenClaw CLI
- ExperienceEngine-managed product state is written under `~/.experienceengine`

Useful commands:

```bash
ee doctor openclaw
ee repair openclaw
ee upgrade openclaw
```

First validation:

```bash
ee doctor openclaw
openclaw plugins info experienceengine
```

Success looks like:
- doctor reports the adapter as installed
- OpenClaw reports the plugin as loaded or enabled
- a real task later produces ExperienceEngine runtime records under `~/.experienceengine`

### Claude Code Advanced Commands

Explicit host install:

```bash
ee install claude-code
```

What happens:
- ExperienceEngine writes Claude hooks into `.claude/settings.local.json`
- ExperienceEngine registers its shared MCP server with Claude Code for the current project
- install ends with a short cold-start note so users know capture is active before the first formal hint appears

Local state changes:
- project file `.claude/settings.local.json`
- project file `.mcp.json`
- ExperienceEngine-managed product state under `~/.experienceengine`

These project files are local host-wiring artifacts. They are intended for local use and should normally stay out of version control.

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
- ExperienceEngine writes Codex-native project hooks and enables `codex_hooks`
- install ends with a short cold-start note so users know capture is active before the first formal hint appears

Local state changes:
- project hook config in `.codex/hooks.json`
- Codex MCP config in the active runtime's `~/.codex/config.toml`
- ExperienceEngine-managed product state under `~/.experienceengine`

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
- doctor reports Codex hooks as healthy and `codex_hooks` as enabled
- a new `codex exec` session can call ExperienceEngine MCP resources or tools

Host note:
- ExperienceEngine installs a longer `startup_timeout_sec` for Codex automatically
- this avoids MCP handshake failures on slower local startups
- ExperienceEngine installs Codex-native hooks for prompt-time guidance, tool-result capture, and stop/finalize writeback
- `UserPromptSubmit` is synchronous because it decides prompt-time injection
- `PostToolUse` and `Stop` are queued for background processing by default
- `PreToolUse` is not registered by default; set `EXPERIENCE_ENGINE_CODEX_PRETOOL_HOOK_ENABLED=1` only for synchronous gating experiments
- in a Windows Codex App + WSL Codex CLI repo, `.codex/hooks.json` is shared project hook wiring, while MCP config is owned by each runtime's Codex home
- `ee repair codex` refreshes project hooks and removes stale project-scoped ExperienceEngine MCP config
- if Codex still cannot see ExperienceEngine or doctor reports hook drift, run `ee repair codex`
- `ee codex exec` is a deterministic wrapper for non-interactive runs
- the wrapper owns `lookup -> child codex exec -> record -> finalize` outside the child process
- for wrapped runs, ExperienceEngine removes the nested `experienceengine` MCP server from the child Codex config temporarily so lifecycle evidence is not double-written
- use prompt `-` when you want the wrapper to read task instructions from stdin; child Codex still receives a wrapped prompt argument and does not inherit stdin
- use `--ee-session-id <id>` when CI or debugging needs a stable ExperienceEngine session id
- `codex exec review` is not wrapped yet; keep using native Codex review or the MCP/CLI surfaces for review workflows

Diagnostics note:
- `ee doctor codex` separates project hook health, `codex_hooks` enablement, MCP registration, and PATH-visible `ee` CLI fallback
- Windows Codex App can have healthy project hooks even when a Windows `codex` CLI is not installed
- WSL Codex CLI must have its own MCP registration in the WSL Codex home; it can still reuse the same repo `.codex/hooks.json`
- on WSL, `ee doctor codex` also warns when `codex` resolves to a WindowsApps shim instead of the Linux Codex CLI

Developer source-repo host validation lives at:

- [docs/development/source-repo-host-validation.md](development/source-repo-host-validation.md)

Source-repo host validation matrix:

| Host path | Source-repo validation status | Notes |
| --- | --- | --- |
| Windows Codex App | Validated | Project hooks are healthy, default events are `UserPromptSubmit`, `PostToolUse`, and `Stop`, and task runs write to the shared project scope. |
| WSL Codex CLI | Validated | WSL `codex exec` with shared `.codex/hooks.json` writes to the same ExperienceEngine home and `scope_id` as Windows Codex App. |
| Claude Code on Windows | Validated | Real hooks fired `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, and `SessionEnd`; `SessionEnd` drained through the background queue and wrote to the shared project scope. |
| OpenClaw on WSL | Validated | WSL OpenClaw gateway loaded the 0.2.1 ExperienceEngine plugin and wrote task runs to the shared ExperienceEngine home. ExperienceEngine now resolves the real project root from OpenClaw hook payloads or nearby repo markers before scope resolution. If OpenClaw only reports its global workspace, ExperienceEngine isolates that session instead of reusing unrelated global-workspace experience. OpenClaw validated with `openrouter/tencent/hy3-preview:free`; the bare `tencent/hy3-preview:free` id is marked missing by OpenClaw's model registry. |

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
ee inspect --last
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
ee helped
ee harmed
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
