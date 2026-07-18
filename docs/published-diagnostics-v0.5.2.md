# Published Diagnostics Acceptance — npm v0.5.2

Date: `2026-07-18`

Status: accepted exact published-package diagnostics flow; no telemetry or automatic upload

## Artifact Identity

- Channel: npm
- Package: `@alan512/experienceengine@0.5.2`
- Exact public reverse-download filename: `alan512-experienceengine-0.5.2.tgz`
- Size: `1245199` bytes
- SHA-256: `6fe2cc3e69adda56186bafb0b0bd6565cb3b605f89334597d5402dbef745e9b1`
- npm integrity: `sha512-N4t13rmRX9eR5rJY70VnYnB1ioqZ8ATsw4So/IeftlwoU0ysyxGfry/9POic5U1YBRLnT/yzQgyzHqltXY4SvQ==`

The artifact was installed from the independently downloaded exact archive into an isolated dependency tree with lifecycle scripts, global `NODE_PATH`, audit, funding, and package-lock mutation disabled.

## Accepted Flow

The installed package's own `dist/cli/index.js` passed the following native Windows clean-home sequence:

1. `ee diagnose`
   - produced the local-only summary;
   - did not create an ExperienceEngine home, machine key, database, runtime authority, or queue state;
   - retained the explicit no-upload boundary.
2. `ee diagnose --prepare-bundle --output-dir <isolated-root>`
   - created exactly one real review directory;
   - created exactly one regular file, `manifest.json`;
   - did not create the configured product home.
3. Independent manifest inspection
   - verified package identity `0.5.2` and all v1 contract identifiers;
   - verified every privacy inclusion flag remained `false`;
   - verified exact model id remained absent without consent;
   - verified temporary paths, artifact paths, and a credential marker were absent.
4. `ee diagnose --archive <review-directory>`
   - created two byte-identical deterministic archives from the same reviewed manifest;
   - each archive contained exactly `manifest.json`;
   - extracted manifest bytes exactly matched the reviewed file;
   - retained the explicit no-upload/no-submission boundary.
5. Negative acceptance
   - an existing archive output was rejected without changing its bytes;
   - an extra review-directory file was rejected without creating an archive.

## Evidence

- Reviewed manifest SHA-256: `9ef3dc799fb8788e6dc9ffa81b3b0090fb0e7575e011c732c7f8ca7408355377`
- Deterministic archive SHA-256: `65f616b7986e87a46cbf1b443619ec935470d64ccf82632f2b0d9c109e8f4d74`
- Archive size: `1043` bytes
- Acceptance validation digest: `7fb2a7937e82796d243aaaf0f2e43fb44b2ce463454a9072f627cecc5267c0b9`

The accepted non-sensitive machine-readable evidence is retained under ignored release evidence as `published-diagnostics-0.5.2-acceptance-v2.json`. The first run is superseded because submission review found a fail-closed defect in the negative-command expectation helper; the actual first-run negative commands failed, but only the corrected v2 harness is accepted.

## Cleanup And Claim Boundary

The isolated installation, user home, product home target, review directory, extracted archive, and archive outputs were removed after validation. No command output, credential value, absolute path, or raw manifest was retained in the durable repository record.

This closes Phase 0.5B exact published-package Task 3.3 for npm `0.5.2`. It does not validate the incomplete public ClawHub `0.5.2` artifact, establish general host support, or establish production-learning readiness:

```text
support_claim_allowed=false
production_learning_ready=false
```

## Repository Closeout

- Focused diagnostics gate: `4` test files / `18` tests passed.
- Full repository gate: `244` test files / `1517` tests passed.
- TypeScript and production build passed.
- D1, D2, and D3 strict OpenSpec validation passed.
- Runtime closure remained `2e91d1bf40d8d1773293a3ac81609469540239a7fdd5367e3945210628d6e54f` with build id `build_4ea8534110c00159af76428d07ba2c4e2b5c5b85599382aa50069ac263cbc2a7`.
- OpenClaw production binding and final diff checks passed with readiness flags unchanged.
