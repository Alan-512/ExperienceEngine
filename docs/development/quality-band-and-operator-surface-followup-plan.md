# Quality Band And Operator Surface Follow-up Plan

This plan captures the next architecture-optimization work after the learning-quality observability release. It is not a standing architecture blueprint; `docs/development/architecture.md` remains the source of truth for the current architecture after each implemented change.

## Context

The learning-quality release adds scope-level signals for recorded task runs, candidate admission, rejection reason distribution, generic/non-transferable guidance pressure, and helped/harmed feedback closure. Those signals make the next two product surfaces safer to build because they show whether ExperienceEngine is learning usable project experience or admitting noisy guidance.

## Phase 4: Quality Band Productization

### Objective

Turn the existing `qualityBand` concept into a consistent explanation layer for `inspect` and summary flows. It should help users understand why an experience is trustworthy, still building evidence, or risky without creating a new delivery state or hidden scoring model.

### Proposed OpenSpec Change

`formalize-quality-band-inspection-model`

### Inputs

- Existing node lifecycle data: delivery state, validation state, applicability, provenance, and retirement signals.
- Learning-quality metrics: candidate admission rate, rejection distribution, generic/non-transferable rejection pressure, and feedback closure.
- Runtime intervention records: delivered, skipped, helped, harmed, and unresolved feedback.

### Outputs

- A stable Quality Band explanation model for inspect-style output.
- Repo-level summary wording that explains whether learned guidance is strong, building, or risky.
- No-injection explanations that distinguish "no relevant learned guidance" from "guidance exists but is not ready to ship".
- Tests that lock the mapping from existing state to explanation text.

### Non-goals

- Do not add a new lifecycle state.
- Do not make Quality Band a delivery gate in this phase.
- Do not introduce numeric quality scores until real usage data proves the categories are insufficient.

### Acceptance Criteria

- `ee inspect` and related summary surfaces use one shared Quality Band derivation path.
- Users can see the evidence behind the band without reading raw database fields.
- Existing injection behavior is unchanged.
- Documentation states that Quality Band is explanatory and derived.

## Phase 5: Operator And Advanced Surface Consolidation

### Objective

Clarify which commands and host surfaces are routine, operator-level, or advanced/experimental so ExperienceEngine does not expose internal maintenance concepts as normal user workflows.

### Proposed OpenSpec Change

`complete-operator-surface-boundaries`

### Surface Groups

Routine surfaces:

- `ee status`
- `ee doctor <host>`
- `ee inspect --last`
- helped/harmed feedback overrides

Operator surfaces:

- repair and upgrade validation
- inspect review flows
- hygiene review
- export drafts
- package and host validation checks

Advanced or experimental surfaces:

- brokered actions internals
- hybrid maintenance commands
- raw evaluation and distillation internals
- developer-only diagnostics that are not required for normal use

### Outputs

- CLI help grouping that separates routine, operator, and advanced commands.
- User guide updates that keep normal workflows short.
- Development docs for advanced surfaces that should not be promoted as default usage.
- Compatibility notes for Codex, Claude Code, and OpenClaw where host-specific entry points differ.

### Non-goals

- Do not remove existing commands in the first consolidation pass.
- Do not rename commands without a compatibility path.
- Do not claim host-native marketplace behavior unless it has been validated in that host.

### Acceptance Criteria

- A new user can identify the routine path without learning operator internals.
- Operators can still find repair, review, hygiene, and export workflows.
- Advanced surfaces are documented as advanced or experimental where appropriate.
- Public docs, `ee --help`, and host guidance use consistent grouping language.

## Release Sequencing

- `0.3.4`: learning-quality observability.
- `0.3.5`: Quality Band productization, after observing whether the `0.3.4` metrics are sufficient.
- `0.3.6`: Operator and Advanced surface consolidation, after Quality Band wording and inspect semantics stabilize.

