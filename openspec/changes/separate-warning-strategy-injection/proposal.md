## Why

Real runtime validation has shown that active `warning` nodes can piggyback on successful `strategy` injections for the same task family. This makes the injected hint block heavier than intended and weakens the product distinction between "working path to reuse" and "risky path to avoid".

## What Changes

- Make injection selection node-type-aware.
- Prefer `strategy` nodes for normal hint injection when they are available.
- Allow `warning` nodes to inject only when no applicable strategy node exists for the task family.

## Capabilities

### Modified Capabilities
- `openclaw-experience-plugin`: Refine conservative hint injection so warning nodes do not piggyback on strategy-led injections.

## Impact

- Affects runtime node selection in the controller
- Affects integration tests and possibly real-runtime validation evidence
