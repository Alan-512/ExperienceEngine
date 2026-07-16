## Why

A reviewed diagnostic manifest is not safely shareable until ExperienceEngine proves the review directory contains only the validated manifest and creates an archive without shell-specific behavior, path traversal, symlink inclusion, extra files, or overwrite.

## What Changes

- Validate the exact one-file diagnostic review directory.
- Add explicit `ee diagnose --archive <review-directory>` behavior.
- Create a deterministic `.tar.gz` containing only `manifest.json` through a maintained library.
- Reject unknown/unsafe manifest edits, extra files, symlinks, path escapes, and existing output paths.
- Report archive digest and size without uploading it.
- Include the archive dependency in runtime/package closure and published-artifact validation.

## Capabilities

### New Capabilities

- `diagnostic-review-archive`: Exact review-directory validation and deterministic explicit diagnostic archive creation.

### Modified Capabilities

- `cli-user-experience-surface`: Add the explicit reviewed archive command and local-only output.

## Impact

- Depends on `add-safe-diagnostic-manifest`.
- Expected code areas: diagnostic validator/archive service, CLI dispatch, package dependencies/closure, tests, and docs.
- No upload, issue creation, or runtime authority mutation is permitted.
