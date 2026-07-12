## 1. Queue State And Metadata

- [ ] 1.1 Materialize the imported protected-write matrix, queue metadata, entity-state definitions, stable failure mapping, transition/counter/resume table, and provenance schema/aggregation policy as typed exhaustive fixtures/constants.
- [ ] 1.2 Add mechanical job/candidate states, state revisions, claim fields, blocked fields, and stable failure metadata.
- [ ] 1.3 Add separate system-attempt, worker-interruption, and content-retry counters.
- [ ] 1.4 Add complete process/activation/configuration/route/schema authority bindings to claims.
- [ ] 1.5 Add tests that claim fields are non-null only in `processing` and candidate rows never persist transient claim ownership as candidate truth.

## 2. Atomic Claim And Renewal

- [ ] 2.1 Implement one-transaction runnable selection and conditional claim.
- [ ] 2.2 Implement fenced claim renewal using current claim id, owner, fence, state revision, and production authority.
- [ ] 2.3 Add contention, duplicate claim, stale revision, and stale fence tests.

## 3. Completion And Recovery

- [ ] 3.1 Implement one semantic completion transaction across job, candidate, node, provenance, and projections.
- [ ] 3.2 Implement authority-loss interruption recovery without semantic writes or content-retry consumption.
- [ ] 3.3 Add blocked, resume, cancel, discard, and stale-claim recovery transitions with exact counter effects.
- [ ] 3.4 Prove only current recovery authority or exact claim-expiry recovery can clear a stale claim; stale workers cannot choose a semantic outcome.

## 4. Failure And Provenance Policy

- [ ] 4.1 Implement provider/system/content/policy/compatibility failure categories and stable codes.
- [ ] 4.2 Enforce `route-escalation-disabled-v1` for candidate-specific failures.
- [ ] 4.3 Persist semantic-origin provenance and conservative aggregation.
- [ ] 4.4 Enforce `custom-shadow-only-v1` across node creation, merge, governance, and manual promotion.
- [ ] 4.5 Add exhaustive one-code/one-class/one-scope mapping tests and forbid free-text-driven state transitions.
- [ ] 4.6 Implement the exact provenance relation, 64-key bound, conservative compaction buckets, derived fields, and revoked/unbenchmarked preservation tests.
- [ ] 4.7 Replace the legacy generic distillation retry requirement with system-route, interruption, and candidate-content lifecycle tests; prove only content retry exhaustion discards a candidate.
- [ ] 4.8 Add intervention-governance regression tests proving custom-origin `shadow_only` overrides the existing strong diagnostic-hint path while evaluated-origin behavior remains unchanged.

## 5. Activation Boundary

- [ ] 5.1 Add a fail-closed production-authority interface consumed by queue operations.
- [ ] 5.2 Keep production claim/renew/semantic completion disabled until S6 provides authoritative handshake bindings.
- [ ] 5.3 Prove no queue repository or worker service reconstructs a weaker production-authority predicate locally.

## 6. Validation

- [ ] 6.1 Run focused queue, retry, failure, provenance, and authority-loss tests.
- [ ] 6.2 Run TypeScript typecheck and affected runtime/repository tests.
- [ ] 6.3 Run full tests and build after shared queue/storage changes.
- [ ] 6.4 Run `pnpm exec openspec validate add-fenced-learning-queue-semantics --strict`.
