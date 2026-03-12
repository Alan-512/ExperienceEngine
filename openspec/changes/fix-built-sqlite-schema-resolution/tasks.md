## 1. Spec

- [x] 1.1 Add an OpenSpec delta for built SQLite schema resolution in `experienceengine-core`
- [x] 1.2 Document the runtime fallback order for schema asset discovery

## 2. Implementation

- [x] 2.1 Add schema-path resolution logic that works in both source and built runtimes
- [x] 2.2 Ensure the build output includes `dist/store/sqlite/schema.sql`

## 3. Validation

- [x] 3.1 Add regression coverage for schema asset resolution
- [x] 3.2 Run `pnpm check`
- [x] 3.3 Re-run the minimal real Claude live validation and confirm `SessionEnd` no longer fails on missing schema
