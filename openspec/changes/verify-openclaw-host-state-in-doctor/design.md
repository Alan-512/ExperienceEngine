## Context

Real OpenClaw CLI output is not a clean machine-only interface. `openclaw plugins info experienceengine` returns formatted text and may include warning lines before the actual plugin details. `openclaw config get plugins.entries.experienceengine` can return JSON, but warning text may still be emitted before the JSON payload. The doctor flow needs a parsing layer that tolerates those wrappers.

## Goals / Non-Goals

**Goals:**
- Query OpenClaw for live plugin status and plugin config.
- Parse the current CLI output shape into stable fields used by `ee doctor`.
- Surface live host errors and config mismatches alongside product install state.

**Non-Goals:**
- Mutate OpenClaw state during doctor.
- Replace the human-readable `openclaw` CLI output format.
- Add gateway restart automation.

## Decisions

### Use read-only CLI queries for host verification

Doctor will query:
- `openclaw plugins info experienceengine`
- `openclaw config get plugins.entries.experienceengine`

These are the smallest documented read-only surfaces that expose whether the plugin is loaded and how it is configured.

### Parse around warning prefixes

The parser will tolerate leading warning lines and extract:
- plugin status
- source/install path
- reported error message
- config payload JSON if present

### Report mismatch explicitly

Doctor will compare the live OpenClaw plugin config against the ExperienceEngine install-state config and report whether they match.

## Risks / Trade-offs

- [CLI output may drift] → Keep parsing isolated and unit-tested against real captured samples.
- [Host query can fail because the plugin itself errors on register] → Report the host error as diagnostic output rather than hiding it.
- [Warnings from unrelated plugins can clutter output] → Strip and retain warnings separately instead of failing JSON parsing.

## Implementation Plan

1. Add read-only query command builders and output parsers for OpenClaw host inspection.
2. Extend the installer inspection layer to include live host diagnostics.
3. Update `ee doctor` to render host plugin status, host errors, and config match state.
4. Add unit coverage using real captured output shapes.
