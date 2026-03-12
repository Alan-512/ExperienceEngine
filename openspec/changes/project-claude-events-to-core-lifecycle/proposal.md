# Change Proposal: Project Claude Events To Core Lifecycle

## Why

Claude hook events are now captured and normalized, but the Claude adapter still cannot feed the existing ExperienceEngine runtime boundary. The next step is to map normalized Claude events into the host-agnostic lifecycle objects already used by the core runtime.

## What Changes

- Add Claude event projection helpers that derive `HostPromptContext` and `HostToolResult` from normalized Claude events
- Add a small session state helper so `SessionEnd` can resolve back to the most recent prompt context
- Cover the projection logic with unit tests

## Impact

- The Claude adapter can move toward real core integration without inventing another runtime contract
- Future live Claude execution can call the same core service that OpenClaw already uses
