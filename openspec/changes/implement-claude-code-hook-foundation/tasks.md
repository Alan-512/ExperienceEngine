## 1. Claude Installer

- [x] 1.1 Add a Claude Code installer that writes project-local hook configuration
- [x] 1.2 Keep Claude install-state under the shared ExperienceEngine product home

## 2. Hook Runtime

- [x] 2.1 Add a `claude-hook` CLI entrypoint that captures hook payload JSON from stdin
- [x] 2.2 Persist Claude hook captures by session/event under the Claude adapter capture directory

## 3. Validation

- [x] 3.1 Add tests for Claude settings merge and hook capture persistence
- [x] 3.2 Keep the full test/check suite green
