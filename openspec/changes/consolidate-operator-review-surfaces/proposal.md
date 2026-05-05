## Why

ExperienceEngine now has separate repo policy, hygiene, and export-draft inspection surfaces, but operators still have to stitch those reports together manually. The next Phase 7 slice should make the review loop coherent without building a full console or adding new mutation paths.

## What Changes

- Add a read-only operator review flow that summarizes repo policy state, hygiene findings, and guidance export drafts for one scope.
- Provide a recommended review order and next actions, while keeping each action advisory and non-mutating.
- Surface the review flow through `ee inspect review` and Codex/MCP read-only inspection.
- Keep repo policy, hygiene, and export draft detailed reports as separate drill-down surfaces.
- Improve the archived `experience-export-drafts` spec purpose text as direct implementation-time documentation hygiene, not as an OpenSpec delta requirement.

## Capabilities

### New Capabilities

- `operator-review-flow`: A bounded read-only review report that coordinates repo policy, hygiene, and export-draft signals for operator decision-making.

### Modified Capabilities

- `cli-user-experience-surface`: Adds `ee inspect review` as the operator-level read-only review entry.
- `mcp-native-interaction-surface`: Adds an MCP read-only resource and brokered inspect action for the operator review flow.

## Impact

- Affected code:
  - `src/maintenance/operator-review-flow.ts`
  - `src/interaction/service.ts`
  - `src/cli/commands/inspect.ts`
  - `src/adapters/codex/action-registry.ts`
  - `src/adapters/codex/mcp-server.ts`
  - `openspec/specs/experience-export-drafts/spec.md`
- Affected tests:
  - `tests/unit/operator-review-flow.test.ts`
  - `tests/unit/interaction-service.test.ts`
  - `tests/unit/inspect-command.test.ts`
  - Codex action/MCP tests if the MCP surface changes
