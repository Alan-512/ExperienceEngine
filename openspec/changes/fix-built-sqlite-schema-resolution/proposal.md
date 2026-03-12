## Why

Real Claude Code `SessionEnd` validation exposed a packaging/runtime defect in ExperienceEngine's built CLI. The compiled runtime bootstraps SQLite by reading `dist/store/sqlite/schema.sql`, but the build output does not currently include that asset. As a result, real hook execution can succeed through `UserPromptSubmit` and then fail on finalize with `ENOENT`, blocking end-to-end validation.

## What Changes

- Define the requirement that built ExperienceEngine runtimes resolve the SQLite schema asset reliably.
- Update the SQLite bootstrap path resolution so built CLI executions can fall back to a package-local source schema when needed.
- Ensure the build output includes `dist/store/sqlite/schema.sql`.
- Add regression coverage for schema path resolution and keep the full check suite green.

## Impact

- Unblocks real Claude `SessionEnd` runtime validation.
- Prevents built CLI / hook commands from crashing on first database bootstrap.
- Improves packaging robustness for OpenClaw and future adapter installs.
