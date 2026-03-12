## Design Summary

The SQLite bootstrap layer should not assume a single runtime layout. During local source execution, `schema.sql` lives beside `src/store/sqlite/db.ts`; during compiled execution, it should live beside `dist/store/sqlite/db.js`; and during mixed local-package execution, a built entrypoint may still need to fall back to the package's source asset.

## Resolution Strategy

1. Add a schema-path resolver in `src/store/sqlite/db.ts` that checks candidate locations in priority order:
   - the current module directory (`schema.sql` beside the executing module)
   - the package-local source path (`src/store/sqlite/schema.sql`)
2. If neither exists, throw an explicit error listing checked paths.
3. Update the build flow to copy `src/store/sqlite/schema.sql` into `dist/store/sqlite/schema.sql`.
4. Add unit coverage for:
   - choosing the module-local schema when present
   - falling back to the package-local source schema when the built asset is missing

## Scope Control

This change does not alter the database schema itself, storage layout, or runtime service behavior. It only fixes schema asset discovery and build packaging so existing runtimes continue to behave the same once bootstrapped.
