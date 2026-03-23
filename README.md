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
- API-first semantic retrieval with graceful fallback:
  - OpenAI `text-embedding-3-small`
  - Gemini `gemini-embedding-001`
  - Jina `jina-embeddings-v3`
  - managed local embedding fallback
  - legacy hash-based fallback
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

ExperienceEngine no longer treats the `ee` CLI as the first-install entrypoint.

Install ExperienceEngine through the host-native command for the host you want to use:

- `OpenClaw`
  - `openclaw plugins install experienceengine`
- `Codex`
  - `codex mcp add experienceengine --env EXPERIENCE_ENGINE_HOME=$HOME/.experienceengine -- npx -y experienceengine codex-mcp-server`
- `Claude Code`
  - add the bundled marketplace:
    - `/plugin marketplace add Alan-512/ExperienceEngine`
  - install the bundled plugin:
    - `/plugin install experienceengine@experienceengine`
  - `ee install claude-code` remains the operator fallback when you need direct hooks + MCP wiring outside the marketplace flow

After the host-native installation completes, use:

```bash
ee doctor <openclaw|claude-code|codex>
ee status
ee maintenance embedding-smoke
```

## Prerequisites

Before installing an adapter, make sure the host CLI already works on this machine:

- `openclaw` for the OpenClaw plugin/runtime integration
- `claude` for the Claude Code adapter
- `codex` for the Codex adapter

ExperienceEngine does not install those host CLIs for you. It wires itself into an already working host environment.

## Installation Model

ExperienceEngine now treats installation and operations as separate concerns:

- installation belongs to the host
- validation and maintenance belong to `ee`

That means:

- `Codex` uses a Codex-native MCP integration flow
- `Claude Code` uses Claude-native plugin assets and marketplace distribution
- `OpenClaw` uses plugin/runtime integration

Once installation is complete, `ee` becomes the operational surface for:

- health checks
- repair guidance
- status inspection
- learning and intervention feedback

## Advanced Per-Host Commands

If you need explicit per-host control as an operator or while developing the product, these commands still exist:

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

These commands are operator-oriented fallback controls. They are not the preferred public onboarding path.

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

## Embedding Defaults

Current default behavior:

- `embeddingProvider = "api"`
- provider priority:
  - OpenAI when `OPENAI_API_KEY` is present
  - Gemini when `GEMINI_API_KEY` is present
  - Jina when `JINA_API_KEY` is present
- if no API provider is available, ExperienceEngine falls back to the managed local embedding model

Useful environment variables:

- `EXPERIENCE_ENGINE_EMBEDDING_PROVIDER=local`
  - force fully local embedding behavior
- `EXPERIENCE_ENGINE_EMBEDDING_API_PROVIDER=openai|gemini|jina`
  - force a specific API embedding provider

## User Guide

See the full user guide here:

- [ExperienceEngine User Guide](./docs/user-guide.md)

The user guide covers installation, host-specific notes, first-run validation, pack workflows, compiler/deploy commands, troubleshooting, and maintenance operations.
