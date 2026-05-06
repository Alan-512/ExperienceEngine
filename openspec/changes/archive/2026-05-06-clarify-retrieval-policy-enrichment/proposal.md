## Why

Retrieval Policy v2 now has explicit lexical and semantic stages, but policy enrichment still exposes mostly flat score strings. The next step is to make governance evidence structured and inspectable without changing the numeric adjustment or intervention behavior.

## What Changes

- Add structured policy enrichment components alongside the existing `policyAdjustment`, `policyScore`, and reason strings.
- Classify policy evidence into stable categories such as family fit, specificity, feedback, maturity, generic penalty, expectation correction, task alignment, and opportunistic retrieval-context evidence.
- Preserve current policy adjustment math and existing reason strings for source compatibility.
- Add tests proving component totals match existing adjustment values and do not change candidate order or intervention outcomes.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `experience-retrieval-policy`: Adds requirements for structured policy enrichment components and score compatibility.

## Impact

- Affected code should stay mostly in `src/controller/policy-enricher.ts`, candidate score types, and focused retrieval/intervention tests.
- No database migration, prompt text change, public CLI/MCP contract change, or scoring retune is expected.
