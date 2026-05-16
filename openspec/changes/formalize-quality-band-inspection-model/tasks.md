## 1. Shared Quality Band Model

- [x] 1.1 Add a shared Quality Band derivation module or service helper with band, summary, reason codes, readable reasons, evidence refs, and optional review-only action.
- [x] 1.2 Replace the local `deriveQualityBand` / quality-driver logic with the shared model while preserving existing public fields.
- [x] 1.3 Incorporate existing lifecycle, delivery, validation, helped/harmed, and hygiene context without adding persistence or runtime mutation.

## 2. Inspection Surfaces

- [x] 2.1 Update node summary/detail inspection to include the shared Quality Band explanation.
- [x] 2.2 Update `ee inspect --last` to show concise Quality Band context for injected or matched guidance.
- [x] 2.3 Update no-injection explanations to distinguish no relevant guidance from building/risky guidance when evidence exists.
- [x] 2.4 Update repo summary output to include current-scope Quality Band distribution or equivalent trust summary.
- [x] 2.5 Update MCP/Codex resource and broker payloads to expose structured Quality Band fields.

## 3. Docs And Tests

- [x] 3.1 Add unit coverage for strong, building, and risky derivation with reason codes and evidence refs.
- [x] 3.2 Add CLI output tests for node detail, last intervention, no-injection, and repo summary behavior.
- [x] 3.3 Add MCP/resource or Codex broker tests for structured Quality Band payloads.
- [x] 3.4 Update `docs/user-guide.md`, relevant development architecture docs if needed, and release notes.
- [x] 3.5 Run targeted tests, `pnpm exec openspec validate formalize-quality-band-inspection-model --strict`, `pnpm exec openspec validate --all --strict`, and `pnpm check`.
