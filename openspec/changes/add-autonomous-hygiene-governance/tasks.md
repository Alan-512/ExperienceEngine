## 1. Storage And Migration

- [x] 1.1 Add migrations for governance schedules, runs, plans, actions, approvals, leases, rollback snapshots, affected row hashes, and action dependency metadata.
- [x] 1.2 Add repositories for governance schedule state, run records, plan records, action records, approval records, lease acquisition, and snapshots.
- [x] 1.3 Add transaction helpers for applying governance actions with before snapshots and after-state audit records.
- [x] 1.4 Add rollback helper that verifies affected row hashes and dependency chains before restoring from a recorded governance snapshot.

## 2. Scheduler And Queue

- [x] 2.1 Implement canonical scope resolution for governance schedule and lease keys using existing scope/cwd normalization.
- [x] 2.2 Implement per-scope `maybeEnqueueGovernance` using persisted `next_due_at`, `backoff_until`, pending reasons, and finding hashes.
- [x] 2.3 Implement per-scope lease acquisition, renewal, expiry, and release with host instance owner metadata.
- [x] 2.4 Implement bounded governance drain with time budgets, action budgets, checkpointing, and resume behavior.
- [x] 2.5 Implement failure-class backoff for LLM/provider, validator, SQLite busy, and apply failures.
- [x] 2.6 Wire cheap enqueue/drain checks into host startup, prompt lookup, posttask finalization, and stop paths without blocking normal task handling.
- [x] 2.7 Add optional keeper entrypoint that drains due governance through the same scheduler, lease, and validator path.

## 3. Planning

- [x] 3.1 Add a bounded hygiene input builder that collects hygiene findings, node/candidate summaries, attribution summaries, export risk notes, and scope metadata.
- [x] 3.2 Add an LLM hygiene governance planner that returns strict JSON plans with clusters, canonical candidates, actions, risk levels, and expected effects.
- [x] 3.3 Add deterministic fallback planning for exact duplicates and stale shadow-only guidance when LLM planning is unavailable.
- [x] 3.4 Cache or skip planning when the current hygiene finding hash matches a previous completed plan.
- [x] 3.5 Add the provider/config debug conflict cluster as a fixture for planner and validator tests.

## 4. Validation

- [x] 4.1 Implement merge validators for exact duplicate guidance, requiring same scope, same task family, same node type, evidence preservation, and compatible lifecycle/delivery state.
- [x] 4.2 Implement merge validators for near-duplicate guidance, requiring at least one shadow-only/no-history node and preservation of narrower triggers, subconditions, and avoid constraints.
- [x] 4.3 Implement retire validators for stale shadow-only guidance, requiring no usage, no helped evidence, no recent origin evidence, and no legacy pending approval references.
- [x] 4.4 Implement safety validators for delivery downgrade and quarantine based on invalidation or harmful evidence.
- [x] 4.5 Implement rewrite validators that reject broadened applicability, removed trigger constraints, or lost subconditions.
- [x] 4.6 Implement high-impact validators that allow guarded automatic execution for experience-store mutations and reject export writing, broad rewrites without replacement contracts, repo policy changes, and restore-to-live actions.
- [x] 4.7 Reject plans that lose origin/helped/harmed/attribution/review evidence references.
- [x] 4.8 Reject automatic scope-crossing merges unless an explicit scope merge already exists.
- [x] 4.9 Validate that accepted automatic actions reduce hygiene risk or keep behavior no less safe.

## 5. Action Application

- [x] 5.1 Apply exact duplicate merges with preserved evidence, support counts, canonical node state, and affected row hashes.
- [x] 5.2 Apply near-duplicate merges with preserved subconditions, avoid constraints, evidence, support counts, and affected row hashes.
- [x] 5.3 Apply stale shadow-only retirement when validator criteria pass.
- [x] 5.4 Apply safety-improving delivery downgrade or quarantine for invalidated or harmed live guidance.
- [x] 5.5 Apply high-impact experience-store actions automatically through guarded execution, including conservative promotion, soft-retire, and conflicted evidence-preserving merges.
- [x] 5.6 Ensure every applied action writes run, plan, action, validator, snapshot, dependency, and rollback references.
- [x] 5.7 Make action apply and legacy approval state transitions idempotent under repeated or concurrent requests.

## 6. Host, CLI, And MCP Surfaces

- [x] 6.1 Add CLI inspection for governance status, recent actions, guarded actions, failed runs, legacy pending approvals, plan detail, and rollback references.
- [x] 6.2 Add CLI maintenance drain command that uses the same persisted schedule, lease, budget, validator, and audit path.
- [x] 6.3 Extend operator review summaries with governance status, recent automatic actions, guarded actions, failures, and legacy pending approval summaries.
- [x] 6.4 Add MCP governance status resource and brokered inspect action.
- [x] 6.5 Add MCP legacy pending approvals resource and brokered inspect action.
- [x] 6.6 Keep MCP approval planning action for legacy approval records with confirmation tokens bound to scope, plan, action, affected row hashes, diff summary, and expiration.
- [x] 6.7 Keep MCP approval execution and rejection actions for legacy records with atomic state transitions and stale-row re-planning.
- [x] 6.8 Update host capability descriptions so routine governance is automatic and CLI is a fallback surface.

## 7. Documentation

- [x] 7.1 Update `README.md`, `README.zh-CN.md`, and `docs/user-guide.md` to explain automatic hygiene governance, host-attached scheduling, optional keeper behavior, and read-only hygiene/operator review boundaries.
- [x] 7.2 Add release notes that distinguish autonomous governance mutation from read-only hygiene/operator inspection.
- [x] 7.3 Update development architecture documentation if implementation introduces new scheduler, planner, validator, or approval modules.

## 8. Tests And Validation

- [x] 8.1 Add unit tests for schedule idempotency under frequent host startup and stop events.
- [x] 8.2 Add unit tests for canonical scope identity across Windows/WSL aliases and multi-host shared EE home.
- [x] 8.3 Add unit tests for multi-host lease behavior, lease expiry, checkpoint resume, and backoff.
- [x] 8.4 Add planner tests for provider/config conflict clustering and unchanged finding hash skipping.
- [x] 8.5 Add validator tests for evidence preservation, no broadening, no scope crossing, guarded promotion, stale-retire criteria, near-duplicate criteria, guarded high-impact execution, and non-store action rejection.
- [x] 8.6 Add action-application tests for exact merge, near-duplicate merge, retire, downgrade, quarantine, guarded promotion, guarded soft-retire, audit records, rollback, dependency conflicts, and idempotency.
- [x] 8.7 Add integration tests proving host finalization does not wait for full governance and later events resume pending work.
- [x] 8.8 Add CLI/MCP contract tests for governance status, plan detail, legacy pending approvals, plan-confirm approval compatibility, rejection, stale approval rejection, and operator review summaries.
- [x] 8.9 Run targeted unit/integration tests, typecheck, build, and `openspec validate add-autonomous-hygiene-governance --strict`.
