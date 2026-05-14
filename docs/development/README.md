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

The blueprint is intentionally descriptive. It should explain the current system as it exists after the change. Do not use it to propose future work, implementation plans, or debate alternatives.

Architecture design proposals and implementation plans should live in their own design or OpenSpec change documents instead of creating a second standing architecture roadmap.

## Update Rule

Every architecture-changing PR or local change should update `architecture.md` for what the system now is.

If an architecture change does not require a blueprint update, the change description should say why.
