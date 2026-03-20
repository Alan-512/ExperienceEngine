# Claude Runtime Validation

This workflow validates the Claude Code adapter against a real local Claude CLI run without requiring Claude to run during automated tests.

## Preconditions

- Claude Code CLI is installed and authenticated locally.
- The repository has been built so `dist/cli/index.js` exists.

## Local Validation Flow

1. Create a temporary project directory.
2. Set `EXPERIENCE_ENGINE_HOME` to a writable validation directory.
3. Run `node dist/cli/index.js install claude-code` inside the temp project.
4. Run a real Claude CLI command from that temp project.
5. Inspect:
   - `.claude/settings.local.json`
   - `$EXPERIENCE_ENGINE_HOME/adapters/claude-code/captures`
   - `$EXPERIENCE_ENGINE_HOME/adapters/claude-code/events.jsonl`
   - `$EXPERIENCE_ENGINE_HOME/adapters/claude-code/sessions`
   - `$EXPERIENCE_ENGINE_HOME/sqlite/experienceengine.db`

For non-interactive `claude -p` validation that is expected to touch MCP tools:

- include `--permission-mode bypassPermissions`
- otherwise Claude may stop on its own tool-permission prompt flow and look like an EE/MCP timeout even when the server is healthy

## Suggested Validation Command

```bash
EXPERIENCE_ENGINE_HOME=/tmp/experienceengine-claude-runtime \
claude -p "Use Bash to print the current working directory, then summarize it." \
  --add-dir "$PWD" \
  --allowedTools Bash \
  --permission-mode bypassPermissions \
  --setting-sources project,local
```

## Promotion Workflow

After a successful live run:

1. Copy the raw captured payloads from the Claude adapter capture directory.
2. Sanitize session ids, paths, and prompt text if needed.
3. Save the curated sequence under `tests/fixtures/claude-code/`.
4. Replay it with the repository script:

```bash
pnpm tsx scripts/claude-code/replay-hook-sequence.ts tests/fixtures/claude-code/<fixture>.json
```

5. Add or update test assertions that match the replayed runtime outcome.

## Notes

- Claude hooks run in separate processes, so ExperienceEngine persists intermediate session state on disk and replays it on `SessionEnd`.
- This workflow is developer-only and intentionally separate from CI.
