## Design

OpenClaw stores install metadata under `plugins.installs.<id>`. For ExperienceEngine, current installs are `source: "path"` with a copied install directory. `openclaw plugins update <id>` is documented to update npm installs only, so using it for path installs is semantically wrong and leaves the copied extension stale.

The installer will infer one of three actions:
- `install` when no tracked install exists
- `reinstall` when the tracked install is path-based or when metadata is incomplete but an install path exists
- `update` only for tracked npm installs

`reinstall` will issue `openclaw plugins install <current-package-root>` before re-enabling the plugin and rewriting plugin config.
