## 1. Policy Tests

- [ ] 1.1 Add tests proving ordinary injection emits at most one compact hint
- [ ] 1.2 Add tests proving raw task history and candidates are never rendered into prompt injection
- [ ] 1.3 Add tests proving conservative injection omits expanded fields
- [ ] 1.4 Add tests for expanded rendering only on mature high-confidence nodes
- [ ] 1.5 Add tests proving `QualityBand` is not used as the injection gate

## 2. Injection Policy Implementation

- [ ] 2.1 Centralize injection count and rendering gates near intervention/rendering logic
- [ ] 2.2 Keep retrieval diagnostics available without making them prompt content
- [ ] 2.3 Ensure scorecards explain why selected content was compact or expanded
- [ ] 2.4 Define mature/high-confidence in terms of `state`, `delivery_state`, validation, recent harm, scorecard confidence, and intervention mode

## 3. Validation

- [ ] 3.1 Run injection renderer and intervention controller tests
- [ ] 3.2 Run `pnpm check`
- [ ] 3.3 Run `openspec validate --changes --strict`
