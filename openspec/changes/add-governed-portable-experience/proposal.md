## Why

ExperienceEngine needs to move from repo-local memory toward a governed portable experience layer: useful offline, able to reuse validated experience across compatible repositories, and conservative enough to avoid punishing good guidance for unrelated failures.

The current product direction already separates retrieval, intervention governance, attribution, and inspection. This change connects those layers into a complete implementation plan for offline semantic retrieval profiles, vector migration, cross-repo portability scoring, trajectory-based causality, and quarantine release.

## What Changes

- Add strict offline embedding profiles with model asset manifests, checksum validation, remote-fetch blocking, and doctor-readable readiness states.
- Add automatic vector migration when the active embedding space changes, using stored `retrieval_text` to re-encode nodes without mixing incompatible vector spaces.
- Add structured project compatibility fingerprints for cross-repo reuse, including package manager, framework, ORM, test/build tools, lockfile family, host/runtime adapter, and SemVer major-version compatibility.
- Add portability bands that allow cross-repo guidance to progress from record-only diagnostics to conservative delivery and only later to validated portable delivery.
- Add trajectory-based attribution that compares `recommended_steps` / `avoid_steps` expectations against tool event timelines to detect adoption, non-adoption, and causal harm/help without relying on model self-reporting.
- Add quarantine lease and shadow-probe release governance so quarantined nodes can recover conservatively when evidence supports it without losing historical harm evidence.
- Extend inspect/doctor surfaces so operators can see offline readiness, migration state, portability reasons, trajectory attribution, and quarantine release status.
- No intentional breaking change to existing task recording, manual helped/harmed override semantics, or legacy fallback availability outside strict offline profiles.

## Capabilities

### New Capabilities

- `offline-embedding-profile`: Strict offline semantic retrieval profiles, model asset manifests, checksum validation, remote-fetch blocking, and vector migration.
- `experience-portability-governance`: Cross-repo compatibility fingerprints, SemVer major-version penalties, portability bands, and progressive portable reuse validation.
- `causal-trajectory-attribution`: Tool timeline alignment for adoption and causality verdicts derived from structured guidance expectations.
- `quarantine-release-governance`: Quarantine lease, shadow-probe release, conservative restoration, and repeated-harm retirement rules.

### Modified Capabilities

- `experience-retrieval-policy`: Retrieval must respect embedding-space compatibility and expose migration/portability diagnostics without letting retrieval similarity become governance authority.
- `experience-intervention-governance`: Intervention policy must allow only progressive, governed cross-repo delivery and must support shadow-probe handling for quarantine release.
- `experience-attribution-records`: Attribution records must carry causal trajectory evidence, preserve neutral/unknown outcomes, and avoid mutating helped/harmed counters without governance rules.
- `cli-user-experience-surface`: CLI/doctor/inspect surfaces must expose offline profile readiness, vector migration state, portability scorecards, trajectory attribution, and quarantine release status.

## Impact

- Code areas: embedding providers, vector metadata, SQLite schema/migrations, node repository, candidate retrieval, intervention controller, runtime finalization, attribution writing, lifecycle governance, task/tool timeline processing, CLI inspect/doctor commands, MCP/host summaries, tests.
- Data model: new or extended metadata for embedding profile manifests, embedding migration state, compatibility fingerprints, portability validation, trajectory attribution, quarantine lease/release attempts, and inspection diagnostics.
- Dependencies/assets: possible bundled or separately distributed offline model assets; strict profile must validate model checksums and must not fetch remote model files.
- Runtime behavior: standard mode can keep graceful fallback; strict offline mode must fail loudly on missing/corrupt assets; cross-repo delivery remains conservative until validated portable evidence exists.
- Validation: requires focused unit tests for vector migration, SemVer compatibility, portability bands, trajectory adoption/non-adoption, neutral/unknown attribution, quarantine release, plus integration tests through runtime finalization and inspection surfaces.
