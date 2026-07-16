## Why

Safe diagnostic artifacts provide no value if public issue templates still ask users for raw logs, databases, prompts, or secrets. Phase 0.5B must make the repository feedback path match the implemented privacy boundary.

## What Changes

- Add installation-problem, runtime-bug, harmful-intervention, and feature-request issue templates.
- Add root `CONTRIBUTING.md` and `SECURITY.md`.
- Update public docs to explain diagnose, review, explicit archive, and safe attachment behavior.
- Request only the reviewed manifest/archive, never raw SQLite, settings, logs, prompts, source, credentials, or provider payloads.
- Run a real operator fixture and published-package closeout before claiming the flow supported.

## Capabilities

### New Capabilities

- `public-feedback-infrastructure`: Repository issue/security/contribution surfaces aligned with privacy-safe reviewed diagnostics.

### Modified Capabilities

- `cli-user-experience-surface`: Public docs describe the completed local review/archive workflow accurately.

## Impact

- Depends on D1 and D2.
- Expected files: `.github/ISSUE_TEMPLATE`, `CONTRIBUTING.md`, `SECURITY.md`, README/user guide/release docs, validation fixtures.
- Does not add remote telemetry or automatic issue submission.
