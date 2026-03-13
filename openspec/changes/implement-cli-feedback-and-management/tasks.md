## 1. Repository And Runtime Support

- [x] 1.1 Add scope repository helpers for reading and updating disabled scope state
- [x] 1.2 Add node repository helpers for targeted state and feedback updates
- [x] 1.3 Wire disabled-scope checks into runtime intervention gating

## 2. CLI Commands

- [x] 2.1 Implement `ee feedback --last|node <id> helped|harmed`
- [x] 2.2 Implement `ee disable node <id>` and `ee disable scope`
- [x] 2.3 Implement `ee cool node <id>` and `ee retire node <id>`
- [x] 2.4 Update CLI routing and usage copy for the new command surface

## 3. Validation

- [x] 3.1 Add unit tests for feedback and management commands
- [x] 3.2 Add runtime coverage for disabled-scope skip behavior
- [x] 3.3 Run `pnpm check` and `openspec validate --changes --strict`
