## Why

Real host execution showed that `ee repair openclaw` fails once the plugin already exists in `~/.openclaw/extensions/experienceengine`, because the current flow always reruns `openclaw plugins install <path>`.

## What Changes

- Make the OpenClaw wiring flow idempotent.
- Use `openclaw plugins update experienceengine` when the plugin is already installed.
- Keep first-time installs on the normal local-path install flow.

## Capabilities

### Modified Capabilities

- `agent-adapter-installation`: OpenClaw install/repair becomes repeatable on a live host.

## Impact

- Removes a real blocker from repeated repair runs.
