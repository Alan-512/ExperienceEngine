## Why

Real OpenClaw host verification showed that linking the plugin from `/mnt/d/project/...` can be rejected as a world-writable path. The current `-l` install mode is therefore too fragile for the product default.

## What Changes

- Change the OpenClaw install/repair planner to prefer normal local-path installation over link mode.
- Record the new install mode in ExperienceEngine's install state.
- Keep doctor reporting the effective host source/install path so blocked linked installs are easier to diagnose.

## Capabilities

### Modified Capabilities

- `agent-adapter-installation`: OpenClaw install uses a safer default local-path copy flow.
- `openclaw-experience-plugin`: Repair reuses the safer install mode.

## Impact

- Reduces the chance of OpenClaw rejecting the plugin source because of world-writable linked paths.
