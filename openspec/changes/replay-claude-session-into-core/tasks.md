## 1. Session Persistence

- [x] 1.1 Add a disk-backed Claude session state store for prompt context and tool results
- [x] 1.2 Update the Claude hook command to persist projected prompt/tool lifecycle data across invocations

## 2. Core Replay

- [x] 2.1 Replay stored Claude sessions into the core runtime on `SessionEnd`
- [x] 2.2 Clear stored Claude session state after successful replay

## 3. Validation

- [x] 3.1 Add tests for disk-backed session state and session-end replay
- [x] 3.2 Keep the full test/check suite green
