## Why

Real runtime evidence shows warning nodes fragment by failure source (`current debug path`, `read`, `process`) because `compact_hint` currently bakes the tool name into the stable node key. That prevents later refreshes from converging on one canonical warning node even after task-summary sanitization is fixed.

## What Changes

- Make warning node keys canonical across failure sources by using a stable generic warning hint.
- Keep concrete failing-tool detail in non-key metadata such as `evidence_summary`.
- Add regression coverage proving repeated warning candidates for the same task family converge on one warning node id.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `openclaw-experience-plugin`: Refine experience persistence so warning nodes for the same task family converge on a canonical key instead of fragmenting by tool-specific failure source.

## Impact

- Affects warning candidate generation and stable warning node ids.
- Affects how future real-runtime failures refresh previously stored warning nodes.
- Affects regression coverage for warning-node convergence.
