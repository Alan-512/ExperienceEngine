# ExperienceEngine User Guide

## What ExperienceEngine Is

ExperienceEngine is a local experience layer for coding agents.

It watches real tasks, extracts short reusable guidance, and later decides whether to inject that guidance into similar work. It also records whether the intervention helped or harmed the result.

In practice, this means:
- repeated debugging or test-fix tasks can get a short strategy hint
- noisy or harmful prior patterns can be cooled or retired
- the system gradually learns which guidance is actually useful

## What You See As a User

Most of the time ExperienceEngine stays quiet.

When it injects guidance, you will usually see a lightweight notice like:

```text
[ExperienceEngine] Injected 1 strategy hint for this task.
```

If there is no intervention, it stays silent.

You can also turn inline notices off:

```bash
ee config set notices.inline false
```

## How MCP Interaction Works

For `Codex` and `Claude Code`, ExperienceEngine is designed to work mainly through MCP.

That means after installation, you usually do not leave the agent session to manage ExperienceEngine. Instead, you ask the agent naturally and the agent can call ExperienceEngine MCP resources, prompts, and tools for you.

Typical examples:
- "What did ExperienceEngine just inject?"
- "Show the recent injected turns."
- "List active warning nodes."
- "Pause ExperienceEngine for this project."
- "Mark the last ExperienceEngine intervention as harmful."
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

## Host-Specific Setup

### OpenClaw

Install:

```bash
ee install openclaw
```

What happens:
- ExperienceEngine installs as an OpenClaw plugin/runtime adapter
- OpenClaw runtime events are used for intervention and persistence
- management remains mostly through CLI fallback today

Useful commands:

```bash
ee doctor openclaw
ee repair openclaw
ee upgrade openclaw
```

### Claude Code

Install:

```bash
ee install claude-code
```

What happens:
- ExperienceEngine writes Claude hooks into `.claude/settings.local.json`
- ExperienceEngine registers its shared MCP server with Claude Code for the current project

After install:
- new Claude sessions use the updated hooks
- agent-side inspection and management can happen through MCP

Useful commands:

```bash
ee doctor claude-code
ee upgrade claude-code
```

### Codex

Install:

```bash
ee install codex
```

What happens:
- ExperienceEngine registers its shared MCP server with Codex
- new Codex MCP sessions can use ExperienceEngine interaction surfaces

Useful commands:

```bash
ee doctor codex
ee upgrade codex
```

## CLI Fallback

Even though MCP is the main user interaction model for Claude/Codex, the `ee` CLI still exists as:
- fallback
- automation
- scripting
- recovery path

Useful fallback commands:

```bash
ee inspect --last
ee inspect recent injected 10
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
ee feedback --last helped
ee feedback --last harmed
ee feedback node <id> helped
ee feedback node <id> harmed
```

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
