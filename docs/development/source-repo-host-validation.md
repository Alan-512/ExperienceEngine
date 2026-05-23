# Source Repo Host Validation

This document records source-repo validation snapshots for ExperienceEngine host integrations.

This is local source validation only. It does not prove published npm, Claude marketplace, or ClawHub distribution behavior.

## Shared Validation State

- Windows repository: `D:\project\ExperienceEngine`
- WSL repository: `/mnt/d/project/ExperienceEngine`
- shared ExperienceEngine home: `D:\ExperienceEngineData\.experienceengine`
- WSL shared home link: `/home/seed/.experienceengine`
- project scope: `scope_21d15aea1db0`

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
| Antigravity Agent Desktop | Windows desktop app | project-local validation with `ee antigravity activate-project -C <temp-project>` and real Agent Desktop task execution from `C:\Users\123\Desktop\Antigravity.lnk`; user-level plugin wiring added after official global surface review | project-local validation reports `host_native_hooks_validated`, `mcp_registered=true`, `hooks_registered=true`; direct stdio smoke lists ExperienceEngine MCP tools; Agent Desktop called `experienceengine_get_capabilities`; real hooks fired `PreInvocation`, `PreToolUse`, `PostToolUse`, and `Stop`; `PreToolUse` accepted `{ "decision": "allow" }`; user-level plugin wiring still needs final real-host validation |
| Antigravity CLI (`agy`) | Windows CLI | `agy --add-dir <temp-project> --print --dangerously-skip-permissions --print-timeout 5m "<prompt>"`; user-level CLI plugin wiring added after official plugin surface review | CLI loaded hooks and wrote task runs for session `c379ba97-c907-449a-a4d1-fee58dad0db7`; direct project auto-discovery without `--add-dir` can fail on Windows, so `ee agy exec -C <project>` remains the recommended wrapper |

## Host Notes

- Codex project hooks are shared through the repository `.codex/hooks.json`; each runtime still owns its own Codex MCP home.
- Codex `PreToolUse` is disabled by default. The expected default hook events are `UserPromptSubmit`, `PostToolUse`, and `Stop`.
- Codex WSL validation must resolve `codex` to the Linux CLI. If PATH resolves to a WindowsApps shim, `ee doctor codex` reports a PATH warning.
- OpenClaw external config warnings, such as duplicate `feishu` plugins or stale `qwen-portal-auth` entries, are host configuration noise. They should not be treated as ExperienceEngine install drift.
- OpenClaw without a project workspace is intentionally session-isolated to prevent cross-project experience injection.
- Antigravity has distinct Agent Desktop, IDE, and CLI entries. The current adapter targets Agent Desktop MCP/hook wiring and the standalone `agy` CLI when launched with `--add-dir <project>`. The separate IDE shell is out of scope.
- Antigravity source-repo validation on May 22, 2026 used `C:\Users\123\Desktop\Antigravity.lnk` to identify Agent Desktop as `C:\Users\123\AppData\Local\Programs\antigravity\Antigravity.exe` (`FileDescription: Antigravity - Agentic Desktop Application`, version `2.0.1.0`). The PATH-visible `antigravity` command points to the separate `D:\Antigravity` IDE install and must not be treated as the Agent Desktop validation target.
- Agent Desktop validation on May 22, 2026 confirmed `experienceengine_get_capabilities` can be called from an Agent Desktop session by launching the EE MCP server through `StdioClientTransport`. Follow-up validation on May 23, 2026 confirmed real Agent Desktop hooks execute from project `.agents/hooks.json`, including `PreInvocation`, `PreToolUse`, `PostToolUse`, and `Stop`, with successful task-run persistence.
- Agent Desktop project activation validation on May 23, 2026 used `ee antigravity activate-project -C <temp-project>` against `C:\Users\123\AppData\Local\Temp\ee-agent-desktop-activate-validation-f0892be4fd984d748a39b3c14c748ade\workspace`. Doctor reported `install_scope=user`, `current_project_mcp_registered=true`, `current_project_hooks_registered=true`, and `lifecycle_mode=host_native_hooks_validated`; `ee inspect --last` showed session `ac2d1898-9fd2-4056-a4ac-ac8e3cd4fe7e` persisted to the temp user-level EE home.
- Antigravity CLI validation on May 23, 2026 resolved `agy` to `C:\Users\123\AppData\Local\agy\bin\agy.exe` version `1.0.1`. A direct `agy --print` run did not load project config because Windows symlink creation failed during project discovery, leaving `workspaceDirs=[]`. Adding `--add-dir <project>` loaded `.mcp.json` and `.agents/hooks.json` and produced persisted EE task runs.
- Global Antigravity plugin surfaces are documented: Agent Desktop plugins live under `~/.gemini/config/plugins/<plugin>`, CLI plugins under `~/.gemini/antigravity-cli/plugins/<plugin>`, and Agent Desktop MCP config under `~/.gemini/antigravity/mcp_config.json`. `ee install antigravity` now writes these user-level surfaces. Final real-host validation must confirm that Agent Desktop and `agy` load the generated global plugin hooks before distribution claims are made.

## Release Validation Still Needed

Before claiming distribution readiness, run separate validation for:

- published npm package install and upgrade
- ClawHub or host-native OpenClaw install
- Claude marketplace or plugin install flow
- Codex install and repair from the published package

Minimum release validation matrix:

| Channel | Required check | Pass condition |
| --- | --- | --- |
| npm | `npm view @alan512/experienceengine version` after publish | reports the intended release version |
| npm | install the published package in a temp project and run `ee --help` plus `ee doctor` | CLI starts from the published artifact |
| OpenClaw host-native | install or update through the host-native plugin path | `ee doctor openclaw` reports installed, enabled, and config-matched |
| Claude Code | install or update through the supported marketplace/plugin path | `ee doctor claude-code` reports hook and MCP wiring according to the chosen install mode |
| Codex | install or repair from the published package | `ee doctor codex` reports MCP wiring, project hooks, and runtime target without drift |
