# ExperienceEngine

[简体中文版 README](./README.zh-CN.md)

ExperienceEngine is a local experience-intervention layer for coding agents.

It learns short, task-specific guidance from real coding work, injects that guidance into later similar tasks, and records whether the intervention helped or harmed the outcome.

Supported hosts today:
- `OpenClaw`
- `Claude Code`
- `Codex`

## The Problem It Solves

Coding agents repeat the same mistakes for a simple reason: most sessions do not accumulate reusable execution experience in a governed way.

The usual failure modes are:
- a fix worked yesterday, but the next similar session starts from zero again
- memory systems keep adding facts and preferences, but they rarely retire low-value guidance
- as recalled memory grows, context gets heavier and the agent's attention gets diluted

ExperienceEngine is designed for that gap. It does not try to remember everything. It tries to decide:
- when prior experience should intervene
- which `strategy` or `warning` should be injected
- whether that intervention actually helped
- whether the experience should stay active, cool down, or retire

**Memory does addition. ExperienceEngine does governance.**

## ExperienceEngine vs Memory

| Question | Memory Systems | ExperienceEngine |
|---|---|---|
| Persist facts and preferences across sessions | Yes | Not the primary job |
| Capture repeated failure → fix → success paths | Partial, usually manual | Yes, from real task signals |
| Track whether a recalled item helped or harmed | Usually no | Yes, per intervention |
| Retire stale or harmful guidance automatically | Usually no | Yes, cooling and retirement are built in |
| Keep context small and intervention-focused | Not the main goal | Yes, it injects short task-specific guidance |

## Where It Sits In The Agent Loop

```text
User task
  -> before_prompt_build: retrieve and inject matching experience
  -> agent reasoning + tools: capture failures, retries, corrections, and outcomes
  -> task finalization: distill new candidates into reusable experience
  -> helped / harmed feedback: promote, cool, or retire nodes
```

ExperienceEngine works at the context layer. It does not modify the host model's weights.

## Experience Lifecycle

```text
task signals
  -> candidate
  -> active
  -> cooling
  -> retired
```

Each node moves through that lifecycle using real task outcomes, not just time-based cleanup. Helpful experience gets reinforced; harmful experience gets cooled or retired.

## What You Can Use Today

Already available in the repository:
- host integration for `OpenClaw`, `Claude Code`, and `Codex`
- MCP-native interaction surfaces plus CLI/operator fallback
- API-first semantic retrieval with graceful fallback:
  - OpenAI `text-embedding-3-small`
  - Gemini `gemini-embedding-001`
  - Jina `jina-embeddings-v3`
  - managed local embedding fallback
  - legacy hash-based fallback
- host-agent driven inspection and feedback, with CLI fallback commands such as `ee inspect --last`, `ee helped`, and `ee harmed`

For a more detailed explanation of what ExperienceEngine records and how an experience node is structured, see:

- [Experience Model Overview](./docs/development/experience-model.md)

## Quick Start

ExperienceEngine no longer treats the `ee` CLI as the first-install entrypoint.

Install ExperienceEngine through the host setup flow for the host you want to use:

- `OpenClaw`
  - host-native plugin install:
    - `openclaw plugins install @alan512/experienceengine`
  - after installing, restart the OpenClaw gateway before the first real task:
    - `openclaw gateway restart`
- `Codex`
  - EE-managed Codex setup:
    - `ee install codex`
  - native/manual fallback:
    - `codex mcp add experienceengine --env EXPERIENCE_ENGINE_HOME=$HOME/.experienceengine -- npx -y @alan512/experienceengine codex-mcp-server`
  - after either path, start a new Codex session in the repo so the MCP wiring and `AGENTS.md` instruction block are picked up
- `Claude Code`
  - host-native marketplace install:
    - add the bundled marketplace from GitHub:
    - `/plugin marketplace add https://github.com/Alan-512/ExperienceEngine.git`
  - install the bundled plugin:
    - `/plugin install experienceengine@experienceengine`
  - `ee install claude-code` remains the operator fallback when you need direct hooks + MCP wiring outside the marketplace flow
  - after installation, start a new Claude Code session so the plugin hooks and bundled MCP config are loaded

After the host setup completes, the normal user path is to keep working through the host agent itself.

Ask the host agent naturally for ExperienceEngine state or feedback actions, for example:

- "What did ExperienceEngine just inject?"
- "Show the last ExperienceEngine intervention."
- "Mark the last ExperienceEngine intervention as helpful."

Use the `ee` CLI only when you need explicit operator validation or troubleshooting:

```bash
ee init
ee doctor <openclaw|claude-code|codex>
ee status
ee maintenance embedding-smoke
```

`ee init` is shared-product initialization, not host-specific setup.

- Run it once after your first host installation to configure:
  - distillation provider/model/auth
  - embedding mode/provider
  - any shared provider secrets
- Later host installations reuse the same ExperienceEngine home, settings, and shared secrets.

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

- `Codex` uses the shared ExperienceEngine MCP server, and `ee install codex` is the preferred first-time onboarding path
- `Claude Code` uses Claude-native plugin assets and marketplace distribution
- `OpenClaw` uses plugin/runtime integration

Once installation is complete, the host agent remains the primary interaction surface.

`ee` is the operational surface for:

- shared provider/model initialization
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

The user guide covers installation, host-specific notes, first-run validation, troubleshooting, and maintenance operations.

## License

This project is licensed under the MIT License.
See [LICENSE](./LICENSE).
