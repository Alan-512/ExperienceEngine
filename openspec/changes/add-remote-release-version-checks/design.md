## Context

The current product can only compare install-state against the version of the locally running `ee` package. That is enough once the local package has already changed, but it does not help a user who is still on an older installation and wants to know whether a new product version exists upstream.

This repository is currently distributed through GitHub, so the most reliable phase-two source is the latest GitHub Release for the repository. GitHub documents a dedicated latest-release REST endpoint, which is enough for a lightweight doctor check.

## Goals / Non-Goals

**Goals:**
- Resolve the repository's GitHub owner/name from package metadata.
- Query the latest GitHub Release version from the official GitHub API.
- Surface remote release status in `ee doctor` without changing host-specific install/upgrade flows.
- Keep doctor fast and resilient under offline or rate-limited conditions.

**Non-Goals:**
- Download or install package updates automatically.
- Support non-GitHub release sources in this change.
- Add auth/token management for private release sources.
- Replace the existing local version drift logic.

## Decisions

### GitHub Releases is the only remote source in Phase 2

The remote version checker will only support repositories that resolve to a GitHub owner/repo pair.

Rationale:
- This matches the current product distribution path.
- It avoids inventing a generic update-source abstraction before a second real source exists.

### Doctor remains usable without network success

Remote version lookup will:
- use a short timeout
- catch fetch and parsing failures
- return a structured `unavailable` state instead of throwing

Rationale:
- `ee doctor` is still a local troubleshooting command and should not fail hard when offline.

### Doctor separates package updates from host rewiring

If the remote latest version is newer than the current local package version, doctor will recommend updating the local ExperienceEngine package first. Only after that should users run `ee upgrade <agent>` to refresh host wiring.

Rationale:
- This keeps the package lifecycle and host wiring lifecycle distinct.
- It avoids implying that `ee upgrade <agent>` can fetch product code by itself.

## Risks / Trade-offs

- [GitHub API rate limits or temporary outages may hide updates] → degrade to an unavailable remote status and keep local diagnostics usable.
- [Repositories without GitHub metadata cannot use the remote check] → report remote source as unconfigured/unavailable.
- [Doctor becomes slower] → bound the remote check with a small timeout and only fetch one latest-release endpoint.

## Implementation Plan

1. Add repository metadata and a GitHub release resolver under `src/version`.
2. Extend doctor to fetch remote release status and print remote-update guidance.
3. Add tests for repository parsing, release response normalization, and doctor behavior.

## Open Questions

- Should a later phase cache remote release results to avoid hitting the API on every doctor run?
- Should a later product build support authenticated release checks for private repositories or enterprise GitHub?
