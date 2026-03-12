## 1. Spec

- [x] 1.1 Add an OpenSpec delta for Claude `PostToolUseFailure`
- [x] 1.2 Document how failure events map into core tool results

## 2. Implementation

- [x] 2.1 Install and inspect a `PostToolUseFailure` Claude hook
- [x] 2.2 Normalize and project `PostToolUseFailure` as a failed tool result

## 3. Validation

- [x] 3.1 Add regression coverage for install/doctor/normalization/projection
- [x] 3.2 Run `pnpm check`
- [x] 3.3 Re-run real Claude failure validation and confirm harmed counters can update
