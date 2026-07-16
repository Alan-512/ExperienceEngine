# Phase 0.5A.1 OpenSpec Slicing Independent Review

Date: `2026-07-11`

Scope: the eight Phase 0.5A.1 OpenSpec changes only. Runtime implementation, public support claims, and published artifact validation remain out of scope.

Frozen contract id: `phase-0.5a.1-freeze-2026-07-11`

> Post-review implementation update, `2026-07-16`: S1-S8 implementation and acceptance gates are complete, including exact published npm/ClawHub live-host acceptance and one independently validated real OpenClaw matched three-arm pilot. S8 treatment delivered the seeded node, forced holdout preserved the inject decision with zero delivery, no-EE contained no ExperienceEngine runtime evidence, and deterministic scorecard recomputation matched. The sealed publication plan requires five complete repetitions per scenario; the accepted pilot has one and therefore remains `not_publishable`. The review conclusions below remain the historical approval record for the slicing plan and do not authorize public efficacy/support claims.

## Review Standard

The review checks whether each change is independently reviewable and implementable while preserving the frozen writer, fencing, retry, activation, provenance, distribution, and benchmark invariants.

Formatting validity alone is insufficient. A change must identify its exact normative source, own one coherent authority boundary, encode imported mechanical tables and policy values, remain fail-closed before later dependencies, and define executable acceptance gates.

## Initial Conclusion

```text
Initial conclusion: not approved
Architecture reopening: not required
Runtime implementation: prohibited pending corrections
```

The dependency order and high-level safety direction were correct, but the initial artifacts had nine implementation-contract gaps.

| Gap | Why it blocked approval | Correction |
| --- | --- | --- |
| Normative imports were implicit | Several specs referred to “the frozen contract” without identifying the exact sections or requiring exhaustive local encoding. An implementation could pass high-level tests while omitting frozen fields, states, or policies. | Added one frozen contract id, per-slice normative source matrix, conflict rule, and mandatory mechanical-encoding rule. |
| Integrity-key/control-bootstrap ownership created a reverse dependency | S1 required an HMAC home fingerprint and `runtime_control_meta`, but the initial slicing placed key creation in S4 and left fixed empty-home control-plane bootstrap ambiguous. S1 therefore could not complete before S4. | Moved create-once integrity-key authority and fixed versioned control-plane bootstrap to S1. S2 owns every schema change after bootstrap; S4 only consumes the committed key id/HMAC domains. |
| Fixed bootstrap DDL was not physically complete | Listing control-plane table names without importing their initial columns/constraints would force S3–S6 to add missing authority fields opportunistically before migration ownership. | S1 now imports the complete initial physical table shapes and constraints from the frozen authority sections for bootstrap DDL only; later slices own repositories and behavior, while all post-bootstrap DDL remains S2-owned. |
| S3/S6 authorization ownership was ambiguous | S3 owned launch-authorization primitives while S6 owned package activation and issuance semantics, but no rule prohibited an unrestricted S3 issuer. | S3 now owns generic consume/attempt/lease primitives only; authorization insertion requires an S6 package-authority mutation decision from either a named gateway-whitelist operation or an exact supervisor-owned activation/control transition. Before S6, runtime issuance remains unavailable. |
| S4 route writer was underspecified | “Current writer” did not freeze the package-local supervisor as sole runtime-route projection writer. | Added supervisor-only writer, fenced worker observation, plugin read-only, atomic replacement, and environment precedence ownership. |
| S5 queue mechanics were summarized rather than imported | The initial change did not mechanically require the full failure-code mapping, entity states, transition/counter table, resume semantics, or protected-write operation matrix. | Added normative import of Sections 4.9–4.11 and 8.1–8.6 plus exact local schemas/tables/tests. |
| S6 activation mechanics were summarized rather than exhaustive | The initial change named an exhaustive state machine and whitelist without requiring the exact states, operation names, blocked-boundary exits, writer modes, handshake transitions, or readiness predicate. | Added exact named whitelist/state/boundary/writer/handshake/readiness requirements and exhaustive-table tests. |
| S7/S8 evidence contracts lacked exact schemas | Distribution and benchmark changes did not require all frozen manifest, attestation, three-arm, attempt, disposition, replacement, and scorecard fields. | Added exact normative imports and mechanical evidence-schema/uniqueness/publication tests. |
| Existing specs were not superseded explicitly | New capabilities could archive successfully while the current distillation, OpenClaw, CLI, installer, intervention, learning-quality, and scenario specs retained conflicting or incomplete behavior. | Added existing-capability delta specs and an explicit supersession map; the generic distillation retry requirement is directly replaced. |

## Final Review Result

The corrections preserve the approved architecture and do not introduce runtime behavior. They make the frozen source sections normative inputs to each slice, close cross-slice writer ambiguity, and require exhaustive implementation fixtures and tests.

The final review confirmed all of the following after strict and mechanical validation:

1. S1–S5 remain production fail-closed.
2. S1 creates/adopts the integrity key before fixed control-plane bootstrap and S4 cannot create or rotate another key.
3. S1 fixed bootstrap DDL contains the complete frozen initial authority table shapes; S2 owns every later DDL.
4. S3 cannot issue package authority outside an S6 package-authority mutation decision.
5. S4 has one runtime-route projection writer: the current package-local supervisor.
6. S5 consumes only the S6 canonical production-write predicate.
7. S6 contains the exact gateway whitelist, activation states, blocked exits, handshake transitions, and current/historical revision separation.
8. Explicit existing-capability deltas remove conflicting retry/fallback/delivery/support/evaluation behavior.
9. S7 validates actual downloaded npm and ClawHub artifacts independently.
10. S8 uses treatment, forced holdout, and no-EE arms with one formal attempt per block/arm and immutable replacement history.
11. Benchmark or validation evidence cannot become runtime writer authority or override `custom-shadow-only-v1`.

## Validation Record

- All eight change-local strict validations passed.
- Repository-wide strict validation passed for all 53 active OpenSpec changes.
- Existing-capability delta specs validated, including the direct modification of the generic distillation retry requirement.
- Mechanical review covered 43 related files and 7851 lines.
- Code fences are complete; placeholder markers, Windows absolute paths, and trailing whitespace are zero.
- Every implementation task remains unchecked.
- Git scope contains no runtime source, test, script, package metadata, plugin, or hook changes from this review.
- `git diff --check` passed; the pre-existing LF-to-CRLF warning for `docs/product-ux-improvement-checklist.md` remains non-failing.

## Approval

```text
Final conclusion: approved
OpenSpec slicing: approved
Architecture reopening: not required
First permitted runtime slice: S1 establish-runtime-package-home-identity
Runtime implementation completed: no
Published support validated: no
```

This historical review authorized implementation to begin with S1. Current implementation status is recorded in the post-review update above: S1-S8 implementation gates are complete. The S8 benchmark machinery and real pilot are validated, but the pilot did not meet the sealed repetition threshold and must not be described as publishable efficacy evidence or as enabling support.
