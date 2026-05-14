## 1. Derived Metrics

- [x] 1.1 Add task-run repository reads needed for recent scope learning status and rejection reason aggregation.
- [x] 1.2 Add `ExperienceLearningQualityHealth` aggregation in the interaction service using existing task run, candidate, node, injection, and attribution data.
- [x] 1.3 Add reason grouping for expression-only, no-transferable-value, insufficient-evidence, generic-advice, gate-failure, and other rejection buckets.

## 2. CLI Surfaces

- [x] 2.1 Print compact learning-quality metrics in `ee status`.
- [x] 2.2 Print compact learning-quality metrics in `ee doctor <host>` for Codex, Claude Code, and OpenClaw.
- [x] 2.3 Keep output read-only and avoid adding a new command before operator surface consolidation.

## 3. Tests And Docs

- [x] 3.1 Add unit coverage for metric aggregation and reason grouping.
- [x] 3.2 Add status and doctor command output tests.
- [x] 3.3 Add a follow-up plan document for Quality Band productization and Operator / Advanced surface consolidation after the learning-quality release.
- [x] 3.4 Run targeted tests, `openspec validate --all --strict`, and `pnpm check`.
