# Source Repo Host Validation

This document records the May 7, 2026 source-repo validation snapshot for ExperienceEngine host integrations.

This is local source validation only. It does not prove published npm, Claude marketplace, or ClawHub distribution behavior.

## Shared Validation State

- Windows repository: `D:\project\ExperienceEngine`
- WSL repository: `/mnt/d/project/ExperienceEngine`
- shared ExperienceEngine home: `D:\ExperienceEngineData\.experienceengine`
- WSL shared home link: `/home/seed/.experienceengine`
- project scope: `scope_21d15aea1db0`

## Host Matrix

| Host | Runtime | Validation path | Expected result |
| --- | --- | --- | --- |
| Codex App | Windows app session | current app task with Codex hooks enabled | project hooks run through `.codex/hooks.json`; `UserPromptSubmit`, `PostToolUse`, and `Stop` are the default events |
| Codex CLI | WSL, `codex-cli 0.128.0` | Linux binary `/home/seed/.nvm/versions/node/v24.13.0/bin/codex`; `codex exec pwd` from `/mnt/d/project/ExperienceEngine` | writes Codex task evidence into `scope_21d15aea1db0` |
| Claude Code | Windows host | `claude --print --model tencent/hy3-preview:free "EE host regression ping. Reply with OK only."` | writes `claude-code` task evidence into `scope_21d15aea1db0`; stdout may be empty |
| OpenClaw | WSL repo workspace | `agents.defaults.workspace=/mnt/d/project/ExperienceEngine`; session `ee-openclaw-repo-scope-regression-002` | writes OpenClaw task evidence into `scope_21d15aea1db0` |
| OpenClaw | WSL global workspace fallback | `agents.defaults.workspace=/home/seed/.openclaw/workspace`; session `ee-openclaw-global-isolation-regression-002` | writes into a session-isolated scope rooted under `.experienceengine-unscoped/<session>` |

## Host Notes

- Codex project hooks are shared through the repository `.codex/hooks.json`; each runtime still owns its own Codex MCP home.
- Codex `PreToolUse` is disabled by default. The expected default hook events are `UserPromptSubmit`, `PostToolUse`, and `Stop`.
- Codex WSL validation must resolve `codex` to the Linux CLI. If PATH resolves to a WindowsApps shim, `ee doctor codex` reports a PATH warning.
- OpenClaw external config warnings, such as duplicate `feishu` plugins or stale `qwen-portal-auth` entries, are host configuration noise. They should not be treated as ExperienceEngine install drift.
- OpenClaw without a project workspace is intentionally session-isolated to prevent cross-project experience injection.

## Release Validation Still Needed

Before claiming distribution readiness, run separate validation for:

- published npm package install and upgrade
- ClawHub or host-native OpenClaw install
- Claude marketplace or plugin install flow
- Codex install and repair from the published package
