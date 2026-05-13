## 1. Eligibility Contract

- [x] 1.1 Add focused tests for expression-only and ordinary-success task rejection
- [x] 1.2 Add focused tests for failure-repair, retry, user-correction, objective-verification, and verified-project-constraint acceptance
- [x] 1.3 Define stable learning eligibility reason codes and ordered precedence
- [x] 1.4 Add fixture-style cases for docs-only edit, ordinary success, prompt-only low evidence, failing-test repair, repeated retry, user correction, and host compatibility repair

## 2. Analyzer Implementation

- [x] 2.1 Add a deterministic learning eligibility evaluator using existing `CandidateSourceSignal` data
- [x] 2.2 Reuse existing signal helpers before adding new signal fields
- [x] 2.3 Keep LLM summarization behind the deterministic eligibility decision

## 3. Runtime Wiring

- [x] 3.1 Call the eligibility evaluator before candidate creation in finalization
- [x] 3.2 Persist or expose rejection reasons without creating candidates
- [x] 3.3 Ensure rejected tasks do not enqueue distillation jobs

## 4. Inspection And Validation

- [x] 4.1 Surface learning rejection reasons in the most local existing inspect or learning summary path
- [x] 4.2 Run analyzer and runtime tests covering learning eligibility
- [x] 4.3 Run Codex coverage for `UserPromptSubmit`, `Stop`, and MCP explain behavior after rejected and accepted learning paths
- [x] 4.4 Run Claude Code hook/session finalization coverage
- [x] 4.5 Run OpenClaw prompt/finalization coverage for the same accepted and rejected learning paths
- [x] 4.6 Run `pnpm check` and `openspec validate --changes --strict`
