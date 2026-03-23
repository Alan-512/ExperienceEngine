# ExperienceEngine User Guide

## What ExperienceEngine Is

ExperienceEngine is a local experience layer for coding agents.

It watches real tasks, extracts short reusable guidance, and later decides whether to inject that guidance into similar work. It also records whether the intervention helped or harmed the result.

In practice, this means:
- repeated debugging or test-fix tasks can get a short strategy hint
- noisy or harmful prior patterns can be cooled or retired
- the system gradually learns which guidance is actually useful

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

If there is no intervention, it stays silent.

When the host surfaces task-finalization metadata, ExperienceEngine can also show a lightweight feedback reminder after an injected turn so the user can quickly mark whether the hint helped or harmed.

You can also turn inline notices off:

```bash
ee config set notices.inline false
```

## Install And First Run

ExperienceEngine installation is now host-native.

That means the first installation step belongs to the host you want to use, not to the `ee` CLI.

Install ExperienceEngine through the host-specific flow for:

- `OpenClaw`
  - planned one-step command:
    - `openclaw plugins install experienceengine`
  - current status:
    - blocked until the public npm package `experienceengine` is published
- `Codex`
  - planned one-step command:
    - `codex mcp add experienceengine --env EXPERIENCE_ENGINE_HOME=$HOME/.experienceengine -- npx -y experienceengine codex-mcp-server`
  - current status:
    - blocked until the public npm package `experienceengine` is published
- `Claude Code`
  - add the bundled marketplace from GitHub:
    - `/plugin marketplace add https://github.com/Alan-512/ExperienceEngine.git`
  - install the bundled plugin:
    - `/plugin install experienceengine@experienceengine`
  - `ee install claude-code` remains the explicit operator fallback when you need direct hooks + MCP wiring outside the marketplace flow

Then use the `ee` CLI for validation and operations:

```bash
ee doctor <openclaw|claude-code|codex>
ee status
```

You do **not** need to clone the repository or run `pnpm build` for normal user installation.

### Operational CLI

After a host-native installation succeeds, `ee` becomes the shared operational surface.

Use it for:

- installation validation
- repair guidance
- runtime status checks
- learning and intervention inspection
- quick helped / harmed feedback

## How MCP Interaction Works

For `Codex` and `Claude Code`, ExperienceEngine is designed to work mainly through MCP.

That means after installation, you usually do not leave the agent session to manage ExperienceEngine. Instead, you ask the agent naturally and the agent can call ExperienceEngine MCP resources, prompts, and tools for you.

Typical examples:
- "What did ExperienceEngine just inject?"
- "Show the recent injected turns."
- "List active warning nodes."
- "Pause ExperienceEngine for this project."
- "Mark the last ExperienceEngine intervention as harmful."
- "Record quick feedback for the last ExperienceEngine intervention."
- "Create a backup of ExperienceEngine state."
- "Rollback ExperienceEngine to backup `<id>`."

### MCP Interaction Model

ExperienceEngine exposes three MCP categories:

- `Resources`
  - read-only state like last interaction, recent history, nodes, doctor output, update state, and backups
- `Prompts`
  - reusable workflows that guide the agent to inspect or manage ExperienceEngine safely
- `Tools`
  - executable actions like feedback, scope toggles, node lifecycle changes, and high-impact operations

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

## Experience Pack v1

Experience Pack v1 is a **local shared-directory registry** for reusable experience assets.

It lets you take a group of already-validated nodes and move them through a minimal lifecycle:

```text
draft -> review -> publish -> rollback
```

Pack v1 is intentionally local-first:

- packs live under `~/.experienceengine/packs`
- packs are host-agnostic assets, not host-specific config fragments
- multiple local repos can reuse the same published pack
- there is no team sync, remote distribution, or UI workflow in v1

Current CLI surface:

```bash
ee pack list
ee pack inspect <pack-id>
ee pack status <pack-id> [version] [agents|codex|github|claude] [repo-path]
ee pack draft create <pack-id> <node-id[,node-id...]> [name...]
ee pack review <pack-id> <description...>
ee pack publish <pack-id>
ee pack compile <pack-id> [version]
ee pack compile <pack-id> [version] codex
ee pack compile <pack-id> [version] github
ee pack compile <pack-id> [version] claude
ee pack deploy <pack-id> [version] [agents|codex|github|claude] [repo-path] [--dry-run] [--force] [--status-only]
ee pack rollback <pack-id> <version>
```

Use this when you want to turn a set of proven nodes into a managed local asset instead of leaving them only in SQLite state.

### Compiler v1

Compiler v1 turns a published or rolled-back Experience Pack into host-friendly static artifacts.

It is intentionally conservative:

- it only reads Pack files that already exist in the local registry
- it only exports a static artifact
- it does **not** auto-write into your repo root

Example:

```bash
ee pack compile auth-debug-pack
ee pack compile auth-debug-pack codex
ee pack compile auth-debug-pack github
ee pack compile auth-debug-pack claude
ee pack deploy auth-debug-pack agents /path/to/repo --dry-run
ee pack deploy auth-debug-pack codex /path/to/repo
ee pack deploy github-pack github /path/to/repo --force
ee pack deploy auth-debug-pack claude /path/to/repo
ee pack deploy auth-debug-pack agents /path/to/repo --status-only
ee pack status auth-debug-pack agents /path/to/repo
```

Default output location:

```text
~/.experienceengine/packs/<pack-id>/compiled/<target>/<version>/
```

Artifacts produced:

- `AGENTS.md` for `agents` target
- `CODEX.md` for `codex` target
- `CLAUDE.md` for `claude` target
- `<pack-id>.agent.md` for `github` target
- `compile-report.json`

Deploying compiled artifacts:

- `agents` target writes to `<repo>/AGENTS.md`
- `codex` target writes to `<repo>/CODEX.md`
- `claude` target writes to `<repo>/CLAUDE.md`
- `github` target writes to `<repo>/.github/agents/<pack-id>.md`

Use `--dry-run` to preview the destination without writing files. Existing files are protected by default; use `--force` only when you intentionally want to overwrite the destination. Use `--status-only` to inspect whether the destination is `missing`, `up_to_date`, or `drifted` without writing anything.

If you only want the deployment state without invoking the deploy command shape, use:

```bash
ee pack status <pack-id> [version] [agents|codex|github|claude] [repo-path]
```

Compiler visibility is also exposed through:

- `ee pack list`
- `ee pack inspect <pack-id>`
- `ee inspect learning`
- `ee doctor <adapter>`

These surfaces show which targets the current Pack version has already compiled, whether a published Pack is stale, and the latest compile target/time.

## Host-Specific Setup

Before installing ExperienceEngine into any host, make sure the host CLI itself already works on this machine:

- `openclaw` for the OpenClaw plugin/runtime integration
- `claude` for the Claude Code adapter
- `codex` for the Codex adapter

ExperienceEngine wires itself into an existing host environment. It does not install the host CLI for you.

If you are operating or debugging the product directly, the explicit fallback commands still exist:

```bash
ee install openclaw
ee install claude-code
ee install codex
```

These are operator-facing controls, not the preferred public onboarding path.

## Embedding Retrieval

ExperienceEngine now supports a multi-provider embedding stack for semantic retrieval.

Default behavior (`embeddingProvider = "api"`):

- ExperienceEngine first tries API embeddings for better retrieval quality
- if `OPENAI_API_KEY` is present, it prefers OpenAI `text-embedding-3-small`
- otherwise it tries Gemini `gemini-embedding-001` when `GEMINI_API_KEY` is present
- otherwise it tries Jina `jina-embeddings-v3` when `JINA_API_KEY` is present
- if the API provider fails, ExperienceEngine falls back to the managed local model
- if the local model fails, ExperienceEngine falls back to legacy hash-based retrieval

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
- install ends with a short cold-start note so users know capture is active before the first formal hint appears

Local state changes:
- Codex MCP config in `~/.codex/config.toml`
- ExperienceEngine-managed product state under `~/.experienceengine`

Useful commands:

```bash
ee doctor codex
ee upgrade codex
```

First validation:

```bash
ee doctor codex
codex mcp get experienceengine
```

Success looks like:
- doctor reports the adapter as installed
- `codex mcp get experienceengine` shows the server as enabled
- a new `codex exec` session can call ExperienceEngine MCP resources or tools

Host note:
- ExperienceEngine installs a longer `startup_timeout_sec` for Codex automatically
- this avoids MCP handshake failures on slower local startups
- if Codex still cannot see ExperienceEngine in new sessions, re-run `ee install codex`

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

Use `ee` directly when:
- the host session cannot currently access MCP
- you are scripting or automating locally
- you are repairing or recovering a broken local setup

Useful fallback commands:

```bash
ee inspect --last
ee inspect recent injected 10
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

Use doctor first if something looks wrong:

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

Use repair when host wiring drifted:

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

In an MCP-capable host, ask the agent to create a backup. The agent should first show you a plan and only execute after you confirm.

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

CLI fallback:

```bash
ee import <snapshot-path>
```

### Rollback

Rollback restores one of the managed backups.

Before rollback overwrites current ExperienceEngine state, the system also creates a safeguard backup automatically.

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

Fallback CLI:

```bash
ee inspect --last
```

This view now also shows:
- the injected node trigger pattern
- origin record ids when they exist
- the node evidence summary attached to each injected hint

In MCP-capable hosts, ask:

- "What did ExperienceEngine just inject?"

### Review recent injected turns

Fallback CLI:

```bash
ee inspect recent injected 10
```

In MCP-capable hosts, ask:

- "Show the recent injected ExperienceEngine turns."

### Review current node inventory

Fallback CLI:

```bash
ee inspect active
ee inspect type warning
ee inspect state cooling
ee inspect node <id>
```

### Manually correct feedback

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
- managed state backup and restore over MCP `plan + confirm`

What is still intentionally simpler:
- OpenClaw does not yet have the same MCP-native user interaction layer as Claude/Codex
- user-facing docs are lighter than a full product site
- CLI fallback is still more complete than some host-native surfaces

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
- if a new Codex session still cannot see ExperienceEngine, run `ee install codex`
- then start a new Codex session so the MCP connection is recreated

### What ExperienceEngine does not back up

Managed backups and exports do not include:
- host-private internal state unrelated to ExperienceEngine
- your repositories or workspace files
- provider credentials
- arbitrary third-party plugin state

If those matter to you, back them up separately.
