## Context

The current code already has reusable logic for analysis, intervention, feedback, and storage, but the operational entrypoint is still the OpenClaw plugin runtime. This change converts the architectural decision from the previous planning change into a concrete code boundary and a minimal installer UX that can be extended to additional hosts later.

## Goals / Non-Goals

**Goals:**
- Extract a concrete host-agnostic runtime boundary from the existing OpenClaw-oriented code.
- Add a product CLI entrypoint named `ee`.
- Implement `ee install openclaw` and `ee doctor` as the first installer slice.
- Introduce a product-owned data-home resolver while preserving compatibility with the current OpenClaw-specific location.
- Keep the current OpenClaw plugin behavior working after the refactor.

**Non-Goals:**
- Implement Claude Code or Codex adapters.
- Complete data migration into the product-owned data home.
- Add import/export or backup workflows in this change.

## Decisions

### Extract a runtime service layer under the core boundary

The current OpenClaw plugin runtime will be refit to call a host-agnostic runtime service that accepts normalized task, tool, and task-end events. Host-specific normalization stays in the OpenClaw adapter layer.

### Ship a minimal product CLI now

The first `ee` CLI only needs:
- `ee install openclaw`
- `ee doctor`

This is enough to make the unified installation surface real without overcommitting to future host installers.

### Resolve data home through one product resolver

The runtime and CLI should both resolve storage paths through a single product-owned resolver. In this phase:
- prefer a product-owned root when explicitly configured or installed
- continue to support the existing OpenClaw root for compatibility
- avoid forced migration of existing databases

### Keep installation mechanics explicit

`ee install openclaw` should be implemented as an OpenClaw-specific install flow under one product CLI. It does not imply that future hosts will use the same install mechanism.

## Risks / Trade-offs

- [Refactor may accidentally break the working OpenClaw plugin] → Keep adapter normalization isolated and add regression coverage around the plugin entrypoint.
- [Data-home compatibility can become confusing] → Make `ee doctor` report the active resolved paths and whether compatibility mode is in use.
- [CLI scope can sprawl] → Keep this phase limited to OpenClaw install and diagnostics only.

## Implementation Plan

1. Introduce a core runtime service and move shared orchestration behind it.
2. Move OpenClaw-specific payload parsing and hook registration into an explicit OpenClaw adapter layer.
3. Add a product path resolver that understands product-owned and compatibility-mode roots.
4. Add an `ee` CLI entrypoint with `install openclaw` and `doctor`.
5. Keep the existing plugin behavior and tests green after the refactor.

## Open Questions

- Should `ee install openclaw` write plugin metadata, plugin config, or both in this first slice?
- Should compatibility mode prefer the existing OpenClaw path automatically when a live database is detected there?
