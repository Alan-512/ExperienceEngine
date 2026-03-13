## Why

ExperienceEngine now exposes MCP-native read surfaces and low-risk control tools, but the high-impact operational actions are still CLI-only. The long-term design already calls for these actions to be MCP-accessible with stronger safeguards than ordinary tools.

## What Changes

- Add MCP tools that plan high-impact operations before execution
- Add explicit confirm-gated MCP execution for supported operations
- Keep CLI as fallback while making agent-session operational workflows possible

## Impact

- Affects the shared MCP server and operational service layer
- Adds safe MCP entrypoints for install, repair, and upgrade workflows
- Makes the MCP-native interaction design closer to complete without weakening safeguards
