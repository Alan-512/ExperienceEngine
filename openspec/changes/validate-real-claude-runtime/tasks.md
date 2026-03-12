## 1. Define Claude Runtime Validation Workflow

- [x] 1.1 Add an OpenSpec delta spec for `claude-runtime-validation`
- [x] 1.2 Document the local Claude validation workflow, including install, run, capture, and fixture promotion

## 2. Capture And Replay Real Claude Payloads

- [x] 2.1 Execute a real local Claude validation run with the current ExperienceEngine hooks enabled
- [x] 2.2 Promote at least one sanitized real Claude payload sequence into repository fixtures and replay coverage

## 3. Validate

- [x] 3.1 Run `pnpm check`
- [x] 3.2 Confirm the Claude runtime validation artifacts and tests reflect the live run
