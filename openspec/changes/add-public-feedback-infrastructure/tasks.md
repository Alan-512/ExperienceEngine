## 1. Public Repository Surfaces

- [x] 1.1 Add installation problem issue template.
- [x] 1.2 Add runtime bug issue template.
- [x] 1.3 Add harmful intervention issue template.
- [x] 1.4 Add feature request issue template.
- [x] 1.5 Add root `CONTRIBUTING.md` and `SECURITY.md`.

## 2. Public Documentation

- [x] 2.1 Update README and Chinese README with the review-first diagnostic flow.
- [x] 2.2 Update user guide and CLI help without implying automatic upload.
- [x] 2.3 Document default exclusions, model-id opt-in, and security-report boundary.

## 3. Acceptance

- [x] 3.1 Run a real operator prepare/review/archive fixture.
- [x] 3.2 Validate an installed local-pack artifact.
- [ ] 3.3 Validate the exact published channel before claiming support.
- [x] 3.4 Run full repository, strict OpenSpec, package closure, and documentation consistency gates.

## Current Evidence Boundary

- Public repository assets and English/Chinese/user-guide workflows are implemented and statically checked.
- Source and clean local-pack diagnose/prepare/archive flows passed through D1-D2.
- No remote telemetry, upload, or automatic issue submission exists.
- Exact published-package validation remains open because published `0.5.1` is immutable and does not contain these unreleased changes.
- Until a future version is published and its exact artifact passes, Phase 0.5B must be described as source/local-pack accepted rather than published supported.

## Source And Local-Pack Acceptance Evidence

- All five GitHub issue-form YAML files parsed successfully. Static asset tests require reviewed diagnostic evidence, explicit privacy confirmation, optional diagnostics for feature requests, and private security reporting.
- Focused D3/D2/D1 tests passed `5` files / `25` tests before full validation.
- Full repository validation passed `237` test files / `1475` tests, TypeScript, and production build.
- Runtime closure validation passed with digest `1d3ef09ef3c718b3d7b331d02142c3630dce71421d693867d79e0eb841f2db16` and build id `build_76a218de89e46fb2473195b12b9ff1b335688b3f7dbc3ff350d7cb5495403c30`.
- OpenClaw package-local production binding passed unchanged and continued to report `production_learning_ready=false`.
- Adding the CLI-only archive dependency exposed reduced OpenClaw package identity drift. The installer now regenerates the reduced stage's own profile registry and closure after dependency pruning; the OpenClaw packaged-runtime test passed `19/19` while keeping `tar` out of the reduced plugin bundle.
- D1, D2, and D3 strict OpenSpec validation and `git diff --check` passed.
- README, Chinese README, user guide, release notes, historical v3/v4 evidence wording, issue templates, contribution guidance, and security policy are aligned.
- Exact published-package acceptance remains the only open D3 task and requires a future immutable published artifact.
