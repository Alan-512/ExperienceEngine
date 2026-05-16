## Why

ExperienceEngine now has routine review, operator review, repair/upgrade, hygiene, export drafts, brokered actions, and maintenance commands, but the CLI/MCP descriptions still mix these layers. This change makes the interaction surface easier to understand by separating routine, operator, and advanced/experimental workflows without removing existing commands.

This change should be implemented after `formalize-quality-band-inspection-model` so CLI, MCP, and docs consolidation can reuse stable Quality Band wording.

## What Changes

- Define durable surface tiers: routine, operator, and advanced/experimental.
- Reorganize CLI help and docs so normal usage starts with routine host-first workflows.
- Keep operator workflows discoverable for repair, upgrade, review, hygiene, export drafts, and package/host validation.
- Mark advanced/experimental workflows as advanced instead of presenting internal maintenance and broker internals as normal daily use.
- Align Codex MCP capabilities and broker action metadata with the same tier vocabulary.
- Do not remove, rename, or break existing commands in this pass.

## Capabilities

### New Capabilities

- `interaction-surface-boundaries`: Product contract for routine, operator, and advanced ExperienceEngine interaction surfaces.

### Modified Capabilities

- `cli-user-experience-surface`: CLI help and documented CLI fallback behavior expose routine/operator/advanced groupings.
- `mcp-native-interaction-surface`: MCP capability metadata and brokered actions expose tiered surface boundaries consistently.

Referenced existing capabilities whose behavior is not changed:

- `operator-review-flow`: Existing review reports are classified as operator-tier read-only workflows.
- `experience-hygiene-review`: Existing hygiene reports are classified as operator-tier read-only workflows.
- `experience-export-drafts`: Existing export draft reports are classified as operator-tier read-only workflows; this change does not make them write exports.

## Impact

- Affected code:
  - `src/cli/dispatch.ts`
  - `src/adapters/codex/mcp-server.ts`
  - `src/adapters/codex/action-registry.ts`
  - `src/adapters/codex/broker-tools.ts` if action descriptions or risk summaries need tier wording
  - related CLI and MCP tests
- Affected docs:
  - `README.md`
  - `README.zh-CN.md`
  - `docs/user-guide.md`
  - `docs/development/architecture.md` if the architecture interaction-surface description changes
  - release notes for the target version
- No removal of existing commands.
- No change to runtime learning, retrieval, injection, feedback, or storage behavior.
