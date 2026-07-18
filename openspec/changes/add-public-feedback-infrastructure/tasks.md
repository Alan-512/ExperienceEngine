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
- [x] 3.3 Validate the exact published channel before claiming support.
- [x] 3.4 Run full repository, strict OpenSpec, package closure, and documentation consistency gates.

## Current Evidence Boundary

- Public repository assets and English/Chinese/user-guide workflows are implemented and statically checked.
- Source and clean local-pack diagnose/prepare/archive flows passed through D1-D2.
- No remote telemetry, upload, or automatic issue submission exists.
- Exact published npm `0.5.2` diagnostics validation passed against independently downloaded immutable bytes.
- The public ClawHub `0.5.2` artifact is incomplete and fails closure, so this acceptance is explicitly npm-channel evidence rather than a cross-channel support claim.

## Source And Local-Pack Acceptance Evidence

- All five GitHub issue-form YAML files parsed successfully. Static asset tests require reviewed diagnostic evidence, explicit privacy confirmation, optional diagnostics for feature requests, and private security reporting.
- Focused D3/D2/D1 tests passed `5` files / `25` tests before full validation.
- Full repository validation passed `237` test files / `1475` tests, TypeScript, and production build.
- Runtime closure validation passed with digest `1d3ef09ef3c718b3d7b331d02142c3630dce71421d693867d79e0eb841f2db16` and build id `build_76a218de89e46fb2473195b12b9ff1b335688b3f7dbc3ff350d7cb5495403c30`.
- OpenClaw package-local production binding passed unchanged and continued to report `production_learning_ready=false`.
- Adding the CLI-only archive dependency exposed reduced OpenClaw package identity drift. The installer now regenerates the reduced stage's own profile registry and closure after dependency pruning; the OpenClaw packaged-runtime test passed `19/19` while keeping `tar` out of the reduced plugin bundle.
- D1, D2, and D3 strict OpenSpec validation and `git diff --check` passed.
- README, Chinese README, user guide, release notes, historical v3/v4 evidence wording, issue templates, contribution guidance, and security policy are aligned.
- Exact published npm `0.5.2` was installed into an isolated dependency tree and its installed CLI passed clean-home diagnose, exact one-file review preparation, deterministic archive creation, archive content equality, overwrite rejection, extra-file rejection, privacy scans, and no-upload assertions.
- Published artifact SHA-256 is `6fe2cc3e69adda56186bafb0b0bd6565cb3b605f89334597d5402dbef745e9b1`; corrected-v2 deterministic archive SHA-256 is `65f616b7986e87a46cbf1b443619ec935470d64ccf82632f2b0d9c109e8f4d74`; acceptance validation digest is `7fb2a7937e82796d243aaaf0f2e43fb44b2ce463454a9072f627cecc5267c0b9`.
- Submission review superseded the first evidence run after correcting the negative-command expectation helper so an unexpectedly successful rejection case fails the harness instead of being misclassified.
- Temporary install, home, review, extraction, and archive roots were removed after validation. `support_claim_allowed=false` and `production_learning_ready=false` remain unchanged.
- Durable evidence: `docs/published-diagnostics-v0.5.2.md`.
- Final focused gate passed `4` files / `18` tests; the combined full repository gate passed `244` files / `1517` tests, TypeScript, production build, D1-D3 strict OpenSpec, runtime closure, OpenClaw production binding, and diff checks.
- Runtime closure remained `2e91d1bf40d8d1773293a3ac81609469540239a7fdd5367e3945210628d6e54f` with build id `build_4ea8534110c00159af76428d07ba2c4e2b5c5b85599382aa50069ac263cbc2a7`.
