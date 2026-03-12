## Why

ExperienceEngine now installs into multiple hosts, but once an adapter is wired there is no product-level way to tell whether that host is still on the same package version as the current `ee` CLI. That creates upgrade ambiguity: after the package is updated locally, users still need to remember which host adapters should be reinstalled or repaired.

The next product slice should add a small, reliable upgrade flow that works with the current distribution model. Phase 1 should only detect drift between the currently running package version and the version recorded when each adapter was last installed, then provide a direct `ee upgrade <agent>` path to refresh host wiring.

## What Changes

- Persist the current package version into each adapter install-state whenever `ee install <agent>` succeeds.
- Extend `ee doctor` to report:
  - recorded installed version
  - current package version
  - whether an upgrade is available because the local package is newer than the adapter's recorded version
- Add `ee upgrade <agent>` as a first-class command that reruns the host-specific install flow and refreshes install-state metadata.
- Keep the first version source intentionally local:
  - compare install-state version against the currently running package version
  - do not add network-based release checks in this change

## Capabilities

### Modified Capabilities

- `agent-adapter-installation`: adapters record their installed version, surface upgrade drift in doctor, and expose a host-specific upgrade command.

## Impact

- Affects all supported adapter installers and doctor output.
- Adds the first product-level upgrade UX without introducing remote release infrastructure.
- Creates a stable base for a later phase that can add remote update discovery, backup, and rollback.
