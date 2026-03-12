# Design: Classify OpenClaw Host Warnings

## Summary

Introduce a small warning classifier in the OpenClaw installer/inspection layer. The classifier uses stable ownership heuristics:

- ExperienceEngine-owned:
  - warning text mentions `experienceengine`
  - warning text references the plugin source/install/package path
- Host advisory:
  - warning text matches known OpenClaw-wide advisories such as `plugins.allow is empty`
- External:
  - everything else

`ee doctor` will print these groups separately so that unrelated warnings do not look like ExperienceEngine breakage.

## Non-Goals

- Auto-fixing unrelated host warnings
- Auto-managing the OpenClaw plugin allowlist in this change
