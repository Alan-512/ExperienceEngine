## Overview

Phase C is an explainability refactor for policy enrichment. It does not tune scoring. It introduces structured components so operators and later inspect surfaces can explain why governance boosted or penalized a candidate.

## Component Model

Each policy component should include:

- `name`: stable machine-readable name
- `category`: stable high-level grouping
- `value`: signed numeric contribution
- `reason`: concise human-readable reason

Initial categories:

- `family_fit`
- `specificity`
- `feedback`
- `maturity`
- `penalty`
- `expectation_correction`
- `task_alignment`
- `retrieval_context`

## Compatibility

The existing `policyAdjustment`, `policyScore`, and `policyReasons` strings remain available. The sum of component values must equal the current enriched policy adjustment after rounding rules. Candidate ordering should not change.

## Non-Goals

- Do not change thresholds or weights.
- Do not make inferred retrieval-context fields hard filters.
- Do not expose full policy internals in prompt text.
- Do not add a new storage table.

## Validation

Focused tests should verify:

- component totals equal existing `policyAdjustment`
- negative components are represented explicitly
- existing flat reason strings remain available
- retrieval/intervention target tests still pass
