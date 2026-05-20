## Context

ExperienceEngine already has separate concepts for retrieval policy, delivery-state governance, intervention strength, attribution records, repo policy, and inspection surfaces. The new product direction connects these pieces into a governed portable experience model:

- semantic retrieval must work in strict offline environments;
- embedding-space changes must not cause invalid cosine comparisons;
- repo-local experience should transfer across compatible repositories only through explicit compatibility evidence;
- automatic attribution should use causal evidence, including tool trajectories, before mutating lifecycle trust;
- quarantined guidance should have a conservative recovery path when evidence suggests it was misclassified.

This is a cross-cutting change. It touches configuration, packaging, vector metadata, SQLite migrations, retrieval, intervention decisions, runtime finalization, attribution records, lifecycle governance, and CLI/MCP inspection.

## Goals / Non-Goals

**Goals:**

- Provide an explicit strict offline embedding profile with verifiable model assets and remote-fetch blocking.
- Detect embedding-space changes and migrate node vectors from stored `retrieval_text` without mixing incompatible spaces.
- Persist compatibility fingerprints and use them to govern cross-repo portability.
- Penalize SemVer major-version divergence in portability scoring.
- Keep cross-repo delivery progressive: record-only, then conservative, then validated portable delivery.
- Add trajectory alignment between structured guidance and tool event timelines.
- Preserve neutral/unknown attribution when causality is not proven.
- Add quarantine leases and shadow-probe release governance.
- Surface all new readiness, migration, portability, trajectory, and release diagnostics through inspection.

**Non-Goals:**

- Public marketplace or remote sharing of experience assets.
- Direct eligible delivery for arbitrary cross-repo matches based on tech-stack similarity alone.
- Requiring model-backed online causality judgment.
- Removing legacy lexical/hash retrieval fallback.
- Changing manual helped/harmed override semantics.
- Automatically deleting old vectors or historical harm evidence during migration or quarantine release.

## Decisions

### 1. Model offline retrieval as profiles, not as a single default package shape

ExperienceEngine will distinguish at least:

- `standard`: normal install behavior with API embeddings or graceful fallback.
- `local-download`: local provider can use a managed cache and may download assets when allowed.
- `strict-offline`: model assets must already be staged or bundled, remote fetch is disabled, checksums are validated, and missing/corrupt assets fail loudly.

Alternative considered: always bundle a model in the main npm package. That makes offline behavior simple but bloats every install, complicates licensing/release validation, and makes model choice too rigid. A profile model keeps offline support first-class while preserving standard install practicality.

### 2. Represent model assets with an explicit manifest

Strict offline profile will use a manifest that records:

- provider/runtime id;
- model id;
- embedding dimensions;
- preprocessing/version id;
- asset paths;
- checksums;
- license/source metadata;
- manifest version.

The manifest id becomes part of embedding-space metadata. This prevents two models with the same display name but different assets from being treated as compatible.

Offline assets should be importable as an operator-managed asset pack. A pack import command should validate checksums before registration, write a local manifest registry, and avoid network access. This lets air-gapped machines stage model assets through a controlled artifact instead of relying on post-install downloads.

### 3. Never compare vectors across incompatible embedding spaces

Retrieval must compare vectors only when provider, model, version/preprocessing, dimensions, and manifest identity match. If a node vector is missing or incompatible with the active space, retrieval can use lexical/fallback evidence but must not use invalid cosine similarity.

Alternative considered: allow a low-confidence comparison across spaces. This is rejected because the numerical result is meaningless and can silently corrupt retrieval ordering.

### 4. Make vector migration resumable and inspectable

When the active embedding space changes, ExperienceEngine will mark affected nodes as migration-pending and re-encode from `retrieval_text`. Migration should be chunked, resumable, and recorded with status and error details. Old vectors should remain until the replacement succeeds or until a later cleanup policy removes them.

Migration can be triggered by `ee init`, `ee doctor`, explicit maintenance commands, or runtime readiness checks. Background migration should be bounded and should not block normal legacy/lexical fallback.

Migration writes must be coordinated with normal runtime database access. The implementation should use an explicit migration lock or equivalent single-writer guard, small batches, bounded retry/backoff for SQLite busy states, and configurable throttle gaps between chunks. Pending nodes must be excluded from vector scoring with an explicit diagnostic; they should not receive an arbitrary cosine score that could be confused with real distance or similarity.

### 5. Store structured compatibility fingerprints

Portability decisions will use structured fingerprints rather than a single text hash. The fingerprint should include language, package manager, lockfile family, framework, ORM, test/build tools, host/runtime adapter, config markers, and dependency major versions where available.

The hash is useful for equality and caching. The structured fields are necessary for explainability and policy scoring.

Monorepos require a scoped fingerprint. The extractor should identify both workspace root and project/package scope, combine package-local signals with root lockfile-resolved versions, and persist a stable `project_root_scope_id` or equivalent scope key. Without this, sibling packages in the same workspace can be over-merged or compared against the wrong dependency graph.

### 6. Use SemVer major-version compatibility as a scoring component

Lockfile-resolved versions are preferred over package.json ranges. If only a range exists, the extractor may infer a major version. Unknown versions reduce certainty but should not be treated as a hard mismatch. Framework/ORM/runtime major mismatches carry more penalty than test/build tooling mismatches.

### 7. Use portability bands instead of direct cross-repo promotion

Cross-repo candidates move through bands:

- incompatible;
- weakly related;
- same family;
- validated portable.

Tech-stack similarity can move a candidate toward same-family conservative delivery, but direct eligible delivery requires validated portable evidence and low-risk guidance. Destructive, credential, migration, infrastructure, and repo-local product/style guidance remain conservative or skipped.

### 8. Treat trajectory matching as causality evidence, not as a standalone verdict

`recommended_steps`, `avoid_steps`, success signals, stop conditions, and escalation conditions can be compiled into trajectory expectations. Runtime tool events are normalized into a timeline. The matcher returns adoption evidence such as `adoption_detected`, `non_adoption_detected`, `contra_adoption_detected`, `guidance_caused_failure`, `guidance_prevented_failure`, or `trajectory_unknown`.

Violating `avoid_steps` does not automatically mean the guidance was harmful. It usually means the guidance was not adopted. Harm requires a causal chain between guidance, adopted path, and relevant failure.

Command matching must operate on normalized command intent rather than literal shell text. The normalizer should canonicalize executable aliases, subcommands, argument patterns, touched artifact families, and failure signatures while redacting volatile tokens such as branch names, temporary paths, UUIDs, ports, and generated filenames.

### 9. Keep attribution append-only and governance explicit

Attribution records should store verdict, confidence, reason, trajectory verdict, evidence references, and whether lifecycle mutation was applied. Attribution writes alone should not silently mutate helped/harmed counters. Lifecycle governance decides when a verdict changes counters, delivery state, quarantine, release, or retirement.

### 10. Add quarantine leases and shadow probes without erasing history

Quarantined nodes can receive a lease. When the lease expires, the node can enter `shadow_probe` or an equivalent delivery-state/probe marker. Positive evidence restores only conservative delivery. Eligible delivery requires later validated reuse. Historical helped/harmed counts, quarantine reason, attribution records, and release attempts are preserved.

Shadow probes are not injected, so their release evidence cannot depend on the agent adopting hidden `recommended_steps`. Probe evidence should be based on no-harm safety observations: the node matched a task/failure domain, was withheld from prompt delivery, and the finalized task did not reproduce the guidance's historical harm pattern. After a bounded number of such no-harm observations, governance may restore conservative delivery; any similar harm pattern during the probe keeps or retires the node according to policy.

## Data Model Sketch

The implementation can choose exact storage layout, but it must represent these concepts:

- Embedding profile/space: provider, model, runtime/preprocessing version, dimensions, manifest id.
- Embedding migration: status, target space, started/completed timestamps, last error, chunk cursor or equivalent progress.
- Compatibility fingerprint: schema version, project root/scope id, structured fingerprint JSON, hash, dependency major versions, collected timestamp.
- Offline asset registry: imported pack id, manifest id, asset paths, checksum validation state, source metadata, imported timestamp.
- Migration runtime state: lock owner or run id, target embedding space, chunk cursor, batch counts, throttle settings, started/completed timestamps, last error.
- Portability evidence: source node/scope, target compatibility class, portability band, validation counts, last validation timestamp, blocked/risk reasons.
- Trajectory attribution: compiled expectation id/version, trajectory verdict, matched steps, violated steps, confidence, evidence refs.
- Quarantine release: lease expiry, original state, release attempts, last release time, release reason, probe state.

## Migration Plan

1. Add schemas and repositories behind feature-neutral defaults.
2. Add inspection and doctor surfaces before enabling behavior changes.
3. Add embedding-space detection and migration status without running automatic migration by default in tests.
4. Add strict offline profile loading and readiness checks.
5. Add fingerprint extraction and scorecard diagnostics without changing delivery.
6. Enable conservative cross-repo delivery only after tests cover skip/conservative/eligible boundaries.
7. Add trajectory attribution records while preserving existing neutral/unknown behavior.
8. Add quarantine lease/probe behavior after lifecycle tests cover preservation of history.

Rollback strategy:

- Standard mode can disable strict offline profile and fall back to existing API/legacy retrieval.
- Incomplete vector migration leaves nodes in fallback retrieval; it must not corrupt old vectors.
- Cross-repo portability can be disabled by config or policy gate to revert to same-scope behavior.
- Trajectory attribution can be inspect-only until governance mutation is enabled.
- Quarantine release can be disabled by policy to keep existing quarantined behavior.

## Risks / Trade-offs

- [Risk] Offline model assets increase release complexity and may conflict with package size expectations. → Mitigation: use explicit offline profile/asset pack and validate pack artifacts.
- [Risk] Automatic vector migration could consume CPU, collide with SQLite writes, or fail mid-run. → Mitigation: chunked resumable migration, explicit status, migration lock, busy backoff, configurable throttle, and lexical fallback during pending state.
- [Risk] SemVer data from package.json ranges may be inaccurate. → Mitigation: prefer lockfiles and treat inferred/unknown versions as confidence reducers rather than hard truth.
- [Risk] Cross-repo reuse may inject repo-local or destructive guidance. → Mitigation: portability bands, risk classifiers, negative evidence, and conservative-first delivery.
- [Risk] Tool trajectory matching can overfit command text. → Mitigation: normalize command families and artifacts, and treat trajectory as one causal signal rather than the entire verdict.
- [Risk] Quarantine release can revive harmful guidance. → Mitigation: shadow probe first, preserve history, conservative restoration only, and retire on repeated strong causal harm.

## Open Questions

- Should strict offline model assets be distributed as a separate npm package, a release tarball, or a CLI-imported local asset directory?
- What is the default multilingual offline profile for mixed Chinese/English engineering text?
- Should vector migration be automatic by default or require operator confirmation for large stores, and what default throttle is acceptable for IDE-hosted sessions?
- Should multiple embedding spaces be retained in parallel or should ExperienceEngine keep only the active space plus temporary rollback metadata?
- What evidence threshold defines `validated_portable` for a compatibility class?
- Should regulated scopes be able to disable automatic quarantine release entirely?
