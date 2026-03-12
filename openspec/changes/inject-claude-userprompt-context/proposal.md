## Why

The Claude Code adapter now validates real prompt, tool, and session-end lifecycles, but it still behaves as a passive ingest path. ExperienceEngine captures Claude sessions and replays them into the core runtime on `SessionEnd`, yet it does not inject any prompt-time guidance back into Claude when a similar task is recognized.

Claude Code's official `UserPromptSubmit` hook surface allows command hooks to append additional context to the prompt. ExperienceEngine should use that surface so Claude becomes a real intervention adapter, not just a post-hoc recorder.

## What Changes

- Define the requirement that Claude `UserPromptSubmit` can return ExperienceEngine prompt guidance as hook output.
- Run `beforePromptBuild` during Claude `UserPromptSubmit`, persist injected node ids into Claude session state, and return hook output when intervention is selected.
- Suppress noisy Node warnings in the installed Claude hook command so structured hook output is not polluted.
- Add regression coverage for prompt-time Claude injection and session replay with persisted injected node ids.

## Impact

- Claude Code gains real-time ExperienceEngine intervention, not just session ingestion.
- Finalized Claude records keep the same injected node ids that were shown at prompt time.
- Hook output becomes cleaner and safer for Claude to consume.
