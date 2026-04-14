# ExperienceEngine

English | [简体中文](./README.zh-CN.md)

ExperienceEngine is a governance layer for coding agents that reuses real execution experience without turning memory into noise. It injects short task-specific guidance only when relevant, then tracks whether that intervention helped or harmed.

**Memory does addition. ExperienceEngine does governance.**

Supported hosts today: `OpenClaw`, `Claude Code`, `Codex`

## 10-Second Example

Without ExperienceEngine:
- the agent repeats the same SQLite migration mistake in a similar repo
- it opens the DB before running the migration, then wastes turns retrying the wrong path

With ExperienceEngine:
- before tool use, it injects one short constraint like: `Run the migration before opening the DB connection`
- the host agent avoids the same failed path instead of rediscovering it from scratch
- after the task, ExperienceEngine usually updates that guidance automatically from the real outcome
- if the guidance later starts harming similar tasks, ExperienceEngine can cool, quarantine, or retire it

Task flow: `task signals -> distilled experience -> retrieval -> short intervention -> feedback -> governance`

<details>
<summary>Example host transcript</summary>

User: Fix the SQLite startup failure in this repo.

Host agent: ExperienceEngine found a prior successful fix pattern in this repo: `Run the migration before opening the DB connection.` I’ll apply the migration first, then retry startup.

User: Why did that ExperienceEngine hint match?

Host agent: It matched a prior task in this repo with the same SQLite startup pattern and a successful migration-first fix.

User: So ExperienceEngine is trying to keep me off the same bad path?

Host agent: Yes. It reused a repo-local success pattern before the next tool call, and it will usually score the outcome automatically after this run.

</details>

![Example `ee inspect --last --verbose` output](./docs/assets/readme/inspect-last-example.svg)

## Quick Start

Fastest host-specific install paths:

- `OpenClaw`
  - `openclaw plugins install @alan512/experienceengine`
  - `openclaw gateway restart`
  - `ee init`
- `Codex`
  - `ee install codex`
  - `ee init`
- `Claude Code`
  - `/plugin marketplace add https://github.com/Alan-512/ExperienceEngine.git`
  - `/plugin install experienceengine@experienceengine`
  - `ee init`

`ee init` initializes shared ExperienceEngine state after the host-specific installation step.

Need detailed per-host setup instructions, fallback paths, readiness states, or operator workflows? Jump to [Full Setup and Operator Details](#full-setup-and-operator-details).

## Who It's For

Use ExperienceEngine if:
- you use coding agents repeatedly in similar repos or workflows
- you want **small, intervention-focused guidance**, not general memory recall
- you want to know whether reused experience actually **helped or harmed**
- you want stale guidance to cool down or retire instead of accumulating forever

Do not use ExperienceEngine if:
- you only want a personal note-taking memory
- you want generic document RAG
- you rarely repeat workflows
- you want the system to remember everything by default

## Host Support Matrix

| Host | Install path | Routine interaction | Maturity |
|---|---|---|---|
| `OpenClaw` | native plugin install | host-native | most complete today |
| `Claude Code` | marketplace plugin, with `ee install claude-code` fallback | MCP + plugin hooks | supported |
| `Codex` | `ee install codex`, with native MCP fallback | MCP-native | supported |

## Why It Exists

Coding agents often repeat the same mistakes because prior execution experience is not reused in a governed way.

ExperienceEngine is designed for intervention governance, not general memory accumulation.

## Why Not Memory / RAG

| Question | Memory Systems | ExperienceEngine |
|---|---|---|
| Persist facts and preferences across sessions | Yes | Not the primary job |
| Capture repeated failure → fix → success paths | Partial, usually manual | Yes, from real task signals |
| Track whether a recalled item helped or harmed | Usually no | Yes, per intervention |
| Retire stale or harmful guidance automatically | Usually no | Yes, cooling and retirement are built in |
| Keep context small and intervention-focused | Not the main goal | Yes, it injects short task-specific guidance |
| Generic document lookup | Common fit | Not the primary job |

## Why It Is Not Just Another Memory Layer

ExperienceEngine is not trying to remember more things than the host. Its core job is to govern whether learned guidance should keep affecting future tasks.

- most learning work happens after the task, so the current task does not need to wait for the full experience pipeline
- each learned node moves through a lifecycle such as `candidate`, `active`, `cooling`, and `retired`
- delivery is governed separately from storage, so harmful guidance can be cooled, quarantined, or removed from normal live injection
- posttask review can revise whether a hint actually helped, harmed, or stayed uncertain
- the product goal is production-safe reuse, not maximum recall

## Where It Sits In The Agent Loop

At a high level, ExperienceEngine operates around the agent loop like this:

- `User task`
- `before_prompt_build`: retrieve and inject matching experience
- `agent reasoning + tools`: capture failures, retries, corrections, and outcomes
- `task finalization`: distill new candidates into reusable experience
- `helped / harmed feedback`: promote, cool, or retire nodes

ExperienceEngine works at the context layer. It does not modify the host model's weights.

## Experience Lifecycle

`task signals -> candidate -> active -> cooling -> retired`

Each node moves through that lifecycle using real task outcomes, not just time-based cleanup. Helpful experience gets reinforced; harmful experience gets cooled or retired.

## What You Can Do Today

- reuse short guidance from similar coding work
- review why a hint matched or why nothing injected
- let ExperienceEngine automatically reinforce, cool, quarantine, or retire guidance from real task outcomes
- override the last intervention as helpful or harmful when the automatic judgment needs correction
- inspect active, cooling, quarantined, and retired experience
- run across `OpenClaw`, `Claude Code`, and `Codex`

### Under The Hood

- MCP-native interaction surfaces plus CLI/operator fallback
- semantic retrieval with API and local fallback
- host-agent driven inspection and feedback, with CLI fallback commands such as `ee inspect --last`, `ee helped`, and `ee harmed`

For a more detailed explanation of what ExperienceEngine records and how an experience node is structured, see:

- [Experience Model Overview](./docs/development/experience-model.md)

## Current Status

- Stable: core experience lifecycle, inspect/helped/harmed loop, host integrations, CLI/operator fallback
- Good path today: `OpenClaw` native plugin install
- Evolving: retrieval tuning, provider strategy, advanced host UX
- If you want the smoothest first experience today, start with `OpenClaw`.

## What First Success Looks Like

After installation and initialization, the first visible signs of value are:

- a repeated task avoids a previously known bad path instead of rediscovering it
- ExperienceEngine injects only a short repo-relevant constraint instead of bloating the prompt
- the host can explain why that hint matched or why nothing was injected
- the task outcome usually updates future delivery automatically
- `ee inspect --last` shows the recent intervention and related node state

## Prerequisites

Before installing an adapter, make sure the host CLI already works on this machine:

- `openclaw` for the OpenClaw plugin/runtime integration
- `claude` for the Claude Code adapter
- `codex` for the Codex adapter

**ExperienceEngine does not install those host CLIs for you.** It wires itself into an already working host environment.

OpenClaw notes:
- requires a working OpenClaw installation with native plugin support
- the documented OpenClaw path assumes `openclaw plugins install` and `openclaw gateway restart` are available
- OpenClaw now uses the shared background learning loop by default
- OpenClaw still keeps async hybrid posttask review disabled by default; `ee status` and `ee doctor openclaw` show that explicitly

General package requirement:
- Node.js `>=20` is required for the published package

## Full Setup and Operator Details

### Full Setup by Host

ExperienceEngine no longer treats the `ee` CLI as the universal first-install entrypoint across all hosts.

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
    - see the advanced example below if you need direct MCP wiring
  - after either path, start a new Codex session in the repo so the MCP wiring and `AGENTS.md` instruction block are picked up
- `Claude Code`
  - host-native marketplace install:
    - add the bundled marketplace from GitHub:
    - `/plugin marketplace add https://github.com/Alan-512/ExperienceEngine.git`
  - install the bundled plugin:
    - `/plugin install experienceengine@experienceengine`
  - `ee install claude-code` remains the operator fallback when you need direct hooks + MCP wiring outside the marketplace flow
  - after installation, start a new Claude Code session so the plugin hooks and bundled MCP config are loaded

Across all three hosts, the intended flow is the same:

1. install ExperienceEngine through the host-specific setup path
2. initialize shared ExperienceEngine state with `ee init`
3. restart or open a fresh host session until the repo is `Ready`
4. keep routine inspection and feedback inside the host when supported
5. use `ee` as the operator fallback for validation, repair, and deeper inspection

### Shared Initialization

`ee init` is shared-product initialization, not host-specific setup.

- Run it once after your first host installation to configure:
  - distillation provider/model/auth
  - embedding mode/provider
  - any shared provider secrets
- Later host installations reuse the same ExperienceEngine home, settings, and shared secrets.

After installation, ExperienceEngine should orient the user toward the next setup step:

- if host wiring is in place, the product is at least `Installed`
- after shared state is configured with `ee init`, the product is `Initialized`
- once the host or repo has reloaded correctly for real work, the product is `Ready`

Minimal shared initialization example:

1. `ee init distillation --provider openai --model gpt-4.1-mini --auth-mode api_key`
2. `ee init secret OPENAI_API_KEY <your-api-key>`
3. `ee init embedding --mode api --api-provider openai --model text-embedding-3-small`
4. `ee init show`

If you prefer Gemini or Jina for embeddings, use the same `ee init embedding` flow with the matching provider and model.

### Routine Use vs Operator Use

For routine use, ask the host agent naturally for ExperienceEngine state first. Automatic outcome attribution is the default path; manual feedback is mainly there when you want to correct that judgment.

Examples:

- "What did ExperienceEngine just inject?"
- "Why did that ExperienceEngine hint match?"
- "Why didn't ExperienceEngine inject anything just now?"
- "Mark the last ExperienceEngine intervention as helpful or harmful."

In normal use, you should not need to manually score every intervention. ExperienceEngine is designed to learn from real task outcomes automatically, while still letting you override the result when the automatic judgment is wrong.

OpenClaw also supports these additional readiness and recent-silence questions in-session:

- "Is ExperienceEngine ready here?"
- "Is ExperienceEngine still warming up in this repo?"
- "Why didn't ExperienceEngine inject anything just now?"

For `OpenClaw`, `Codex`, and `Claude Code`, the common review-and-feedback follow-ups should stay in the host session first.
Use CLI fallback whenever the host-side path is unavailable or you need explicit operator control.

Use the `ee` CLI when you need explicit operator validation or troubleshooting:

```bash
ee init
ee doctor <openclaw|claude-code|codex>
ee status
ee maintenance embedding-smoke
```

### Readiness and Value States

ExperienceEngine treats onboarding and value as two separate layers:

- `Setup state`
  - `Installed`
  - `Initialized`
  - `Ready`
- `Value state`
  - `Warming up`
  - `First value reached`

These are not one linear ladder. A repo can already be `Ready` while still `Warming up`.

`First value reached` should only be claimed after visible output from a real task run. A generic warm-up message or static onboarding text does not count as first value.

## Installation Model

ExperienceEngine separates:
- host installation
- shared initialization
- operator workflows

The host remains the primary interaction surface.
`ee` remains the explicit operator surface for setup, validation, repair, status, and maintenance.

## Advanced Per-Host Commands (Operator / Development Only)

Most users can ignore this section and use the host-specific setup flow above.

If you need explicit per-host control as an operator or while developing the product, these commands still exist:

```bash
ee install openclaw
ee install claude-code
ee install codex
```

<details>
<summary>Native/manual Codex MCP fallback example</summary>

```bash
codex mcp add experienceengine --env EXPERIENCE_ENGINE_HOME=$HOME/.experienceengine -- npx -y @alan512/experienceengine codex-mcp-server
```

</details>

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
- provider priority: OpenAI -> Gemini -> Jina
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
