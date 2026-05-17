## Why

ExperienceEngine's hygiene review can now identify duplicate, conflicting, stale, and drifted guidance, but resolving those findings still depends on high-effort operator review. That does not match the product goal of a background experience governance layer attached to coding hosts, especially when users may frequently start and stop hosts and will not routinely run CLI maintenance commands.

This change adds autonomous, host-attached hygiene governance: ExperienceEngine periodically plans and applies hygiene cleanup in the background, uses LLMs for semantic clustering proposals, and applies valid experience-store mutations automatically through deterministic validation and guarded execution.

## What Changes

- Add persisted per-scope governance scheduling so host startup, prompt, posttask, and stop events are trigger sources rather than the scheduling authority.
- Add a background governance queue with leases, time budgets, checkpointing, backoff, and run records so frequent host restarts or multiple hosts cannot over-run governance.
- Add an LLM-assisted hygiene planner that clusters hygiene findings, chooses canonical nodes, proposes merge/narrow/retire/downgrade actions, and explains expected risk reduction.
- Add deterministic validators that prevent unsafe LLM plans from mutating state, including rules that preserve evidence, avoid scope crossing, forbid direct live-eligible promotion, and reject broadening rewrites.
- Add automatic application for validated experience-store actions, such as exact duplicate merge, near-duplicate merge, stale shadow-only retirement, evidence-preserving canonicalization, delivery downgrade or quarantine for risky live nodes, guarded conservative promotion, guarded soft-retire, and guarded conflicted merges.
- Reject actions outside autonomous experience-store governance, such as export writing, repo policy changes, restore-to-live, physical deletion, and broad rewrites without an explicit replacement contract.
- Add auditable governance run, plan, action, and snapshot records with rollback support for applied mutations.
- Update inspection surfaces to show autonomous governance status, recent automatic actions, guarded actions, blocked plans, legacy pending approvals, and rollback references without making CLI usage the normal path.
- Preserve existing read-only hygiene review behavior; hygiene reports remain diagnostic inputs and do not mutate state by themselves.

## Capabilities

### New Capabilities
- `autonomous-hygiene-governance`: Periodic LLM-assisted governance planning, deterministic validation, safe and guarded automatic application, lease-based scheduling, audit records, rollback snapshots, and compatibility surfaces for legacy approval records.

### Modified Capabilities
- `experience-hygiene-review`: Hygiene findings remain read-only, but become an explicit input contract for autonomous governance planning.
- `operator-review-flow`: Operator review includes autonomous governance summaries, guarded action history, failures, and legacy pending approval items while staying non-mutating.
- `cli-user-experience-surface`: CLI inspection/status surfaces expose governance health and plan visibility, but users are not required to run CLI commands for routine governance.
- `mcp-native-interaction-surface`: MCP resources and brokered actions expose governance status, legacy approvals, and recent actions for host-native interaction.

## Impact

- Adds new maintenance/governance services, repositories, and migrations for governance runs, plans, actions, leases, snapshots, and per-scope schedules.
- Extends host adapters so existing host lifecycle events opportunistically enqueue or drain governance work without blocking normal prompt handling.
- Reuses existing distillation/LLM provider infrastructure for semantic planning, but does not allow LLM output to write database state directly.
- Extends inspection/reporting surfaces for status, history, guarded actions, legacy pending approvals, and rollback references.
- Adds tests for scheduler idempotency, multi-host lease behavior, validator rejection, safe and guarded auto-apply, rollback snapshot creation, and real-world provider/config hygiene clusters.
