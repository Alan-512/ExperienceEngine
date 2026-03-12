## Context

The current host diagnostics already tell us whether OpenClaw sees the plugin, whether it is enabled, and whether its config matches ExperienceEngine's expected config. In the common failure case, remediation is not a new primitive: it is a reapplication of the same link/enable/config-set flow, possibly gated by what the doctor found.

## Goals / Non-Goals

**Goals:**
- Add a user-facing `ee repair openclaw` command.
- Make repair reuse the existing OpenClaw command planner rather than fork separate host mutation logic.
- Surface actionable remediation guidance from doctor when drift or host errors are detected.

**Non-Goals:**
- Add uninstall or rollback.
- Restart OpenClaw automatically.
- Repair unrelated third-party plugin warnings.

## Decisions

### Repair reuses install commands

The repair path will call the same link/enable/config-set command sequence used by install. This keeps the product aligned with documented OpenClaw mutation surfaces and avoids dual maintenance.

### Repair is explicit

Doctor will recommend repair, but it will not mutate host state. Users run `ee repair openclaw` to apply the fix.

### Doctor only recommends repair when needed

If the live host state already matches expected config and no host error is present, doctor should not recommend repair.

## Risks / Trade-offs

- [Repair may not fix issues caused by filesystem permissions] → Report the underlying OpenClaw or filesystem error without masking it.
- [Users may confuse install and repair] → Keep repair semantics explicit: install establishes host wiring, repair reapplies it when host drift is detected.

## Implementation Plan

1. Add a repair command that inspects host state and reuses the install planner.
2. Add a helper that decides whether repair is recommended.
3. Extend doctor output to print the repair hint only when needed.
4. Add unit coverage for repair recommendation and repair flow.
