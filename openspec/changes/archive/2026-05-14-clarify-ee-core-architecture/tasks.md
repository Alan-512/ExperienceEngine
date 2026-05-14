## 1. Development Documentation Placement

- [x] 1.1 Move the current architecture blueprint to `docs/development/architecture.md`
- [x] 1.2 Move the reviewed optimization plan to `docs/development/architecture-optimization-roadmap.md`
- [x] 1.3 Add `docs/development/README.md` with the architecture update rule

## 2. Roadmap Corrections

- [x] 2.1 Mark the optimization document as a staged roadmap, not a one-shot refactor plan
- [x] 2.2 Add the reviewed change split: `clarify-ee-core-architecture`, `harden-learning-gate`, `split-runtime-services`, `explain-skipped-interventions`, and `tighten-injection-policy`
- [x] 2.3 Add constraints against early directory churn, host behavior changes, and unnecessary new persistent state

## 3. Validation

- [x] 3.1 Verify both documentation files are UTF-8 readable
- [x] 3.2 Verify `internal-docs` no longer contains the two moved source files
- [x] 3.3 Run `openspec validate --changes --strict`
