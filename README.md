# ExperienceEngine

[简体中文版 README](./README.zh-CN.md)

ExperienceEngine is a local experience-intervention layer for coding agents.

It learns short, task-specific guidance from real coding work, injects that guidance into later similar tasks, and records whether the intervention helped or harmed the outcome.

Supported hosts today:
- `OpenClaw`
- `Claude Code`
- `Codex`

## What It Does

ExperienceEngine is not a general memory store and not a replacement context engine.

It focuses on four things:
- capture task/tool/outcome signals from the host agent
- compress useful prior experience into short `strategy` or `warning` nodes
- decide whether to inject guidance for a similar task
- update node state from real `helped` / `harmed` outcomes

## Why It Is Not Just Memory

Most agent memory systems answer:

- what facts should be remembered
- what user preferences should be carried forward
- what repository context should be loaded next time

ExperienceEngine answers a different question:

- when should prior experience intervene
- which `strategy` or `warning` should be injected
- whether that intervention actually helped
- whether the experience should stay active, cool down, or retire

In practice:
- memory keeps facts and preferences
- ExperienceEngine governs reusable coding tactics and failure-avoidance guidance

## What You Can Use Today

Already available in the repository:
- host integration for `OpenClaw`, `Claude Code`, and `Codex`
- MCP-native interaction surfaces plus CLI fallback
- local embedding-based retrieval
- quick inspection and feedback commands such as `ee inspect --last`, `ee helped`, and `ee harmed`
- local Experience Pack workflow:
  - `draft`
  - `review`
  - `publish`
  - `rollback`
- compiler and deploy workflow for host instruction files:
  - `AGENTS.md`
  - `CODEX.md`
  - `CLAUDE.md`
  - GitHub agent profile markdown

## Quick Start

From a source checkout:

```bash
pnpm install
pnpm build
node dist/cli/index.js doctor codex
```

If the package is installed as a binary, use:

```bash
ee doctor codex
```

## Prerequisites

Before installing an adapter, make sure the host CLI already works on this machine:

- `openclaw` for the OpenClaw plugin/runtime integration
- `claude` for the Claude Code adapter
- `codex` for the Codex adapter

ExperienceEngine does not install those host CLIs for you. It wires itself into an already working host environment.

## Install By Host

```bash
ee install openclaw
ee install claude-code
ee install codex
```

Notes:
- `OpenClaw` uses plugin/runtime integration (not `src/adapters/`) and CLI fallback for management.
- `Claude Code` installs both hooks and the shared ExperienceEngine MCP server.
- `Codex` installs the shared ExperienceEngine MCP server.
- `ee install ...` and `ee doctor ...` now warn if `npm` or `pnpm` uses a non-official registry, because managed model downloads are most reliable with `https://registry.npmjs.org`.
- successful `ee install ...` also explains the cold-start expectation: capture starts immediately, but formal experience usually appears after a few similar tasks in the same repo.

## Data Location

By default, ExperienceEngine stores product data under:

```text
~/.experienceengine
```

That managed state includes:
- SQLite database
- product settings
- per-adapter install state
- managed local embedding model cache under `~/.experienceengine/models/embeddings`
- managed backups and exports

## User Guide

See the full user guide here:

- [ExperienceEngine User Guide](./docs/user-guide.md)

The user guide covers installation, host-specific notes, first-run validation, pack workflows, compiler/deploy commands, troubleshooting, and maintenance operations.
