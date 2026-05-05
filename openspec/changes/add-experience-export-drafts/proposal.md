## Why

ExperienceEngine now exposes repo policy evidence and hygiene findings, but operators still lack a reviewable way to package high-quality learned guidance for reuse outside the local database. The next Phase 7 slice should turn selected experience into export drafts without automatically writing instruction files or introducing team workflows.

## What Changes

- Add an experience export draft capability that builds reviewable export plans from selected nodes, hygiene findings, and supporting evidence.
- Include candidate/node ids, scope, task family, compact guidance, evidence summary, provenance refs, risk notes, and suggested export target.
- Surface drafts through interaction and CLI/Codex inspect/export review surfaces.
- Keep drafts non-mutating: do not write instruction files, modify node state, publish team assets, or change feedback/state machines.
- Keep team/org capability and automated synchronization out of scope.

## Capabilities

### New Capabilities

- `experience-export-drafts`: Reviewable export draft reports for selected learned guidance.

### Modified Capabilities

- `cli-user-experience-surface`: Adds a CLI path to inspect/export draft reports.
- `mcp-native-interaction-surface`: Adds a read-only MCP/session surface for export draft inspection.

## Impact

- Affected code:
  - `src/maintenance/experience-export-drafts.ts`
  - `src/interaction/service.ts`
  - `src/cli/commands/inspect.ts` or `src/cli/commands/export.ts`
  - `src/adapters/codex/action-registry.ts`
  - `src/adapters/codex/mcp-server.ts`
- Affected tests:
  - `tests/unit/experience-export-drafts.test.ts`
  - `tests/unit/interaction-service.test.ts`
  - `tests/unit/inspect-command.test.ts` or export command coverage
  - Codex broker/resource tests if the MCP surface changes
