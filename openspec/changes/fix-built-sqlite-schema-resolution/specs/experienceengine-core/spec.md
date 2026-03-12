## ADDED Requirements

### Requirement: Built Runtime Resolves SQLite Schema Assets

ExperienceEngine MUST bootstrap SQLite successfully when executed from a compiled CLI or hook entrypoint.

#### Scenario: Module-local built schema asset exists

- **WHEN** a built runtime executes from `dist/**`
- **THEN** SQLite bootstrap resolves `schema.sql` from the executing module directory
- **AND** database initialization succeeds without consulting source-only paths

#### Scenario: Built runtime falls back to package-local source schema

- **WHEN** a built runtime executes from `dist/**`
- **AND** `dist/store/sqlite/schema.sql` is unavailable
- **THEN** SQLite bootstrap resolves `src/store/sqlite/schema.sql` from the same package root
- **AND** database initialization still succeeds

#### Scenario: Schema asset is missing from all known package locations

- **WHEN** neither module-local nor package-local schema assets exist
- **THEN** ExperienceEngine raises an explicit error naming the checked schema paths
