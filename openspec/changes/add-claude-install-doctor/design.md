# Design: Add Claude Install Doctor

## Summary

Add a Claude-specific install inspection path that checks:

- adapter install-state exists
- project-local Claude settings file exists
- ExperienceEngine-owned hook registrations are present for expected events

`ee doctor claude-code` will print a compact table similar to the OpenClaw doctor, but with Claude-specific fields.

## Non-Goals

- Mutating Claude settings during doctor
- Implementing a generic cross-agent doctor matrix in this change
