## Why

OpenClaw now loads ExperienceEngine correctly, but host diagnostics still show ExperienceEngine-owned warnings caused by stale development load paths and permissive copied file modes. These warnings should be cleaned up automatically by install/repair instead of remaining as manual host maintenance.

## What Changes

- Remove stale ExperienceEngine development roots from `plugins.load.paths` during install/repair.
- Normalize permissions inside the copied OpenClaw extension install for ExperienceEngine.
- Keep unrelated host warnings, such as third-party duplicate plugin ids, outside this cleanup flow.

## Capabilities

### Modified Capabilities

- `agent-adapter-installation`: OpenClaw install/repair cleans ExperienceEngine-owned warning sources.
- `openclaw-experience-plugin`: Doctor output becomes quieter after install/repair because stale ExperienceEngine warning sources are removed.

## Impact

- Reduces false-positive warning noise from ExperienceEngine-owned host state.
