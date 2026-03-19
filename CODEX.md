# ExperienceEngine Operator Memory

## Critical OpenClaw Reinstall Safety

- Never run `ee install openclaw` or `ee repair openclaw` against an OpenClaw `installPath` or `sourcePath` that points at a live git working tree or active project checkout.
- Never recursively delete an OpenClaw plugin path until it has been verified that the target is a disposable packaged install artifact, not a source repository.
- If `doctor openclaw` or OpenClaw plugin info reports a path under an active repo such as `/mnt/d/project/...`, stop and investigate before reinstalling or repairing.
- Preferred install path: build a packaged install artifact first, then install that artifact into OpenClaw. Do not use the source repo root as the install medium.

## Incident Record

- A previous `repair openclaw` path-based reinstall deleted the active ExperienceEngine working directory because the recorded OpenClaw plugin install path pointed at the live repo.
- Treat any future OpenClaw reinstall/delete operation as high risk until path safety has been explicitly validated.
