## 1. Core Runtime Boundary

- [ ] 1.1 Extract a host-agnostic runtime service from the current OpenClaw-oriented orchestration
- [ ] 1.2 Refit the OpenClaw plugin entrypoint to delegate to the extracted runtime service

## 2. Product Path Resolution

- [ ] 2.1 Add a product-owned data-home resolver with backward-compatible OpenClaw path support
- [ ] 2.2 Surface active path resolution through diagnostics that tests can assert

## 3. CLI Foundation

- [ ] 3.1 Add an `ee` CLI entrypoint and wire `install openclaw`
- [ ] 3.2 Add `ee doctor` to report adapter install status and resolved storage paths

## 4. Validation

- [ ] 4.1 Extend unit and integration coverage for the extracted runtime boundary
- [ ] 4.2 Keep OpenClaw plugin runtime regression coverage green after the refactor
