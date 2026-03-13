## Context

ExperienceEngine stores its durable product state in one product home:

- SQLite database
- product settings
- per-adapter install-state

That makes it possible to define a host-agnostic backup and restore model without trying to snapshot every host's private data directory. The product should back up and restore its own state, while adapter repair/install flows remain responsible for re-establishing host wiring if needed.

## Decisions

### 1. Backups and exports use managed snapshot directories

ExperienceEngine will store managed snapshots under the product home:

- `backups/<backup-id>/`
- `exports/<export-id>/`

Each snapshot directory contains:
- `metadata.json`
- `sqlite/experienceengine.db` when present
- `settings.json` when present
- `adapters/<adapter>/install.json` for captured adapter install-state

### 2. Rollback and import restore ExperienceEngine-managed state only

Restore operations do not attempt to restore host-private plugin or CLI internals. They restore ExperienceEngine-managed files only.

Implication:
- product state becomes recoverable and transferable
- host wiring can still be rechecked and repaired separately through existing install/doctor/repair flows

### 3. Destructive restores take a safeguard backup first

Before `import` or `rollback` overwrites current ExperienceEngine-managed state, the system creates a fresh safeguard backup of the current state.

### 4. Import consumes a previously exported or backed-up snapshot path

The first import implementation accepts a filesystem path that points at a valid ExperienceEngine snapshot directory. This keeps the format explicit and testable.

### 5. MCP surface mirrors the existing plan-and-confirm pattern

The state operations use the same safety model as install/repair/upgrade:
- create a plan
- review the plan
- execute with confirmation token

### 6. Read-only backup visibility is exposed through resources

Agents should be able to inspect existing backups without mutating anything, so backup inventory is exposed as MCP resources.
