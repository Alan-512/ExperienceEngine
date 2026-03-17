# ExperienceEngine

[简体中文版 README](./README.zh-CN.md)

ExperienceEngine is a local experience-intervention layer for coding agents.

It learns short, task-specific guidance from real coding work, injects that guidance into later similar tasks, and records whether the intervention helped or harmed the outcome.

Current core-learning baseline:
- `OpenClaw` is the primary validation host for candidate capture, async distillation, injection, feedback, and retirement.
- `Claude Code` and `Codex` remain supported product hosts and reuse shared ExperienceEngine interaction surfaces.
- See [docs/development/openclaw-core-validation-checklist.md](docs/development/openclaw-core-validation-checklist.md) for the baseline acceptance flow.
- See [docs/development/openclaw-baseline-evaluation.md](docs/development/openclaw-baseline-evaluation.md) for the baseline snapshot workflow.
- See [docs/development/openclaw-high-confidence-scenarios.md](docs/development/openclaw-high-confidence-scenarios.md) for repeatable high-confidence OpenClaw scenario runs.

Current validated hosts:
- `OpenClaw` for runtime/plugin integration
- `Claude Code` for hooks + MCP interaction
- `Codex` for MCP-first runtime and interaction

## What It Does

ExperienceEngine is not a general memory store and not a replacement context engine.

It focuses on four things:
- capture task/tool/outcome signals from the host agent
- compress useful prior experience into short `strategy` or `warning` nodes
- decide whether to inject guidance for a similar task
- update node state from real `helped` / `harmed` outcomes

## Current Product State

The current repository is past the scaffold phase.

What is already implemented and validated:
- real runtime integration on OpenClaw
- real runtime integration on Claude Code
- real runtime integration on Codex
- OpenClaw-first baseline for core learning validation
- MCP-native interaction surface with `Resources`, `Prompts`, and `Tools`
- CLI fallback for inspection, feedback, management, install, repair, and upgrade
- MCP `plan + confirm` workflows for:
  - install / repair / upgrade
  - backup / export / import / rollback

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

## Data Location

By default, ExperienceEngine stores product data under:

```text
~/.experienceengine
```

That managed state includes:
- SQLite database
- product settings
- per-adapter install state
- managed backups and exports

## User Guide

See the full user guide here:

- [ExperienceEngine User Guide](./docs/user-guide.md)

The user guide includes:
- host-specific prerequisites
- which local files ExperienceEngine modifies during installation
- first-run validation steps
- MCP vs CLI fallback usage
- backup / export / import / rollback workflows
- troubleshooting notes for OpenClaw, Claude Code, and Codex
- OpenClaw baseline evaluation workflow
- OpenClaw high-confidence scenario evaluation workflow

## Validation

The repository currently validates with:

```bash
pnpm check
openspec validate --specs
openspec validate --changes --strict
```
