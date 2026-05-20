## 1. Baseline And Data Model

- [x] 1.1 Add focused baseline tests proving current same-scope retrieval, cross-scope conservative behavior, neutral/unknown attribution, and quarantine delivery gates before changing behavior.
- [x] 1.2 Add domain types for embedding profile/space metadata, offline asset manifests, vector migration status, compatibility fingerprints, portability bands, trajectory verdicts, and quarantine release metadata.
- [x] 1.3 Add SQLite migrations for the new persisted fields or tables required by embedding migration, compatibility fingerprints, portability validation, trajectory attribution, and quarantine release.
- [x] 1.4 Update repositories to read/write the new metadata while preserving existing row compatibility and legacy defaults.
- [x] 1.5 Add migration/backfill tests for existing databases with old nodes, old embeddings, old attribution records, and old quarantined nodes.

## 2. Offline Embedding Profile

- [x] 2.1 Add configuration schema support for `standard`, `local-download`, and `strict-offline` embedding profile semantics without removing existing provider settings.
- [x] 2.2 Add an offline asset manifest type and loader that validates provider/runtime id, model id, dimensions, preprocessing/model version, asset paths, checksums, license/source metadata, and manifest version.
- [x] 2.3 Update the local embedding provider to support strict offline loading with remote model fetching disabled and explicit local asset resolution.
- [x] 2.4 Make strict offline profile fail loudly on missing or corrupt model assets instead of silently falling back unless fallback is explicitly allowed by profile/config.
- [x] 2.5 Add an offline asset pack import path that validates checksums, registers the imported manifest locally, and supports air-gapped staging without network access.
- [x] 2.6 Add an optional offline asset pack export or packaging validation path so release artifacts can be verified before distribution.
- [x] 2.7 Add unit tests for successful strict offline loading, missing manifest, checksum mismatch, remote-fetch disabled behavior, asset import failure, asset import success, and standard-mode graceful fallback.
- [x] 2.8 Add package/build validation for any bundled, exported, or staged offline asset layout chosen by the implementation.

## 3. Vector Migration

- [x] 3.1 Add embedding-space compatibility checks that compare provider, model, version/preprocessing, dimensions, and manifest identity before vector scoring.
- [x] 3.2 Update retrieval so incompatible or migration-pending node vectors are excluded from cosine scoring and remain eligible only through lexical/non-vector evidence.
- [x] 3.3 Implement migration discovery that marks or reports nodes whose stored embedding metadata does not match the active embedding space.
- [x] 3.4 Implement chunked vector re-encoding from stored `retrieval_text`, writing new embeddings and metadata only after successful encoding.
- [x] 3.5 Make vector migration resumable after partial failure with stored progress and latest error diagnostics.
- [x] 3.6 Add a migration lock or equivalent single-writer guard, SQLite busy retry/backoff, bounded batch sizes, and configurable throttle gaps between chunks.
- [x] 3.7 Ensure migration-pending vectors are explicitly excluded from cosine scoring with a diagnostic reason rather than scored as zero or any other placeholder value.
- [x] 3.8 Add unit tests for mismatch detection, pending migration exclusion from vector scoring, successful re-encode, failure recovery, lock contention, busy retry/backoff, throttled chunking, and no cross-space cosine comparisons.
- [x] 3.9 Add an operator-triggerable or doctor-triggerable path to start or report migration without mutating prompt text.

## 4. Compatibility Fingerprints

- [x] 4.1 Add a deterministic compatibility fingerprint extractor for repository scopes.
- [x] 4.2 Extract primary language, package manager, lockfile family, frameworks, database/ORM tools, test/build tools, host/runtime adapters, relevant config markers, and stable project markers.
- [x] 4.3 Prefer lockfile-resolved dependency versions over package manifest ranges when deriving SemVer major versions.
- [x] 4.4 Add monorepo-aware scope detection that records workspace root, package/project root, and a stable project root scope id.
- [x] 4.5 Combine package-local manifests with root lockfile-resolved versions when extracting dependency major versions for workspace packages.
- [x] 4.6 Handle missing manifests, missing lockfiles, workspace packages, aliased packages, and unknown versions without failing extraction.
- [x] 4.7 Persist schema-versioned structured fingerprint data and a stable fingerprint hash.
- [x] 4.8 Add tests for npm/pnpm/yarn lockfile inputs, missing lockfiles, major-version extraction, unknown versions, deterministic hash generation, and monorepo package/root lockfile resolution.

## 5. Portability Scoring And Bands

- [x] 5.1 Implement portability scoring that combines scope, task family, fingerprint compatibility, artifact/path compatibility, failure signature compatibility, guidance risk, SemVer major-version compatibility, and prior portable reuse evidence.
- [x] 5.2 Apply dependency-category-specific SemVer major-version penalties, with stronger penalties for framework/ORM/runtime adapter mismatches than for test/build tooling.
- [x] 5.3 Classify cross-repo candidates into `incompatible`, `weakly_related`, `same_family`, and `validated_portable` portability bands.
- [x] 5.4 Include portability band, compatibility reasons, SemVer penalties, and negative evidence in candidate diagnostics.
- [x] 5.5 Add tests proving high package-name overlap with major-version mismatch is downgraded, unknown versions reduce confidence but do not hard-fail, and destructive/repo-local guidance is incompatible.

## 6. Cross-Repo Intervention Governance

- [x] 6.1 Update retrieval/intervention integration so cross-repo candidates use portability scorecards instead of raw scope similarity alone.
- [x] 6.2 Allow same-family cross-repo candidates to be delivered only as conservative guidance when risk and negative-evidence gates pass.
- [x] 6.3 Keep weakly related cross-repo candidates record-only and incompatible candidates skipped.
- [x] 6.4 Add validated portable evidence tracking per node and compatibility class after bounded successful conservative reuse without causal harm.
- [x] 6.5 Permit stronger delivery for validated portable guidance only when ordinary delivery state, risk class, confidence, repo policy, and intervention governance allow it.
- [x] 6.6 Add regression tests proving tech-stack similarity alone never unlocks direct eligible delivery.
- [x] 6.7 Add integration tests for record-only, conservative cross-repo, validated portable, SemVer-downgraded, and destructive-guidance cases.

## 7. Trajectory Expectation Compilation

- [x] 7.1 Define a trajectory expectation representation for `recommended_steps`, `avoid_steps`, `success_signal`, `stop_condition`, and `escalation_condition`.
- [x] 7.2 Implement normalization for tool names, executable aliases, subcommands, command families, normalized arguments, touched artifact/module families, exit status, relative order, retry patterns, and failure signatures.
- [x] 7.3 Redact volatile command tokens such as branch names, temp paths, UUIDs, ports, generated filenames, and absolute local paths before matching trajectory expectations.
- [x] 7.4 Compile recommended steps into positive adoption expectations and avoid steps into non-adoption/contra-adoption expectations.
- [x] 7.5 Ensure raw prose remains optional fallback evidence and does not become the only trajectory matching mechanism.
- [x] 7.6 Add tests for ordered recommended-step matches, partial-order matches, avoid-step violations, mixed unordered file touches with ordered compile commands, insufficient tool events, unsupported tool formats, and volatile-token normalization.

## 8. Causal Trajectory Attribution

- [x] 8.1 Compare compiled trajectory expectations against finalized task tool event timelines during attribution.
- [x] 8.2 Produce trajectory verdicts such as `adoption_detected`, `non_adoption_detected`, `contra_adoption_detected`, `guidance_caused_failure`, `guidance_prevented_failure`, and `trajectory_unknown`.
- [x] 8.3 Persist trajectory verdict, matched expectations, violated expectations, tool event evidence refs, confidence, and attribution reason on attribution records or linked evidence.
- [x] 8.4 Use trajectory evidence as one bounded signal for helped/harmed attribution rather than replacing existing outcome/failure classifiers.
- [x] 8.5 Preserve neutral or unknown attribution for unrelated failures, missing error output, non-adoption, and insufficient trajectory evidence.
- [x] 8.6 Ensure avoid-step violation defaults to non-adoption and does not automatically mark guidance harmed.
- [x] 8.7 Add tests for adopted-success helped evidence, adopted-relevant-failure harmed evidence, avoid-step non-adoption, unrelated failure neutral evidence, and manual override preservation.

## 9. Quarantine Lease And Release Governance

- [x] 9.1 Add lifecycle fields/repository support for quarantine lease expiry, original state before quarantine, release attempt count, last release timestamp, and release reason.
- [x] 9.2 Assign quarantine lease metadata when governance quarantines nodes for causal harm or repeated weak harm.
- [x] 9.3 Keep active quarantine behavior unchanged before lease expiry.
- [x] 9.4 Implement lease-expired shadow-probe transition gated by scope/repo policy.
- [x] 9.5 Ensure shadow-probe nodes can be evaluated diagnostically but are not injected as normal prompt guidance.
- [x] 9.6 Evaluate shadow-probe release using no-harm safety observations, not adoption of hidden recommended steps.
- [x] 9.7 Require the probe candidate to match the task/failure domain and for the finalized task to avoid reproducing the node's historical harm pattern before counting a no-harm pass.
- [x] 9.8 Restore positive shadow-probe nodes only to conservative delivery after bounded no-harm passes or explicit policy-approved override, preserving historical helped/harmed counts and quarantine history.
- [x] 9.9 Retire or requarantine nodes that receive similar causal harm during probe or after conservative restoration.
- [x] 9.10 Add tests for lease creation, lease-not-expired behavior, shadow-probe transition, withheld prompt delivery, no-harm pass accumulation, conservative restoration, no direct eligible restoration, and repeated-harm retirement.

## 10. Inspection, Doctor, And Host Summaries

- [x] 10.1 Extend `ee doctor` or equivalent diagnostics to report embedding profile type, strict offline asset readiness, checksum state, remote-fetch policy, semantic retrieval readiness, and vector migration state.
- [x] 10.2 Add CLI diagnostics for offline asset import/export readiness, imported manifest registry state, and checksum validation failures.
- [x] 10.3 Extend verbose retrieval inspection to show embedding-space mismatch and migration-pending diagnostics.
- [x] 10.4 Extend latest/node inspection to show portability band, compatibility fingerprint summary, SemVer penalties, negative evidence, validation counts, and delivery decision.
- [x] 10.5 Extend attribution inspection to show trajectory verdict, matched/violated expectations, tool event refs, confidence, and final attribution verdict.
- [x] 10.6 Extend node/review inspection to show quarantine reason, lease expiry, release attempts, shadow-probe/restoration state, no-harm pass counts, and latest release evidence.
- [x] 10.7 Keep non-verbose output concise and source-compatible where existing specs require concise default output.
- [x] 10.8 Update Codex/OpenClaw/MCP summaries only where they already expose scorecard or attribution diagnostics, without dumping full raw timelines into prompts.

## 11. Documentation And Operator Guidance

- [x] 11.1 Update README, README.zh-CN, and docs/user-guide.md for offline profile semantics, strict offline behavior, vector migration, and legacy fallback boundaries.
- [x] 11.2 Document cross-repo portability bands, SemVer major-version penalties, and why tech-stack similarity does not directly unlock eligible delivery.
- [x] 11.3 Document causal trajectory attribution, including the rule that avoid-step violations default to non-adoption rather than guidance harm.
- [x] 11.4 Document quarantine lease and shadow-probe release behavior.
- [x] 11.5 Add release notes when implementation behavior changes operator workflows, install flows, or lifecycle governance.

## 12. Validation

- [x] 12.1 Run targeted unit tests for embedding profile, vector migration, compatibility fingerprinting, portability scoring, trajectory attribution, and quarantine release.
- [x] 12.2 Run runtime/integration tests covering prompt lookup, task finalization, attribution writes, cross-repo conservative delivery, and inspection output.
- [x] 12.3 Run OpenSpec validation for this change with strict mode.
- [x] 12.4 Run TypeScript typecheck.
- [x] 12.5 Run the full test suite.
- [x] 12.6 Run build and packaging validation, including any offline asset or dry-run pack path introduced by the implementation.
- [x] 12.7 If feasible, run one real or deterministic host validation path for Codex/OpenClaw to verify lifecycle writeback and inspection surfaces.
