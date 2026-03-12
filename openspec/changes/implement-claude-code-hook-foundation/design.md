# Design: Claude Code Hook Foundation

## Installer Model

Claude Code officially supports project-local hook registration via `.claude/settings.local.json`. ExperienceEngine will use that file for the first foundation step because it is local to the current repo and does not require mutating the user's global Claude configuration.

The installer will:

- resolve ExperienceEngine shared paths under `~/.experienceengine/adapters/claude-code`
- merge ExperienceEngine-owned hook commands into `.claude/settings.local.json`
- preserve unrelated Claude settings and hooks
- write install-state metadata so later `doctor` and adapter work can inspect the installation

## Hook Coverage

The foundation will register these hook events:

- `UserPromptSubmit`
- `PreToolUse` with matcher `*`
- `PostToolUse` with matcher `*`
- `SessionEnd`

This covers prompt submission, tool lifecycle, and session completion, which is enough to start collecting real Claude Code payloads.

## Runtime Entry

Hooks will call `node <packageRoot>/dist/cli/index.js claude-hook`. The hook command reads JSON from stdin and persists raw captures under the ExperienceEngine Claude adapter capture directory. It intentionally produces no control output in this foundation step.
