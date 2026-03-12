# Change Proposal: Classify OpenClaw Host Warnings

## Why

`ee doctor` currently prints every OpenClaw warning in one flat list. After the recent repair and cleanup work, the remaining warnings are often unrelated to ExperienceEngine itself, which makes the diagnostic output look noisier and more alarming than it is.

## What Changes

- Classify OpenClaw warnings into:
  - ExperienceEngine-owned warnings
  - host advisories
  - external plugin warnings
- Update `ee doctor` output to render those groups separately
- Add tests that lock the classification rules to current OpenClaw warning shapes

## Impact

- Users can tell whether ExperienceEngine is still unhealthy or whether OpenClaw is only reporting unrelated host/plugin warnings
- Repair guidance stays focused on ExperienceEngine-owned issues
