## 1. Review Directory Validation

- [ ] 1.1 Add exact directory/file/link/path validation.
- [ ] 1.2 Revalidate the edited strict diagnostic manifest at archive time.
- [ ] 1.3 Reject unknown fields, unsafe consent state, extra entries, and overwrite.

## 2. Deterministic Archive

- [ ] 2.1 Add and package a maintained archive dependency.
- [ ] 2.2 Create normalized deterministic `.tar.gz` output containing only `manifest.json`.
- [ ] 2.3 Write atomically and report SHA-256 plus byte size.
- [ ] 2.4 Wire `ee diagnose --archive <review-directory>` and optional output path.

## 3. Validation

- [ ] 3.1 Add traversal, link, extra-file, malformed-manifest, and overwrite negative fixtures.
- [ ] 3.2 Add deterministic archive/content verification fixtures.
- [ ] 3.3 Validate package closure and installed local-pack behavior.
- [ ] 3.4 Run full tests, build, strict OpenSpec, and runtime closure gates.
