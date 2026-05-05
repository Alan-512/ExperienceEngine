## 1. Hygiene Analyzer

- [x] 1.1 Add `src/maintenance/experience-hygiene.ts` with read-only report types, filters, deterministic ordering, and default limits.
- [x] 1.2 Implement stale, duplicate, conflicting, over-generalized, and evidence-drift finding rules over existing node/candidate/evidence data.
- [x] 1.3 Add read-only repository queries only if existing node, candidate, attribution, injection, and episode projection accessors cannot support the analyzer.

## 2. Interaction And Inspect Surfaces

- [x] 2.1 Expose hygiene review through the interaction service without mutating candidates, nodes, attribution records, injection records, review events, repo policy, or delivery state.
- [x] 2.2 Add an inspect/report CLI surface for hygiene review with scope, finding type, severity, and limit filters.
- [x] 2.3 Format report output with summary counts, severity ordering, affected ids, evidence summaries, and review-only recommendations.

## 3. Tests

- [x] 3.1 Add unit coverage for each hygiene finding type and for the no-findings report path.
- [x] 3.2 Add mutation-guard coverage proving hygiene review does not write lifecycle, attribution, injection, candidate, review, or repo policy state.
- [x] 3.3 Add interaction service and CLI inspect tests for filters, bounded output, deterministic ordering, and report formatting.

## 4. Validation

- [x] 4.1 Run targeted unit tests for hygiene analyzer, interaction service, and inspect command.
- [x] 4.2 Run `pnpm check`.
- [x] 4.3 Run `openspec validate add-experience-hygiene-review --strict` and `openspec validate --changes --strict`.
