# ExperienceEngine — Unreleased

## OpenClaw runtime closure remediation

- Made the embedded runtime closure manifest the sole production-runtime packaging authority.
- Removed publication validators and download tooling from the OpenClaw production closure unless imported by a production entrypoint.
- Added staging and final-tarball closure validation plus undeclared relative-import rejection.
- Added immutable HMAC-signed install attestations with explicit `local_pack`, `host_native_unattested`, `published_npm_attested`, and `published_clawhub_attested` origins.
- Made OpenClaw install, repair, update, interrupted update, and rollback transactional.
- Replaced implicit unsafe installation with an explicit approval flow and stable normalized security-scan digests.
- Split installed-artifact smoke from real OpenClaw live-host evidence.
- Added a real-host runner covering exact plugin installation, isolated Gateway authentication, plugin service registration, a real agent turn, protected queue completion, stale-output rejection, Gateway restart recovery, and terminal shutdown evidence.
- Cold package activation no longer initializes implicitly during Gateway service start. The real-host gate now executes the authorized prepare and initialize plugin commands through OpenClaw's user-message command path, proves preparation is read-only, uses the exact returned revisions and ids, and verifies idempotent replay.
- Added bounded Windows OpenClaw `.exe`/`.cmd`/`.bat` resolution and safe batch-shim invocation.
- Added native Windows direct Gateway health/command transport and an stdin-to-`SIGINT` lifecycle bridge so foreground OpenClaw Gateway shutdown reaches plugin-service drain and terminal authority evidence instead of Windows force termination.
- Added read-only exact-revision activation preparation, persisted runtime-health evidence, stable first-line lifecycle error codes, and strict `ee verify openclaw-production` semantics.
- Separated `artifact_runtime_validated` from `support_claim_allowed`.
- Corrected README and user-guide wording so plugin load and routine interaction are not presented as full production-learning readiness.

## Validation status

- Source/runtime closure: passed.
- Local package production activation and fenced semantic queue: passed.
- Local-pack real OpenClaw `2026.4.1` host preflight: passed independently on Linux x64 under WSL and native Windows x64 with explicit host-security approval.
- Published npm `0.4.8`: correctly rejected at closure step 1 because the old artifact lacks the embedded manifest.
- Published ClawHub `0.4.8`: correctly rejected independently at closure step 1.
- New npm/ClawHub publication and the separate quality/benchmark publication gate remain pending. Native Windows local-pack live-host validation is complete but does not satisfy either published channel.

See `docs/openclaw-runtime-support-matrix.md` for the exact evidence boundaries.
