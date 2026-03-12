# Change Proposal: Replay Claude Session Into Core

## Why

Claude hook invocations run as separate processes, so in-memory adapter session state is not durable enough to drive a real runtime flow. To move beyond static helper code, ExperienceEngine needs a disk-backed Claude session state and a `SessionEnd` replay path into the core runtime.

## What Changes

- Add a disk-backed Claude adapter session store for prompt context and tool results
- Update the Claude hook command to persist prompt/tool state across invocations
- Replay a completed Claude session into the existing core runtime on `SessionEnd`

## Impact

- Claude Code will start producing real ExperienceEngine input records and candidates instead of only captures
- The implementation will respect Claude hooks' stateless process model
