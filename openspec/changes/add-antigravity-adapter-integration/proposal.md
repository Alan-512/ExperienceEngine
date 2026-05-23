# Change Proposal: Add Antigravity Adapter Integration

## Why

Antigravity has at least three distinct product entries in local use: Antigravity Agent Desktop, a separate Antigravity IDE shell, and the standalone `agy` CLI. This change targets Antigravity Agent Desktop and `agy` when launched with a project directory. The integration still must preserve ExperienceEngine's reliability boundary: MCP is a structured in-session interaction surface, while hooks or wrapper ownership must provide the automatic lifecycle path.

ExperienceEngine now has real-host validation for Antigravity Agent Desktop hooks and headless `agy` runs with `--add-dir <project-path>`. The implementation should claim lifecycle support only for those validated surfaces, keep the separate IDE out of scope, and distinguish user-level EE install from project-level Antigravity activation.

## What Changes

- Keep the hook contract spike as an install-time guard, backed by the real Agent Desktop validation evidence for `PreInvocation`, `PreToolUse`, `PostToolUse`, and `Stop`.
- Add a host-neutral shared MCP server surface suitable for Antigravity MCP registration without Codex-specific naming.
- Add Antigravity Agent Desktop installer and doctor requirements that configure both MCP and validated native hooks by default, with `--mcp-only` as the explicit fallback.
- Report `agy` availability separately from the PATH-visible `antigravity` IDE command, and document `agy --add-dir <project-path>` as the validated Windows CLI invocation shape.
- Add `ee agy exec -C <project>` as the wrapper that auto-activates project wiring and supplies `--add-dir`.
- Add `ee antigravity activate-project -C <project>` as the explicit Agent Desktop project activation fallback when no supported global Antigravity hook surface is verified.
- Add artifact-assisted attribution requirements that treat Antigravity artifacts as supplemental evidence, not as the primary runtime loop.
- Mark the Antigravity IDE as out of scope.

## Impact

- Antigravity Agent Desktop integration proceeds with MCP plus validated native hooks by default; `mcp_only` remains an explicit fallback mode.
- Operators and future implementers get clear status language such as `MCP registered`, `Hooks registered`, `Lifecycle mode: host_native_hooks_validated`, and `Lifecycle mode: mcp_only`.
- Native lifecycle claims are limited to the validated Agent Desktop project activation and `ee agy exec -C <project>` surfaces; the IDE remains separate future work.
- EE data remains user-level and project experiences remain scope-isolated, even when Antigravity requires project-local activation files.
