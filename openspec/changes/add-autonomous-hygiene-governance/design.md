## Context

ExperienceEngine currently exposes hygiene, export drafts, repo policy inspection, and operator review as read-only surfaces. That was the right baseline for proving the governance model, but recent local usage shows the limitation: high-severity hygiene findings can accumulate, and resolving them manually requires the operator to understand node lifecycle, delivery state, helped/harmed evidence, export readiness, and scope history.

The product runs attached to coding hosts such as Codex, Claude Code, and OpenClaw. Users may frequently start and stop those hosts, may use more than one host against the same ExperienceEngine home, and should not be expected to run `ee inspect hygiene` or maintenance commands as a routine behavior. Host lifecycle events are therefore useful wake-up signals, but they cannot be the authority for governance frequency.

The current product constraints still matter:

- ExperienceEngine is a production-first experience governance layer, not a generic memory cleaner.
- LLM output can assist semantic judgment, but must not directly mutate node state or delivery state.
- Hygiene reports remain read-only diagnostics.
- Delivery-state gates, disabled scopes, retired nodes, quarantined nodes, and destructive-risk policy remain authoritative.

## Goals / Non-Goals

**Goals:**

- Make hygiene governance automatic for normal users.
- Keep governance frequency stable even when hosts are opened, closed, or run concurrently.
- Use LLMs for semantic clustering, canonicalization proposals, and explanation.
- Use deterministic validators and transaction boundaries for all mutations.
- Automatically apply low-risk and safety-improving governance actions.
- Automatically apply valid high-impact experience-store actions through guarded execution instead of requiring routine approval.
- Preserve provenance, auditability, and rollback for every applied mutation.

**Non-Goals:**

- Do not build a standalone review console in this change.
- Do not make hygiene review itself mutating.
- Do not let LLM output write directly to SQLite.
- Do not automatically promote delivery state or export guidance.
- Do not require a persistent daemon for the default path.
- Do not solve team or remote multi-user governance.

## Decisions

### 1. Host lifecycle is a trigger source, not the scheduler authority

Persist a per-scope governance schedule in ExperienceEngine storage:

- `last_governed_at`
- `next_due_at`
- `pending_reasons`
- `last_run_status`
- `backoff_until`
- `lease_owner`
- `lease_expires_at`

The schedule and lease key must use the same canonical scope identity as retrieval and learning. Windows paths, WSL paths, OpenClaw workspace paths, and host-provided cwd aliases must resolve before the schedule key is read or written. The lease owner stores a host instance id for diagnostics, but host instance identity is never part of the schedule key.

Host startup, prompt lookup, posttask finalization, and stop events call a cheap `maybeEnqueueGovernance(scope)` check after scope canonicalization. That check reads persisted schedule state and decides whether work is due. If a user opens Codex twenty times in one day, ExperienceEngine performs twenty cheap checks but at most the configured number of governance runs.

Alternative considered: run governance on every host startup. Rejected because host churn would over-govern, consume LLM budget, and make behavior depend on user habits rather than scope health.

### 2. Opportunistic by default, optional keeper for strict wall-clock schedules

Default governance is host-attached and opportunistic. If no supported host is running, no background governance executes. The next host event catches up by checking `next_due_at` and pending reasons.

For users who want strict wall-clock governance, install or repair flows can add an optional keeper:

- Windows Task Scheduler
- macOS launchd
- Linux systemd timer or cron

The keeper only wakes the same governance drain path. It does not bypass leases, budgets, validators, or persisted schedules.

Alternative considered: require a daemon. Rejected because ExperienceEngine must remain lightweight and host-compatible in environments where installing services is inappropriate.

### 3. Governance work is queued, leased, bounded, and checkpointed

Governance runs use a SQLite-backed queue and lease. A host must acquire the per-scope lease before planning or applying actions. Other hosts record a skipped or deferred reason and return quickly. Leases expire so a crashed host cannot block governance forever.

Each run has budgets:

- cheap due check: milliseconds
- lightweight planning: seconds
- apply pass: bounded node/action count
- full weekly sweep: larger but still bounded

Longer runs checkpoint progress and resume from a pending plan or action cursor. Stop hooks must never block waiting for a full sweep.

Alternative considered: synchronous full governance after posttask. Rejected because host finalization should remain responsive and because short host sessions are common.

### 4. LLM plans, deterministic code validates and applies

The LLM planner receives bounded hygiene findings, candidate/node summaries, attribution summaries, scope metadata, and export risk notes. It returns a strict JSON plan:

```ts
type HygieneGovernancePlan = {
  clusterId: string;
  theme: string;
  canonicalNodeId?: string;
  actions: HygieneGovernanceAction[];
  expectedEffect: {
    conflictReduction: number;
    preservedEvidenceRefs: string[];
    injectionSafetyChange: "lower" | "same" | "higher";
  };
};
```

The planner may propose:

- `merge_node`
- `narrow_node`
- `retire_node`
- `downgrade_delivery`
- `quarantine_node`
- `label_cluster`
- guarded high-impact experience-node actions such as conservative promotion or soft retirement

The planner cannot directly update repositories. The validator converts only approved, valid plan actions into mutations.

Alternative considered: extend the existing distillation merge decider to mutate hygiene findings. Rejected because distillation merge is an ingest-time decision, while hygiene governance is a post-hoc lifecycle and safety workflow with different risk boundaries.

### 5. Apply low-risk and safety-improving actions automatically

Automatic actions are limited to cases that reduce risk or preserve behavior:

- exact duplicate merge
- near-duplicate merge where one node is shadow-only or has no helped/harmed history
- stale shadow-only retirement when the node has no use, no helped evidence, and no recent origin
- canonical evidence merge that preserves all origin/helped/harmed refs
- delivery downgrade from `eligible` to `conservative_only`
- quarantine for invalidated or harmed live nodes when existing governance rules already justify it

Automatic actions must not:

- physically delete records
- cross scopes
- promote directly to live-eligible delivery
- remove evidence refs
- merge strategy and warning nodes without a specific validator rule
- broaden applicability or compact hints
- export guidance into repo instructions, docs, or skills

Alternative considered: keep all mutation behind manual approval. Rejected because it leaves the core product problem unsolved and continues to require high-skill routine operation.

### 6. High-impact experience-store actions use guarded automatic execution

The normal governance path does not ask users to approve or reject experience-store cleanup. High-impact experience-node actions are constrained before they can apply:

- delivery promotion can only land in `conservative_only`, never directly in `eligible`
- delete-like actions are soft-retire/quarantine mutations; the row remains in the store
- semantic or conflicted merges preserve all evidence, support counts, and origin/helped/harmed references
- when both merge sides have meaningful helped/harmed histories, the canonical node is kept out of direct live eligibility
- every guarded action writes affected row hashes and rollback snapshots before mutation

The automatic governance path rejects actions outside experience-store lifecycle control:

- broad rewrites without an explicit replacement contract
- exporting guidance into repo files, docs, skills, or instructions
- repo policy changes
- restoring retired/quarantined guidance to live eligibility
- credential, release, security, or external-provider behavior changes beyond safety downgrade/quarantine

Approval records and brokered approval actions remain as compatibility and inspection surfaces for older queued records. They are not the routine route for newly planned autonomous hygiene governance.

Alternative considered: block all high-impact work until a CLI operator reviews it. Rejected because normal users will not run recurring CLI governance commands.

### 7. Audit and rollback are first-class

Before any mutation, ExperienceEngine writes a snapshot of affected rows and plan metadata. Each action records:

- run id
- plan id
- action type
- affected ids
- before refs
- after refs
- validator decision
- applied timestamp
- rollback reference

Rollback restores affected rows from the snapshot and records a rollback action. Rollback is explicit; automatic rollback only occurs inside a failed transaction before commit. A rollback must verify the current affected row versions and the action dependency chain. If later governance actions have modified the same rows, ExperienceEngine refuses blind restore and queues a rollback review item.

Alternative considered: rely on backups or SQLite journal behavior. Rejected because governance actions need product-level explainability and targeted rollback.

### 8. Current provider/config conflicts become a regression fixture

The local `provider/config_debug/OpenRouter/canary` conflict cluster should be captured as a test fixture. Expected behavior:

- cluster related provider/config nodes under one theme
- preserve distinct subconditions such as `thinking=minimal`, `max_tokens`, provider availability, registry prefix, and temporary quota exhaustion
- retire or downgrade stale/invalidated nodes
- avoid creating one over-broad generic provider rule
- reduce high-severity conflict count after safe application

This fixture protects against a planner that merely summarizes conflicts without making useful governance decisions.

## Risks / Trade-offs

- [LLM over-merges distinct lessons] -> Validators reject broadening rewrites, cross-node-type merges, high-evidence merges, and plans that lose subconditions or evidence refs.
- [Host churn causes repeated runs] -> Persisted schedules, leases, backoff, and run budgets make host events idempotent.
- [Short host sessions leave governance half-done] -> Queue pending runs and checkpoint plans/actions for later drain.
- [Multiple hosts race on the same store] -> SQLite leases are per scope and expire safely.
- [Automatic mutation hides important changes] -> Record every action, expose recent actions in status/MCP, and create rollback snapshots.
- [Governance consumes too much LLM budget] -> Use hygiene thresholds, per-scope cadence, bounded plan inputs, cache plan hashes, and skip planning when findings are unchanged.
- [Auto-governance conflicts with current read-only operator specs] -> Keep hygiene/operator review read-only and put mutation in the new autonomous governance capability.
- [Guarded execution over-applies high-impact experience changes] -> Keep high-impact experience-store actions reversible and conservative: no physical deletes, no direct live eligibility, evidence preservation, affected-row hashes, and rollback snapshots.
- [Scope aliases split governance state] -> Resolve canonical scope identity before schedule, lease, plan, and action writes; test Windows/WSL and multi-host aliases against the same EE home.

## Migration Plan

1. Add migrations for governance schedules, runs, plans, actions, leases, and snapshots.
2. Add repositories and pure planning/validation/apply services behind feature flags or conservative defaults.
3. Wire host lifecycle events to cheap enqueue/drain checks without blocking normal task paths.
4. Add read-only inspection surfaces for governance status, recent actions, guarded actions, legacy pending approvals, and rollback refs.
5. Enable Tier 0 planning and dry-run reporting first.
6. Enable Tier 1 safe auto-apply after validator coverage is in place.
7. Enable Tier 2 safety-improving downgrades/quarantine after governance state transition tests pass.
8. Keep Tier 3 experience-store actions guarded and automatic; reject non-store high-impact actions from autonomous governance.

Rollback strategy:

- Disable the autonomous governance scheduler.
- Stop draining pending governance runs.
- Use action snapshots to rollback individual applied plans when needed.
- Preserve existing hygiene review and operator review behavior.

## Open Questions

- Should strict wall-clock keeper installation be opt-in only, or enabled automatically during host repair when the platform supports it?
- What default daily/weekly cadence should ship for active repos after local validation?
- Which LLM provider/model should be the default planner when distillation and second-opinion providers differ?
- Should legacy approval expiration automatically convert stale approvals into conservative downgrades, or leave them pending?
