## 1. Policy Tests

- [x] 1.1 Add tests proving ordinary injection emits at most one compact hint
- [x] 1.2 Add tests proving raw task history and candidates are never rendered into prompt injection
- [x] 1.3 Add tests proving conservative injection omits expanded fields
- [x] 1.4 Add tests for expanded rendering only on mature high-confidence nodes
- [x] 1.5 Add tests proving `QualityBand` is not used as the injection gate

## 2. Injection Policy Implementation

- [x] 2.1 Centralize injection count and rendering gates near intervention/rendering logic
- [x] 2.2 Keep retrieval diagnostics available without making them prompt content
- [x] 2.3 Ensure scorecards explain why selected content was compact or expanded
- [x] 2.4 Define mature/high-confidence in terms of `state`, `delivery_state`, validation, recent harm, scorecard confidence, and intervention mode

## 3. Validation

- [x] 3.1 Run injection renderer and intervention controller tests
- [x] 3.2 Run `pnpm check`
- [x] 3.3 Run `openspec validate --changes --strict`
