## Why

ExperienceEngine 现在支持 `ee disable scope`，但还没有对称的恢复路径。用户一旦在当前项目关闭了注入，只能手动改库或者等待后续 repair，这不符合 CLI 产品的基本可控性。

## What Changes

- Add `ee enable scope` to re-enable ExperienceEngine interventions for the current workspace scope.
- Extend the scope management CLI contract so disable and enable form a reversible pair.

## Capabilities

### New Capabilities
- `cli-scope-enable`: Re-enable ExperienceEngine interventions for the current CLI workspace scope.

### Modified Capabilities
- `cli-feedback-and-management`: Scope management now includes both disable and enable actions.

## Impact

- Affected code:
  - `src/cli/commands`
  - `src/cli/index.ts`
  - `src/store/sqlite/repositories/scope-repo.ts`
- Affected systems:
  - local SQLite scope state
