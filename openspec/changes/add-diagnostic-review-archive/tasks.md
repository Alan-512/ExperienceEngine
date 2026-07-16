## 1. Review Directory Validation

- [x] 1.1 Add exact directory/file/link/path validation.
- [x] 1.2 Revalidate the edited strict diagnostic manifest at archive time.
- [x] 1.3 Reject unknown fields, unsafe consent state, extra entries, and overwrite.

## 2. Deterministic Archive

- [x] 2.1 Add and package a maintained archive dependency.
- [x] 2.2 Create normalized deterministic `.tar.gz` output containing only `manifest.json`.
- [x] 2.3 Write atomically and report SHA-256 plus byte size.
- [x] 2.4 Wire `ee diagnose --archive <review-directory>` and optional output path.

## 3. Validation

- [x] 3.1 Add traversal, link, extra-file, malformed-manifest, and overwrite negative fixtures.
- [x] 3.2 Add deterministic archive/content verification fixtures.
- [x] 3.3 Validate package closure and installed local-pack behavior.
- [x] 3.4 Run full tests, build, strict OpenSpec, and runtime closure gates.

## Acceptance Evidence

- `review-validator.ts` accepts only a real non-linked directory with one regular `manifest.json`, enforces containment and a bounded file size, and strict-validates the exact edited manifest immediately before archive creation.
- `archive.ts` uses the maintained `tar` dependency, fixed metadata, portable mode, one explicit entry, sibling candidate files, fsync, atomic hard-link commit, and no-overwrite semantics.
- Focused D1+D2 tests passed `5` files / `23` tests, including byte-identical repeated archives, exact entry/content verification, extra-file rejection, linked root/manifest/output rejection, unknown/privacy-inconsistent manifest rejection, overwrite preservation, and CLI mode separation.
- Real source CLI prepare/review/archive smoke passed on an empty home: no runtime home was created, the review directory contained only `manifest.json`, and the archive entry list was exactly `["manifest.json"]`.
- Full repository validation passed `236` test files / `1470` tests, TypeScript, and production build.
- Runtime closure validation passed with digest `1d3ef09ef3c718b3d7b331d02142c3630dce71421d693867d79e0eb841f2db16` and build id `build_76a218de89e46fb2473195b12b9ff1b335688b3f7dbc3ff350d7cb5495403c30`; the digest changed intentionally because `tar` is now a packaged runtime dependency.
- OpenClaw package-local production binding passed unchanged and continued to report `production_learning_ready=false`.
- A clean npm local-pack install added `100` dependency packages, resolved `tar` from the isolated install tree, and successfully ran the installed CLI prepare/archive flow with `HOME_CREATED=False`. The packed artifact includes the archive and validator entrypoints.
- The installed archive entry list was exactly `["manifest.json"]`. No upload or issue submission capability exists.
- D2 strict OpenSpec and `git diff --check` passed.
