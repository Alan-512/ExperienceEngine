## Why

Phase 1 solved local version drift between install-state and the current `ee` package, but it still cannot tell a user on an older installation that a newer ExperienceEngine release exists upstream. For a real product update experience, doctor needs a remote version source so older installations can proactively discover new releases instead of only noticing drift after the package has already been updated locally.

The next slice should add a conservative remote release check that stays compatible with the current distribution model. Because this project is currently distributed from a GitHub repository rather than an npm package, the first remote source should be GitHub Releases.

## What Changes

- Add a remote release resolver that reads the product repository metadata and queries the latest GitHub Release version.
- Extend `ee doctor` to report:
  - current local package version
  - latest remote release version when available
  - whether a remote update is available
  - the follow-up command guidance for host wiring after the package itself is updated
- Keep remote checks non-blocking and conservative:
  - short timeout
  - graceful fallback on network/API failure
  - no automatic package download in this change

## Capabilities

### Modified Capabilities

- `agent-adapter-installation`: doctor can discover newer upstream ExperienceEngine releases and report remote update availability without changing host-specific upgrade semantics.

## Impact

- Adds the first upstream release-awareness layer to product diagnostics.
- Keeps `ee upgrade <agent>` scoped to host rewiring while teaching doctor to distinguish package updates from adapter rewiring.
- Establishes a clean base for later phases such as one-click package upgrade, backup, and rollback.
