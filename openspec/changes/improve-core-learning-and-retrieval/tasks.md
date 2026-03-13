## 1. Data model and persistence foundation

- [x] 1.1 Add schema fields and repository support for node provenance, attribution references, and any retrieval metadata required by the new core flow.
- [x] 1.2 Add a finalize transaction wrapper in the SQLite layer and apply it to runtime finalize persistence.
- [x] 1.3 Add migration-safe tests that prove finalize writes do not leave partial drift on failure.

## 2. Outcome, harm, and task-family resolution

- [x] 2.1 Replace coarse outcome resolution with terminal-evidence-aware logic that can preserve `unknown` when confidence is low.
- [x] 2.2 Replace co-occurrence harm detection with relevance-aware harm attribution, including environmental-failure filtering.
- [x] 2.3 Expand task-family resolution and add a conservative non-`unknown` fallback path for general coding tasks.
- [x] 2.4 Add focused unit tests for outcome resolution, harm attribution, and task-family coverage.

## 3. Evidence-driven extraction

- [x] 3.1 Introduce a structured extraction interface that consumes task summary, task family, terminal tool sequence, and failure signatures.
- [x] 3.2 Replace the fixed strategy template with differentiated evidence-driven strategy extraction.
- [x] 3.3 Replace the fixed warning template with differentiated evidence-driven warning extraction.
- [x] 3.4 Add extraction-focused tests that assert candidate diversity across distinct task scenarios.

## 4. Semantic retrieval pipeline

- [x] 4.1 Introduce a real retrieval abstraction and choose the first local-compatible embedding/vector backend.
- [x] 4.2 Implement semantic embedding generation and persistence for candidate retrieval.
- [x] 4.3 Replace exact candidate filtering with a ranked semantic shortlist that still preserves scope-local priority.
- [x] 4.4 Add retrieval tests that prove semantically similar tasks can match even when wording differs.

## 5. Explainability surfaces

- [x] 5.1 Persist node origin and attribution references during candidate creation and feedback updates.
- [x] 5.2 Extend inspect and MCP resource payloads to expose provenance and attribution fields.
- [x] 5.3 Add tests for explainability payloads in both CLI and MCP read surfaces.

## 6. User-authored experience

- [x] 6.1 Replace the `ee remember` scaffold with a real manual node authoring flow backed by persistence.
- [x] 6.2 Add validation for authored node fields and explicit authored provenance.
- [x] 6.3 Expose manual experience authoring through MCP prompt/tool workflows after the CLI path is stable.

## 7. Host-level regression validation

- [x] 7.1 Re-run OpenClaw runtime validation against the improved core logic and update fixtures if host-visible behavior changes.
- [x] 7.2 Re-run Claude Code runtime and MCP validation against the improved core logic and update fixtures if needed.
- [x] 7.3 Re-run Codex MCP/runtime validation against the improved core logic and update fixtures if needed.
- [x] 7.4 Run `pnpm check`, `openspec validate --specs`, and `openspec validate --changes --strict` before closing the change.
