## Context

The current product already has a unified `ee install <agent>` surface and per-host doctor output, but install-state only records wiring details such as paths and commands. There is no explicit version metadata and no upgrade command. As a result, once the package itself is updated, users cannot easily tell which adapters are stale or refresh them consistently.

This change only needs a local-package-aware upgrade model. It does not need a remote release registry, auto-update, or rollback yet.

## Goals / Non-Goals

**Goals:**
- Record the current package version in every adapter install-state.
- Detect version drift between install-state and the current package.
- Expose `ee upgrade <agent>` for the currently supported hosts.
- Keep host-specific post-upgrade guidance intact, for example OpenClaw restart hints.

**Non-Goals:**
- Query GitHub releases, npm, or any remote update service.
- Automatically upgrade every host in one command.
- Add backup, rollback, or migration snapshots.
- Change host-specific install mechanics.

## Decisions

### Version drift is measured against the current local package

Phase 1 compares:
- `recordedVersion`: the version stored in install-state when the adapter was last installed
- `currentVersion`: the version of the currently running `ee` package

If `currentVersion` is newer than `recordedVersion`, doctor reports that an upgrade is available.

Rationale:
- This works immediately with the current repository/package distribution model.
- It avoids coupling the first upgrade flow to a release service that does not exist yet.
- It covers the main operational case: package code was updated locally, but host wiring still reflects an older installation.

### Upgrade command reuses install flows

`ee upgrade <agent>` will delegate to the same host-specific install path used by `ee install <agent>`, then print upgrade-oriented output.

Rationale:
- Current install flows are already idempotent or update-aware.
- Reusing them keeps host behavior consistent and reduces drift between install and upgrade semantics.

### Shared version utility owns package version lookup and comparison

A small shared version module will:
- read the current package version from repository/package metadata
- compare versions conservatively
- produce a normalized version status object for doctors and upgrade output

Rationale:
- Avoids copying version parsing logic into each installer and doctor.
- Keeps the door open for adding remote latest-version sources later.

## Risks / Trade-offs

- [Local-only version drift does not detect new releases by itself] → Accept for Phase 1; add remote release discovery in a later productization phase.
- [Version comparison can be wrong if install-state lacks a version from older installs] → Treat missing recorded version as unknown and recommend reinstall/upgrade conservatively.
- [Users may expect `upgrade` to perform package download] → Make CLI output explicit that this command refreshes adapter wiring for the current local package version.

## Implementation Plan

1. Add a shared package-version utility and install-state version metadata.
2. Extend install inspection output for OpenClaw, Claude Code, and Codex with version status.
3. Extend `ee doctor` to display version drift per host.
4. Add `ee upgrade <agent>` and tests for the supported hosts.

## Open Questions

- Should a later remote release check use GitHub releases, npm dist-tags, or a product-owned manifest endpoint?
- When remote checks arrive, should `ee doctor` default to online lookup or keep it opt-in?
