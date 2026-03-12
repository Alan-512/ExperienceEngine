## 1. Spec And Source Definition

- [x] 1.1 Add OpenSpec requirements for remote release discovery in `ee doctor`
- [x] 1.2 Declare GitHub Releases as the phase-two remote version source

## 2. Remote Version Resolver

- [x] 2.1 Add repository metadata and GitHub owner/repo resolution
- [x] 2.2 Add a short-timeout latest-release resolver with graceful fallback

## 3. Doctor Integration

- [x] 3.1 Extend `ee doctor` to print latest remote version and remote update availability
- [x] 3.2 Keep host-specific upgrade guidance distinct from package-update guidance

## 4. Validation

- [x] 4.1 Add tests for repository parsing, remote release parsing, and doctor output behavior
- [x] 4.2 Run `pnpm check` and `openspec validate --changes --strict`
