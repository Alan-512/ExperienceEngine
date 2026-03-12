## 1. Spec

- [x] 1.1 Add an OpenSpec delta for Claude prompt-time context injection
- [x] 1.2 Document how injected node ids persist from prompt-time intervention into finalization

## 2. Implementation

- [x] 2.1 Call core `beforePromptBuild` during Claude `UserPromptSubmit` and return hook output when ExperienceEngine selects injection
- [x] 2.2 Persist prompt-time injected node ids in Claude session state and suppress runtime warnings from installed hook commands

## 3. Validation

- [x] 3.1 Add regression coverage for prompt-time Claude injection and finalize replay
- [x] 3.2 Run `pnpm check`
- [x] 3.3 Run a real Claude live validation and confirm prompt-time hook output plus persisted injected node ids
