## Why

ExperienceEngine now supports MCP-native planning and confirmation for install, repair, and upgrade, but it still lacks the rest of the high-impact state-management lifecycle: backup, export, import, and rollback. Those are necessary for a durable product because users need a safe way to preserve or recover accumulated experience state.

## What Changes

- Add managed ExperienceEngine state snapshots for backups and exports
- Add MCP resources to inspect available backups
- Add MCP plan/confirm tools for backup, export, import, and rollback
- Restore ExperienceEngine-managed state from backups or exported bundles with an automatic safeguard backup before destructive restore operations

## Impact

- Affects the shared MCP server
- Adds a new state-artifact service over ExperienceEngine product data
- Extends the MCP-native interaction model to cover the remaining high-impact state lifecycle
