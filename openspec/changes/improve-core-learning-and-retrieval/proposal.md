## Why

ExperienceEngine's host integrations are already usable, but the core learning loop is still dominated by placeholder heuristics. The current extractor, retrieval, harm attribution, and outcome resolution logic are too coarse to support the product's long-term claim of learning useful task-specific experience.

## What Changes

- Replace fixed strategy and warning templates with richer experience extraction that varies by task evidence rather than by outcome alone.
- Replace placeholder vector plumbing and exact candidate filtering with a real retrieval pipeline that supports semantic similarity and more flexible task-family matching.
- Improve outcome and harm attribution so injected guidance is not penalized for unrelated environmental or intermediate-step failures.
- Expand task classification beyond the current narrow debug-focused matcher set and introduce a non-`unknown` fallback path for general coding work.
- Add transactional persistence around task finalization so input records, node updates, stats, and injection artifacts do not drift on partial failure.
- Improve node explainability by recording clearer origin and attribution data that can later be exposed in inspect/MCP surfaces.
- Complete user-authored experience support so `remember` is no longer a scaffolded placeholder.

## Capabilities

### New Capabilities
- `experience-learning-quality`: Defines the quality bar for extraction, retrieval, attribution, persistence, and explainability in the core experience engine.

### Modified Capabilities
- `mcp-native-interaction-surface`: Interaction surfaces must expose richer node explainability and support user-authored experience workflows once the core data model supports them.

## Impact

- Affected code:
  - `src/analyzer/*`
  - `src/controller/*`
  - `src/input/*`
  - `src/feedback/*`
  - `src/runtime/service.ts`
  - `src/store/sqlite/*`
  - `src/store/vector/*`
  - `src/cli/commands/remember.ts`
  - MCP interaction read/control services and server wiring
- Affected systems:
  - SQLite schema and persistence behavior
  - candidate retrieval and ranking behavior
  - host-visible intervention quality on OpenClaw, Claude Code, and Codex
- Likely dependency impact:
  - a real local embedding/vector dependency or an equivalent semantic retrieval implementation
