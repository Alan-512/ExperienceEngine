## Context

Public feedback guidance must not undo the safety guarantees of diagnostic collection and archive creation.

## Decisions

- Every bug-oriented template asks for the reviewed diagnostic manifest/archive and reminds users to inspect it first.
- Templates explicitly reject raw databases, settings, logs with secrets, prompts, source code, and provider payloads.
- Security reports follow a private disclosure path and do not request public diagnostic uploads.
- Feature requests do not require diagnostics.
- Public support wording distinguishes source validation, local-pack validation, and published-package acceptance.

## Non-Goals

- no automatic GitHub issue creation
- no remote upload endpoint
- no telemetry or crash reporting
- no general efficacy/support/readiness claim
