## 1. Spec

- [x] 1.1 Add an OpenSpec delta for real Claude `tool_response` normalization
- [x] 1.2 Document the fallback status inference for `tool_response`

## 2. Implementation

- [x] 2.1 Update Claude `PostToolUse` normalization to read `tool_response.stdout/stderr`
- [x] 2.2 Promote a sanitized real Claude tool-session payload sequence into repository fixtures and replay coverage

## 3. Validation

- [x] 3.1 Add regression coverage for the real tool-session fixture
- [x] 3.2 Run `pnpm check`
- [x] 3.3 Re-run the real Claude tool-session validation and confirm persisted evidence contains the real tool output
