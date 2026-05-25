# ExperienceEngine

English | [简体中文](./README.zh-CN.md)

ExperienceEngine is a governance layer for coding agents that reuses real execution experience without turning memory into noise. It injects short task-specific guidance only when relevant, then tracks whether that intervention helped or harmed.

**Memory does addition. ExperienceEngine does governance.**

Supported hosts today: `OpenClaw`, `Claude Code`, `Codex`, and validated Google Antigravity Agent Desktop support

## 10-Second Example

Without ExperienceEngine:
- the agent repeats the same SQLite migration mistake in a similar repo
- it opens the DB before running the migration, then wastes turns retrying the wrong path

With ExperienceEngine:
- at task start, it injects one short constraint like: `Run the migration before opening the DB connection`
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

If you plan to use `ee init`, `ee install ...`, or other operator commands, install the CLI first:

```bash
npm install -g @alan512/experienceengine
```

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
- `Google Antigravity`
  - `ee install antigravity`
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
| `Codex` | `ee install codex`, with native MCP fallback | hooks + MCP | supported |
| Google Antigravity Agent Desktop + `agy` CLI + IDE | `ee install antigravity`, `ee agy exec -C <project>` for CLI runs | MCP + validated native hooks | supported through user-level Antigravity plugin wiring, `ee agy exec`, and observed IDE global hooks |

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
- delivery decisions are persisted even when no hint is shipped, so skipped turns can still be explained later
- high-match same-repo experience can move out of conservative delivery after successful reuse, while cross-repo reuse stays cautious unless there is stronger evidence
- calculated cross-repo portability scorecards and SemVer penalties prevent unsafe sharing across different scopes
- post-task causal trajectory attributions ensure outcome feedback is only recorded when the agent actually adopted the injected guidance
- quarantine leases and shadow probes provide a safe, monitored recovery path to conservative delivery without erasing historical lessons
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
- let autonomous hygiene governance use the configured LLM to cluster conflicts, merge duplicates, retire stale shadow-only guidance, downgrade risky delivery, and apply guarded high-impact experience-node changes automatically
- override the last intervention as helpful or harmful when the automatic judgment needs correction
- inspect active, cooling, quarantined, retired, and trace capsule execution experience
- run across `OpenClaw`, `Claude Code`, and `Codex`
- capture and project host execution trace capsules for rich causal attribution and learning eligibility checks

### Under The Hood

- MCP-native interaction surfaces plus CLI/operator fallback
- semantic retrieval with API and local fallback (including `strict-offline` profiles, manifest health checks, and vector migration)
- deterministic match scorecards with portability bands (`validated_portable`, `cautiously_portable`, `incompatible`) and SemVer mismatch penalties
- post-task causal trajectory attributions (`adoption_detected`, `non_adoption_detected`, `unverifiable`)
- quarantine shadow-probe lease cycles with no-harm counters and conservative restoration
- host-agent driven inspection and feedback, with CLI fallback commands such as `ee inspect --last`, `ee inspect --trace <capsule-id>`, `ee helped`, and `ee harmed`

### Interaction Surface Tiers

- Routine: host-first review, `ee status`, `ee doctor <host>`, `ee inspect --last`, `ee inspect --trace <capsule-id>`, `ee helped`, and `ee harmed`
- Operator: install, upgrade, repair, operator review, governance approvals, hygiene review, export drafts, and managed backup/export/import/rollback
- Advanced / experimental: maintenance commands, raw evaluations, broker internals, and developer diagnostics

Tier and risk are separate. For example, `ee inspect review` is an operator workflow but read-only, while install/upgrade/rollback are operator workflows with high-impact safeguards.

### Autonomous Hygiene Governance

ExperienceEngine now treats hygiene governance as a host-attached background capability, not a routine command users have to remember. Host startup, prompt lookup, posttask finalization, and stop paths perform cheap due checks against a persisted per-scope schedule. Frequent host open/close cycles only create cheap checks; the SQLite schedule, lease, backoff, finding hash, and action budget decide when governance actually runs.

Validated experience-store actions are applied automatically. Low-risk actions can merge exact duplicates, retire stale shadow-only guidance, downgrade delivery, or quarantine harmed live guidance. High-impact experience-node actions use guarded execution: semantic/conflicted merges preserve evidence and cannot leave the canonical node directly eligible for live injection, promotion lands at conservative delivery, and deletion is a soft-retire with rollback snapshots. Broad rewrites, export writing, repo policy changes, and restore actions are rejected by automatic experience governance.

Hygiene and operator review remain read-only inspection surfaces. Use `ee inspect review`, `experienceengine://review`, or `experienceengine://governance` to inspect status. `experienceengine://governance/approvals` remains available for legacy approval records. `ee maintenance governance drain` exists as an operator fallback for explicit troubleshooting, not as the normal way users keep EE healthy. An optional keeper can wake the same drain path for stricter wall-clock schedules; it does not bypass leases, budgets, validators, guarded execution rules, or rollback snapshots.

For a more detailed explanation of what ExperienceEngine records and how an experience node is structured, see:

- [Experience Model Overview](./docs/development/experience-model.md)

## Current Status

- Stable: core experience lifecycle, inspect/helped/harmed loop, host integrations, CLI/operator fallback
- Recommended first path: use the host you already work in; `OpenClaw` currently has the deepest host-native integration
- Evolving: retrieval tuning, provider strategy, advanced host UX
- If you are starting from scratch and do not already have a preferred host, `OpenClaw` is the most complete native-plugin path.

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
- ExperienceEngine resolves the real project root from OpenClaw hook payloads or nearby repo markers; if OpenClaw only reports its global workspace, ExperienceEngine isolates that session instead of reusing unrelated global-workspace experience
- OpenClaw uses the shared background learning loop by default
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
  - after either path, start a new Codex session in the repo so project hooks, MCP wiring, and the `AGENTS.md` instruction block are picked up
  - on first use after managed setup, open `/hooks` in Codex and approve the ExperienceEngine hooks: `UserPromptSubmit`, `PostToolUse`, and `Stop`
  - in mixed Windows Codex App + WSL Codex CLI setups, the project `.codex/hooks.json` can be shared by both runtimes, while MCP registration remains runtime/user-level in each Codex home
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
ee doctor <openclaw|claude-code|codex|antigravity>
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
For Codex, `ee status` and `ee doctor codex` also report whether the `ee` CLI fallback is available on `PATH`. Codex MCP wiring can still work when the CLI fallback is missing, but commands such as `ee inspect --last` need either a PATH-visible `ee` binary or an explicit package invocation.
For mixed Windows Codex App + WSL Codex CLI use, treat `.codex/hooks.json` as repo-owned hook wiring and `~/.codex/config.toml` as per-runtime MCP wiring. `ee repair codex` refreshes the project hook launcher and removes stale project-scoped ExperienceEngine MCP config so Windows App and WSL CLI do not fight over one config file.

## Advanced Per-Host Commands (Operator / Development Only)

Most users can ignore this section and use the host-specific setup flow above.

If you need explicit per-host control as an operator or while developing the product, these commands still exist:

```bash
ee install openclaw
ee install claude-code
ee install codex
ee install antigravity
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
- `Codex` installs Codex-native hooks plus the shared ExperienceEngine MCP server. `ee codex exec` remains the deterministic non-interactive fallback.
- Codex `UserPromptSubmit` stays synchronous because it owns prompt-time experience injection. `PostToolUse` and `Stop` are queued for background processing by default. `PreToolUse` is not registered by default; set `EXPERIENCE_ENGINE_CODEX_PRETOOL_HOOK_ENABLED=1` only for synchronous gating experiments.
- Codex App and Codex CLI both load repo-level project hooks when they open the same repo. If Codex says hooks need review, open `/hooks` and approve ExperienceEngine's `UserPromptSubmit`, `PostToolUse`, and `Stop` hooks. If `EXPERIENCE_ENGINE_CODEX_PRETOOL_HOOK_ENABLED=1` was used, approve `PreToolUse` too.
- `Google Antigravity` currently means Antigravity Agent Desktop, the standalone `agy` CLI, and Antigravity IDE for validated lifecycle automation. The IDE shell is tracked independently because it stores MCP tool cache under `~/.gemini/antigravity-ide`, but real-host validation showed it loads the shared global plugin hooks from `~/.gemini/config/plugins/experienceengine/hooks.json`. `ee doctor antigravity` reports whether the IDE command exists, whether IDE MCP tool cache files are observed, and whether IDE hooks are observed through the global plugin surface. EE data remains user-level under the configured ExperienceEngine home and project experience remains scope-isolated. `ee install antigravity` records user-level adapter capability and installs Antigravity user-level plugin/MCP wiring for Agent Desktop and `agy` CLI. `ee antigravity activate-project -C <project>` remains a project-local fallback. For CLI runs, prefer `ee agy exec -C <project> "<prompt>"`; it invokes `agy --add-dir <project> --print ...` because direct `agy` project auto-discovery can fail on Windows if symlink creation is not permitted. Antigravity supports both routine stdio MCP calls and an advanced artifact-assisted analyzer that automatically parses planning/verification markdown files (`task.md`, `walkthrough.md`, `implementation_plan.md`) for task outcomes, and reconciles them with runtime finalization telemetry.
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
- optional local embedding model cache under `~/.experienceengine/models/embeddings`
- managed backups and exports

## Embedding Defaults

Current default behavior:

- `embeddingProvider = "api"`
- provider priority: OpenAI -> Gemini -> Jina
- if no API provider is available, ExperienceEngine falls back to legacy hash-based retrieval
- local semantic embeddings are an optional enhancement and are not installed by default

Useful environment variables:

- `EXPERIENCE_ENGINE_EMBEDDING_PROVIDER=local`
  - force fully local embedding behavior after installing the optional local runtime:
    `npm install -g @huggingface/transformers`
- `EXPERIENCE_ENGINE_EMBEDDING_API_PROVIDER=openai|gemini|jina`
  - force a specific API embedding provider

## User Guide

See the full user guide here:

- [ExperienceEngine User Guide](./docs/user-guide.md)

The user guide covers installation, host-specific notes, first-run validation, troubleshooting, and maintenance operations.

## License

This project is licensed under the MIT License.
See [LICENSE](./LICENSE).
