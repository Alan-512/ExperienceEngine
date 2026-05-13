# ExperienceEngine Development Docs

This directory holds development-facing product and architecture notes for ExperienceEngine.

## Required Architecture Baseline

[`architecture.md`](./architecture.md) is the current architecture blueprint.

Keep it current whenever a change modifies ExperienceEngine's architecture, including:

- top-level module boundaries or directory ownership
- host adapter responsibilities
- runtime, learning, retrieval, intervention, feedback, or governance flow
- core domain objects, storage tables, or object relationships
- CLI, MCP, install, repair, or operator surfaces when they affect architecture
- supported host behavior when it changes the shared core model

The blueprint is intentionally descriptive. It should explain the current system as it exists after the change. Do not use it to propose future work or debate alternatives.

## Optimization Roadmap

[`architecture-optimization-roadmap.md`](./architecture-optimization-roadmap.md) is the architecture direction and staged improvement roadmap.

Update it when architectural priorities, phase boundaries, or execution constraints change. It should remain a roadmap, not a substitute for the current-state blueprint.

## Update Rule

Every architecture-changing PR or local change should update both documents when needed:

- update `architecture.md` for what the system now is
- update `architecture-optimization-roadmap.md` for what the plan now means

If an architecture change does not require a blueprint update, the change description should say why.
