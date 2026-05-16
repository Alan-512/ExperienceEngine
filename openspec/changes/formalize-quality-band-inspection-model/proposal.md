## Why

ExperienceEngine already exposes a lightweight `qualityBand`, but the derivation is local and underspecified, so CLI, MCP, repo summary, and no-injection explanations can drift in how they describe trust. This change productizes Quality Band as one derived explanation layer before the broader operator-surface cleanup.

## What Changes

- Add a shared Quality Band inspection model with `strong`, `building`, and `risky` bands, reason codes, readable reasons, evidence references, and recommended review actions.
- Use the shared model across node summaries/details, last-intervention inspection, repo summary, and explicit no-injection explanations.
- Keep Quality Band read-only and explanatory; it must not become a delivery gate, lifecycle state, migration, or numeric score.
- Expose enough evidence for users to understand why a learned experience is trusted, still building evidence, or risky.
- Update tests and docs so Quality Band language is stable before #5 surface consolidation.

## Capabilities

### New Capabilities

- `experience-quality-band`: Derived Quality Band model and explanation contract for learned guidance and no-injection inspection.

### Modified Capabilities

- `cli-user-experience-surface`: CLI inspect and summary outputs include consistent Quality Band explanations and evidence.
- `mcp-native-interaction-surface`: MCP inspection resources expose structured Quality Band fields instead of requiring terminal-output parsing.

## Impact

- Affected code:
  - `src/interaction/service.ts`
  - new or existing quality-band helper module under `src/interaction` or `src/experience-management`
  - `src/cli/commands/inspect.ts`
  - `src/adapters/codex/mcp-server.ts` and related interaction resource serialization if needed
  - related unit tests
- Affected docs:
  - `docs/user-guide.md`
  - `docs/development/architecture.md` if the shared derived model changes architecture description
  - release notes for the target version
- No database schema change.
- No prompt-time injection or delivery gating behavior change.

