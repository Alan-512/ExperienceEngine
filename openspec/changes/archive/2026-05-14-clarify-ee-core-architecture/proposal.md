## Why

ExperienceEngine now has enough host wiring, runtime behavior, governance logic, and operator tooling that future changes need a durable architecture baseline. Without a required current-state blueprint, architecture changes can land in code while the mental model used by coding agents and maintainers drifts.

## What Changes

- Establish `docs/development/architecture.md` as the required current architecture blueprint.
- Establish `docs/development/architecture-optimization-roadmap.md` as the staged architecture direction, not a substitute for the blueprint.
- Add a development docs README that defines when architecture changes must update the blueprint.
- Keep this change documentation-only; it does not change runtime behavior, host behavior, schema, CLI commands, or MCP tools.

## Capabilities

### New Capabilities

- `architecture-governance`: Development documentation must maintain a current architecture blueprint and distinguish current-state docs from future optimization plans.

### Modified Capabilities

- None.

## Impact

- Affects development documentation and future change hygiene.
- Does not affect product runtime, installed adapters, public docs, or published package behavior.
