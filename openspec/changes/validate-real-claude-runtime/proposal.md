## Why

ExperienceEngine now has a working Claude Code installer, hook capture, normalized event layer, and session replay into the core runtime. What is still missing is validation against a real local Claude Code runtime. Without that step, current Claude payload assumptions remain synthetic.

## What Changes

- Add a Claude runtime-validation capability for capturing and curating real Claude hook payloads
- Validate the current Claude installer + hook + replay path against a real local Claude Code run
- Promote real Claude payload shapes into checked-in fixtures and replay tests

## Capabilities

### New Capabilities
- `claude-runtime-validation`: Development workflow for exercising ExperienceEngine against a real local Claude Code runtime, capturing real hook payloads, and preserving them as fixtures.

### Modified Capabilities
- `agent-adapter-installation`: Extend adapter validation expectations so Claude installs are not only structurally present but also exercised against a live local runtime.

## Impact

- Affects Claude adapter fixtures and tests
- Affects developer workflow docs for local validation
- Affects future Claude compatibility work by grounding it in real captured payloads
