## 1. Core Runtime Boundary

- [x] 1.1 Extract a host-agnostic runtime service from the current OpenClaw-oriented orchestration
- [x] 1.2 Refit the OpenClaw plugin entrypoint to delegate to the extracted runtime service

## 2. Product Path Resolution

- [x] 2.1 Add a product-owned data-home resolver with backward-compatible OpenClaw path support
- [x] 2.2 Surface active path resolution through diagnostics that tests can assert

## 3. CLI Foundation

- [x] 3.1 Add an `ee` CLI entrypoint and wire `install openclaw`
- [x] 3.2 Add `ee doctor` to report adapter install status and resolved storage paths

## 4. Validation

- [x] 4.1 Extend unit and integration coverage for the extracted runtime boundary
- [x] 4.2 Keep OpenClaw plugin runtime regression coverage green after the refactor
