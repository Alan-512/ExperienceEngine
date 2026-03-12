## Context

The current planner assumes a first-time install every time. On a real host, that is false after the first successful copied install, and `openclaw plugins install <path>` fails with `plugin already exists`.

## Goals / Non-Goals

**Goals:**
- Detect whether ExperienceEngine is already present in OpenClaw installs metadata.
- Use `plugins update experienceengine` when appropriate.
- Keep install and repair flows repeatable.

**Non-Goals:**
- Introduce uninstall.
- Change doctor parsing.

## Decisions

### Choose install vs update from live OpenClaw state

If `plugins.installs.experienceengine` already exists, the planner will use:
- `openclaw plugins update experienceengine`

Otherwise it will keep using:
- `openclaw plugins install <packageRoot>`

The later enable/config-set/cleanup steps remain unchanged.

## Risks / Trade-offs

- [Update may rely on existing installs metadata] → That is acceptable because idempotent repair only runs when installs metadata already exists.

## Implementation Plan

1. Query OpenClaw plugins config before building install/repair commands.
2. Switch the first command between install and update based on installs metadata.
3. Update tests for first-time and repeat repair flows.
