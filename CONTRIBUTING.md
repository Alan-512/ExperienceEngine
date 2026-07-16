# Contributing to ExperienceEngine

ExperienceEngine is a production-first experience governance layer for coding agents. Contributions should preserve its authority, privacy, host, and evidence boundaries rather than optimizing only for a passing fixture.

## Before changing code

1. Read `AGENTS.md` and `docs/development/architecture.md`.
2. Check current OpenSpec changes and existing implementation before adding a new subsystem.
3. Keep source, local-pack, and published-package validation claims separate.
4. Add or update tests and docs with semantic changes.

## Development checks

Use the repository package manager and run proportional focused tests while iterating. Before submission, run:

```bash
pnpm typecheck
pnpm test
pnpm build
```

For runtime/distribution changes, also run the relevant strict OpenSpec and runtime closure validation. Real host or installed-artifact validation is required before describing a host/distribution path as supported.

## Safe fixtures and bug reports

Tests, examples, and issues must use synthetic or sanitized data. Do not commit or attach:

- user SQLite databases, WAL, or SHM files
- settings, environment dumps, API keys, tokens, or credentials
- real prompts, task summaries, tool arguments/output, provider requests/responses, or trace payloads
- private source code, repository names, usernames, absolute paths, endpoint URLs, or deployment names
- unreviewed diagnostic archives or logs

For a bug report, prefer stable error codes and the local review workflow:

```bash
ee diagnose --prepare-bundle
# inspect manifest.json and remove optional fields if desired
ee diagnose --archive <review-directory>
```

No upload occurs automatically. Attach only the artifact you reviewed.

## Product invariants

- Do not make normal operation depend on manual scoring of every intervention.
- Do not describe ExperienceEngine as a separate chat participant.
- Do not bypass delivery-state, activation, fencing, queue, or migration authority.
- Do not silently downgrade provider-backed production learning into an equivalent rule-only mode.
- Do not add remote telemetry or automatic issue submission without a separately approved design.
- Do not claim `production_learning_ready` or broad efficacy from local/source-only evidence.

## Pull requests

Describe:

- the user/product problem
- the architecture boundary and reused components
- tests and validation evidence
- source/local-pack/published distinction
- remaining limitations or unsupported paths

Keep commits scoped and avoid including local planning notes, generated credentials, temporary runtimes, or `.tmp` evidence directories.
