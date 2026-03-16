## Why

Real OpenClaw host evaluation showed that `ee upgrade openclaw` leaves the installed extension on stale code. The host's `plugins update` command only applies to npm installs, while ExperienceEngine uses a local path install.

## What Changes

- Treat existing path-based OpenClaw installs as reinstall operations from the current package root
- Preserve npm update behavior only for future npm-based installs
- Add tests covering reinstall selection and real install metadata drift

## Impact

- `ee install openclaw` and `ee upgrade openclaw` refresh the copied extension with current repo contents
- Real OpenClaw evaluation uses the same runtime code as the repo HEAD
