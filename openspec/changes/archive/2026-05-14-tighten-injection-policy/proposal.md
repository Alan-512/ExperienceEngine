## Why

ExperienceEngine's product value depends on minimal, high-signal prompt intervention. Even with strong retrieval, prompt quality can degrade if multiple hints, raw history, immature candidates, or overly expanded guidance reach routine tasks.

## What Changes

- Make injection policy explicitly conservative by default.
- Ensure routine injection defaults to one compact hint.
- Prevent raw task history and learning candidates from being injected.
- Allow expanded Goal / Steps / Avoid content only for mature, high-confidence nodes.
- Add snapshot or rendering tests that lock prompt length and content boundaries.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `experience-intervention-governance`: Injection delivery policy becomes explicitly bounded by maturity and quality.
- `experience-retrieval-policy`: Retrieved candidates remain diagnostic unless intervention policy authorizes injection.

## Impact

- Affects intervention selection, injection rendering, scorecard diagnostics, and tests.
- Does not change storage schema or host adapter contracts.
