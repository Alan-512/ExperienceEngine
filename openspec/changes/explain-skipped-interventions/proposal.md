## Why

When ExperienceEngine does not inject guidance, users and agents can misread silence as the system not working. Skips are often intentional governance decisions, so the system needs inspectable no-injection reasons that reinforce trust without polluting the prompt.

## What Changes

- Add structured skipped-intervention reason codes to prompt-time decisions and inspection surfaces.
- Explain why a similar candidate was not injected, such as low signal, immature candidate, policy rejection, recent harm, holdout, or delivery state.
- Keep no-injection explanations out of normal prompt injection unless explicitly requested through inspect/explain surfaces.
- Add tests for no-injection explanation behavior.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `experience-intervention-governance`: Intervention decisions expose structured skip reasons when no guidance is injected.
- `mcp-native-interaction-surface`: Routine read/explain surfaces can report why ExperienceEngine skipped injection.

## Impact

- Affects intervention diagnostics, scorecards, inspect/explain surfaces, and tests.
- Does not change candidate retrieval thresholds or injection policy by itself.
