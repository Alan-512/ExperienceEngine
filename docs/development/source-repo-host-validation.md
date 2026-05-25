# Source Repo Host Validation

This document records source-repo validation snapshots for ExperienceEngine host integrations.

This is local source validation only. It does not prove published npm, Claude marketplace, or ClawHub distribution behavior.

## Shared Validation State

- Windows repository: `D:\project\ExperienceEngine`
- WSL repository: `/mnt/d/project/ExperienceEngine`
- shared ExperienceEngine home: `D:\ExperienceEngineData\.experienceengine`
- WSL shared home link: `/home/seed/.experienceengine`
- project scope: `scope_21d15aea1db0`

## Latest Trace Boundary Snapshot

Date: May 25, 2026

Scope:

- local source-repo validation for host trace capture after separating runtime trace use from full trace persistence
- real-host validation for `Codex`, `Claude Code`, and `OpenClaw` in WSL
- earlier real-host validation for Windows `Antigravity` through the managed `ee agy exec` path
- source-repo host validation was followed by `v0.4.2` npm, GitHub release, and ClawHub publication checks

Validated:

| Host | Runtime | Command or evidence | Result |
| --- | --- | --- | --- |
| Codex | WSL, `codex-cli 0.130.0` | `EXPERIENCE_ENGINE_TRACE_CAPTURE_ENABLED=true EXPERIENCE_ENGINE_TRACE_CAPTURE_HOSTS=codex EXPERIENCE_ENGINE_TRACE_PERSIST_DIAGNOSTIC_SNAPSHOTS=false node dist/cli/index.js codex exec -C /mnt/d/project/ExperienceEngine -s read-only "<prompt>"` | passed; `ee inspect --last --verbose` reported `Trace summary: retained`, `Trace completeness: 1`, host `codex`, and `Full trace snapshot: not retained in normal mode` |
| Claude Code | WSL, `claude 2.1.92` | `claude -p --permission-mode bypassPermissions "<prompt>"` after setting the Claude default model to `nvidia/nemotron-3-super-120b-a12b:free` | passed for EE trace boundary; stdout may be empty, but SQLite recorded host `claude-code`, final status `success`, `trace_provenance_json`, `trace_completeness = 0.5`, and no `trace_capsule_id` |
| OpenClaw | WSL, `OpenClaw 2026.3.8` | `EXPERIENCE_ENGINE_TRACE_CAPTURE_ENABLED=true EXPERIENCE_ENGINE_TRACE_CAPTURE_HOSTS=openclaw EXPERIENCE_ENGINE_TRACE_PERSIST_DIAGNOSTIC_SNAPSHOTS=false openclaw agent --local --session-id ee-wsl-openclaw-trace-fixed-1 --message "<prompt>" --timeout 180 --json` | passed after repairing the copied extension bundle; `ee inspect --last --verbose` reported `Trace summary: retained`, `Trace completeness: 0.75`, host `openclaw`, and `Full trace snapshot: not retained in normal mode` |
| OpenClaw diagnostic snapshot | WSL, `OpenClaw 2026.3.8` | `EXPERIENCE_ENGINE_TRACE_CAPTURE_ENABLED=true EXPERIENCE_ENGINE_TRACE_CAPTURE_HOSTS=openclaw EXPERIENCE_ENGINE_TRACE_PERSIST_DIAGNOSTIC_SNAPSHOTS=true EXPERIENCE_ENGINE_TRACE_DIAGNOSTIC_SNAPSHOT_HOSTS=openclaw openclaw agent --local --session-id ee-wsl-openclaw-trace-diagnostic-1 --message "<prompt>" --timeout 180 --json` | passed; diagnostic allowlist wrote `trace_cap_trace_3aa029d1-83a5-4314-9110-2d5505737aac`, `trace_capsules = 1`, and `trace_events = 2` |
| Antigravity | Windows `ee agy exec` managed path | source-repo validation with normal and diagnostic trace checks | passed earlier in this validation sequence; normal mode retained trace provenance without full snapshot persistence, and diagnostic mode was validated through the managed Antigravity wrapper |

Published distribution checks after this source validation:

| Channel | Evidence | Result |
| --- | --- | --- |
| npm | `npm view @alan512/experienceengine versions --json` and `dist-tags` | `0.4.2` is published and `latest=0.4.2` |
| npm artifact | temporary install of `@alan512/experienceengine@0.4.2` and `./node_modules/.bin/ee --version` | `ee` CLI starts from the published artifact |
| GitHub | GitHub release `v0.4.2` | release is public, not draft, not prerelease |
| ClawHub | `clawhub package inspect @alan512/experienceengine` | `Latest: 0.4.2`, source ref `v0.4.2`, source commit `0a3a35fea8328fe0ad65552a9c762e5eea9c6910`; scan may remain `pending` while ClawHub background scanning completes |

Boundary checks:

- normal mode writes compact `trace_provenance_json` on task records and does not create new `trace_capsules` or `trace_events` rows
- diagnostic snapshot persistence is opt-in and requires `EXPERIENCE_ENGINE_TRACE_PERSIST_DIAGNOSTIC_SNAPSHOTS=true` plus a host or scope allowlist match
- after the OpenClaw diagnostic run, SQLite showed one diagnostic capsule and two events; before the diagnostic run, normal-mode `Codex`, `Claude Code`, and `OpenClaw` validation left `trace_capsules = 0` and `trace_events = 0`
- `ee inspect --last --verbose` distinguishes normal retained summaries from diagnostic full snapshots

OpenClaw repair note:

- WSL `ee doctor openclaw` initially showed the copied extension bundle was current by version but failed at runtime because the packaged runtime closure omitted static hybrid imports needed by `interaction/service.js`
- the fix was to include `hybrid/capsule-builder.js`, `hybrid/worker-client.js`, and `hybrid/postmortem-provider-client.js` in the OpenClaw packaged runtime closure
- post-repair `ee doctor openclaw` reported installed/current `0.4.1`, `host_status = loaded`, `config_matches = true`, `restart_recommended = false`, and `install_drift = false`
- the remaining duplicate `feishu` plugin warning is external OpenClaw host configuration noise, not ExperienceEngine install drift

Repository verification:

| Check | Result |
| --- | --- |
| `pnpm typecheck` | passed |
| `pnpm test` | passed, `163` files and `1090` tests |
| `pnpm build` | passed before WSL host repair |

## Latest Maintenance Snapshot

Date: May 14, 2026

Scope:

- local source-repo validation for OpenClaw upgrade/repair behavior
- package metadata validation for the prepared `0.3.3` npm package
- no published-package validation, because the npm token available in this run could not authenticate for `@alan512/experienceengine`

Validated:

| Area | Command or evidence | Result |
| --- | --- | --- |
| OpenClaw repair regression | `pnpm exec vitest run tests/unit/openclaw-installer.test.ts tests/unit/openclaw-repair.test.ts tests/unit/upgrade-command.test.ts` | passed |
| OpenSpec consistency | `pnpm exec openspec validate --all --strict` | passed |
| TypeScript source consistency | `pnpm exec tsc -p tsconfig.json --noEmit` | passed |
| npm package metadata | `npm publish --access public` prepack output for `@alan512/experienceengine@0.3.3` | package builds as `0.3.3`; publish blocked by npm auth |

Release blocker:

- The npm publish attempt failed with `E401` on `npm whoami` and `E404` on package publish. Treat this as an npm token/account permission blocker, not a package build failure.

## Host Matrix

| Host | Runtime | Validation path | Expected result |
| --- | --- | --- | --- |
| Codex App | Windows app session | current app task with Codex hooks enabled | project hooks run through `.codex/hooks.json`; `UserPromptSubmit`, `PostToolUse`, and `Stop` are the default events |
| Codex CLI | WSL, `codex-cli 0.128.0` | Linux binary `/home/seed/.nvm/versions/node/v24.13.0/bin/codex`; `codex exec pwd` from `/mnt/d/project/ExperienceEngine` | writes Codex task evidence into `scope_21d15aea1db0` |
| Claude Code | Windows host | `claude --print --model tencent/hy3-preview:free "EE host regression ping. Reply with OK only."` | writes `claude-code` task evidence into `scope_21d15aea1db0`; stdout may be empty |
| OpenClaw | WSL repo workspace | `agents.defaults.workspace=/mnt/d/project/ExperienceEngine`; session `ee-openclaw-repo-scope-regression-002` | writes OpenClaw task evidence into `scope_21d15aea1db0` |
| OpenClaw | WSL global workspace fallback | `agents.defaults.workspace=/home/seed/.openclaw/workspace`; session `ee-openclaw-global-isolation-regression-002` | writes into a session-isolated scope rooted under `.experienceengine-unscoped/<session>` |
| Antigravity Agent Desktop | Windows desktop app | project-local validation with `ee antigravity activate-project -C <temp-project>` and real Agent Desktop task execution from `C:\Users\123\Desktop\Antigravity.lnk`; user-level plugin wiring added after official global surface review | project-local validation reports `host_native_hooks_validated`, `mcp_registered=true`, `hooks_registered=true`; direct stdio smoke lists ExperienceEngine MCP tools; Agent Desktop called `experienceengine_get_capabilities`; real hooks fired `PreInvocation`, `PreToolUse`, `PostToolUse`, and `Stop`; `PreToolUse` accepted `{ "decision": "allow" }`; user-level plugin wiring was later validated through the shared global plugin surface |
| Antigravity CLI (`agy`) | Windows CLI | `agy --add-dir <temp-project> --print --dangerously-skip-permissions --print-timeout 5m "<prompt>"`; user-level CLI plugin wiring added after official plugin surface review | CLI loaded hooks and wrote task runs for session `c379ba97-c907-449a-a4d1-fee58dad0db7`; direct project auto-discovery without `--add-dir` can fail on Windows, so `ee agy exec -C <project>` remains the recommended wrapper |
| Antigravity IDE | Windows IDE shell | real IDE Agent task execution from `D:\Antigravity\Antigravity IDE.exe` after user-level plugin wiring | IDE loaded `C:\Users\123\.gemini\config\plugins\experienceengine\hooks.json`, fired `PreInvocation`, `PreToolUse`, `PostToolUse`, and `Stop`, wrote task runs to the shared project scope, and stores EE MCP tool cache under `C:\Users\123\.gemini\antigravity-ide\mcp\experienceengine` |

## Host Notes

- Codex project hooks are shared through the repository `.codex/hooks.json`; each runtime still owns its own Codex MCP home.
- Codex `PreToolUse` is disabled by default. The expected default hook events are `UserPromptSubmit`, `PostToolUse`, and `Stop`.
- Codex WSL validation must resolve `codex` to the Linux CLI. If PATH resolves to a WindowsApps shim, `ee doctor codex` reports a PATH warning.
- OpenClaw external config warnings, such as duplicate `feishu` plugins or stale `qwen-portal-auth` entries, are host configuration noise. They should not be treated as ExperienceEngine install drift.
- OpenClaw without a project workspace is intentionally session-isolated to prevent cross-project experience injection.
- Antigravity has distinct Agent Desktop, IDE, and CLI entries. Agent Desktop and IDE use the shared global plugin hooks under `~/.gemini/config/plugins/experienceengine`; the standalone `agy` CLI is driven through `ee agy exec -C <project>`, which supplies `--add-dir <project>` for reliable Windows workspace discovery.
- Antigravity source-repo validation on May 22, 2026 used `C:\Users\123\Desktop\Antigravity.lnk` to identify Agent Desktop as `C:\Users\123\AppData\Local\Programs\antigravity\Antigravity.exe` (`FileDescription: Antigravity - Agentic Desktop Application`, version `2.0.1.0`). The PATH-visible `antigravity` command points to the separate `D:\Antigravity` IDE install and must not be treated as the Agent Desktop validation target.
- Agent Desktop validation on May 22, 2026 confirmed `experienceengine_get_capabilities` can be called from an Agent Desktop session by launching the EE MCP server through `StdioClientTransport`. Follow-up validation on May 23, 2026 confirmed real Agent Desktop hooks execute from project `.agents/hooks.json`, including `PreInvocation`, `PreToolUse`, `PostToolUse`, and `Stop`, with successful task-run persistence.
- Agent Desktop project activation validation on May 23, 2026 used `ee antigravity activate-project -C <temp-project>` against `C:\Users\123\AppData\Local\Temp\ee-agent-desktop-activate-validation-f0892be4fd984d748a39b3c14c748ade\workspace`. Doctor reported `install_scope=user`, `current_project_mcp_registered=true`, `current_project_hooks_registered=true`, and `lifecycle_mode=host_native_hooks_validated`; `ee inspect --last` showed session `ac2d1898-9fd2-4056-a4ac-ac8e3cd4fe7e` persisted to the temp user-level EE home.
- Antigravity CLI validation on May 23, 2026 resolved `agy` to `C:\Users\123\AppData\Local\agy\bin\agy.exe` version `1.0.1`. A direct `agy --print` run did not load project config because Windows symlink creation failed during project discovery, leaving `workspaceDirs=[]`. Adding `--add-dir <project>` loaded `.mcp.json` and `.agents/hooks.json` and produced persisted EE task runs.
- Global Antigravity plugin surfaces are documented: Agent Desktop plugins live under `~/.gemini/config/plugins/<plugin>`, CLI plugins under `~/.gemini/antigravity-cli/plugins/<plugin>`, and Agent Desktop MCP config under `~/.gemini/antigravity/mcp_config.json`. `ee install antigravity` now writes these user-level surfaces. Real-host validation confirmed Agent Desktop, IDE, and `agy` load lifecycle hooks and persist EE task runs through this wiring.

## Release Validation Matrix

| Channel | Required check | Pass condition |
| --- | --- | --- |
| npm | `npm view @alan512/experienceengine version` after publish | passed for `0.4.2` |
| npm | install the published package in a temp project and run `ee --version` | passed; CLI starts from the published artifact |
| GitHub | release `v0.4.2` exists and is public | passed |
| ClawHub | `clawhub package inspect @alan512/experienceengine` | passed for latest/source metadata; background scan may remain pending |
| OpenClaw host-native | install or update through the host-native plugin path | still recommended for a full post-release host-native install audit |
| Claude Code | install or update through the supported marketplace/plugin path | still recommended for a full post-release marketplace/plugin audit |
| Codex | install or repair from the published package | still recommended for a full post-release install/repair audit |
