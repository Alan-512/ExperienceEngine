## Why

`ee doctor` can now show live OpenClaw plugin drift and host errors, but the product still stops short of remediation. The next slice should turn those findings into a direct repair flow so users do not need to translate diagnostics into manual OpenClaw commands.

## What Changes

- Add `ee repair openclaw` as a host-aware remediation command.
- Reuse the OpenClaw install/config command planner to repair drifted plugin state.
- Make doctor output point to repair when the live host state is unhealthy or mismatched.

## Capabilities

### Modified Capabilities

- `agent-adapter-installation`: OpenClaw support includes an explicit repair path for host drift.
- `openclaw-experience-plugin`: Doctor findings now map to a concrete remediation command.

## Impact

- Improves recoverability when OpenClaw config or plugin state drifts.
- Reuses the same documented OpenClaw CLI surfaces already used for install.
