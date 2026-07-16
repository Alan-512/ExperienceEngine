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

Operational validation snapshots belong in [`source-repo-host-validation.md`](./source-repo-host-validation.md). Use that file to distinguish source-repo validation from published npm, marketplace, or ClawHub validation.

Matched-block repeated evidence for the published OpenClaw path is recorded in [`../openclaw-matched-block-campaign-v4.md`](../openclaw-matched-block-campaign-v4.md). Keep its single-scenario claim boundary separate from general host-support or production-readiness statements.

Architecture optimization audits belong in dated audit documents, such as [`architecture-optimization-implementation-audit-2026-05-14.md`](./architecture-optimization-implementation-audit-2026-05-14.md). They should map original plan items to implemented changes and remaining gaps; they are not standing roadmaps.

Follow-up implementation plans belong in scoped plan documents, such as [`quality-band-and-operator-surface-followup-plan.md`](./quality-band-and-operator-surface-followup-plan.md). These plans guide future OpenSpec changes, but they should not replace the current-state architecture blueprint.

## Update Rule

Every architecture-changing PR or local change should update `architecture.md` for what the system now is.

If an architecture change does not require a blueprint update, the change description should say why.
