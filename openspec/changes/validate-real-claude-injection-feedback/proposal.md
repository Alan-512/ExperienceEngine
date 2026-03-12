## Why

Claude Code now supports real prompt-time ExperienceEngine injection plus session replay, but the adapter has not yet been validated at the same product level as OpenClaw. We still need real evidence that:

- a second similar Claude task reuses prior experience and injects guidance
- a Claude run in a different task family skips injection
- Claude finalization preserves `helped` / `harmed` feedback on injected nodes

Without those checks, Claude remains "integration-complete" but not "behavior-verified".

## What Changes

- Define runtime evidence requirements for real Claude second-turn injection and feedback attribution.
- Run real local Claude validation for:
  - a similar follow-up task that should inject
  - a negative-control task that should skip
  - at least one injected success and one injected failure outcome
- Promote any newly useful sanitized Claude payload sequences into fixtures and replay coverage.

## Impact

- Raises the Claude adapter from lifecycle validation to behavior validation.
- Confirms Claude and OpenClaw now share the same core product loop: inject, skip, help, harm.
- Leaves the Claude adapter ready for deeper policy tuning instead of more basic host integration work.
