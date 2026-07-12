## Context

The frozen protocol requires one production worker to claim work atomically and revalidate the same current authority at renewal and semantic completion. Authority loss must not masquerade as candidate content failure. A stale worker may perform only the bounded interruption-recovery transition that clears or recovers its old claim without writing semantic content or consuming content retry.

## Normative Frozen Contract Import

This change imports `phase-0.5a.1-freeze-2026-07-11` Sections 4.9–4.11, 5.5, and 8.1–8.6.

The implementation SHALL mechanically encode and test:

- the protected-write operation and worker-lease-state matrix;
- exact job states `pending | processing | blocked | failed | succeeded | discarded` and candidate states `pending | blocked | failed | distilled | discarded`;
- the complete required queue metadata and claim-field nullability rules;
- every stable `EE_*` failure code, its one failure class and default scope, and the complete transition/counter/resume table;
- `route-escalation-disabled-v1` and the rule that route-level schema invalidity comes only from explicit initialization validation or explicit route health probing;
- the exact authority-loss recovery writer and CAS predicates;
- semantic-origin reference fields, assurance ordering, dedicated node-provenance relation, 64-key exact bound, conservative compaction, and derived provenance fields;
- the unconditional `custom-shadow-only-v1` delivery cap.

S5 SHALL import `production_write_authorized` from S6 through one interface. It may define a fail-closed placeholder before S6, but it cannot implement, approximate, cache, or weaken the predicate locally.

## Goals / Non-Goals

**Goals:**

- Prevent duplicate claims and partial job/candidate/node updates.
- Bind claims to exact process, activation, configuration, route, and schema authority.
- Separate infrastructure attempts, worker interruptions, and content retries.
- Preserve blocked work through provider/system outages.
- Persist semantic-origin provenance and enforce custom-origin shadow-only delivery.

**Non-Goals:**

- Defining the package activation state machine or production handshake writer.
- Treating a worker lease as production write authority.
- Automatically changing routes based on candidate failures.
- Enabling custom-origin conservative or live delivery.
- Publishing or documenting full OpenClaw learning support.

## Decisions

### 1. Claim with one conditional transaction

A runnable job is selected and changed to `processing` in one write transaction using expected state revision plus the exact worker and production authority bindings. List-then-upsert is not accepted.

### 2. Store the complete claim authority snapshot

The claim records worker owner/fence, supervisor epoch, package generation, current activation revision, current production handshake id, configuration generation, effective route fingerprint/revision, schema versions, and route/capability bindings needed for later revalidation.

Claim fields are non-null only while the job is `processing`; every transition out of `processing` clears them atomically. Candidate rows retain content retry, provenance, lifecycle, and terminal facts but never copy transient worker ownership as candidate truth.

### 3. Revalidate on every worker-originated transition

Claim renewal and every transition from `processing` require the current claim id, owner, fence, expected state revision, and `production_write_authorized(existing_claim)`. Semantic completion occurs in one transaction that writes all applicable job, candidate, node, provenance, and projection changes.

### 4. Use a narrow interruption-recovery exception

When current production authority is lost, no semantic write may commit. One bounded recovery CAS may change unfinished old work to the defined interrupted/runnable/blocked state, clear the old claim, and increment only interruption metadata.

That transaction belongs to the current supervisor/gateway recovery authority or exact claim-expiry recovery, not to the stale worker. It may not select success, blocked, failed, or discarded based on stale computed output.

### 5. Keep retry namespaces independent

System attempts count route/provider/system execution attempts. Interruptions count ownership/lifecycle disruption. Content retries count candidate-specific semantic invalidity. One category cannot consume another category's budget.

### 6. Disable route escalation from candidate failures

`route-escalation-disabled-v1` prevents candidate-specific failures from automatically marking a route unhealthy or selecting a fallback route. Route authority changes only through the dedicated configuration/route protocol.

### 7. Aggregate provenance conservatively

Candidate and node records retain exact or conservatively compacted semantic-origin facts. Any unbenchmarked custom semantic origin sets `contains_unbenchmarked_origin = true` and permanently caps the node at `shadow_only` under v1.

## Risks / Trade-offs

- [Risk] Large completion transactions can contend. → Mitigation: bounded semantic transactions, deterministic write set, and the shared busy policy without weakening fences.
- [Risk] Recovery can accidentally consume content retries. → Mitigation: separate columns and transition assertions for each counter.
- [Risk] Provenance aggregation can become large. → Mitigation: exact bounded sets or conservative compaction that never raises assurance.
- [Risk] Jobs may remain blocked during outages. → Mitigation: explicit blocked state, age/count diagnostics, and operator controls in later activation/status surfaces.

## Acceptance Gate

- Tests cover competing claims, renewal, duplicate completion, stale fences, authority loss, interruption-only recovery, retry separation, failure taxonomy, atomic node/job/candidate commit, route-escalation disablement, and custom-origin caps.
- Without an authoritative S6 handshake fixture, production claim and semantic completion always fail closed.
- `pnpm exec openspec validate add-fenced-learning-queue-semantics --strict` passes.
