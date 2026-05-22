## 0. Hook Contract Spike (Mandatory Gate)

- [ ] 0.1 Configure a temporary `hooks.json` in a test Antigravity workspace to probe native lifecycle triggers.
- [ ] 0.2 Capture and log the raw `stdin` payloads for `PreInvocation`, `PostToolUse`, and `Stop` events to verify payload structure.
- [ ] 0.3 Verify whether `PreInvocation` hook `stdout` successfully mutates or injects formatted constraints into the active session context.
- [ ] 0.4 Verify if `Stop` reliably triggers at session end and determine how to deduplicate or coordinate finalization calls with standard MCP commands.
- [ ] 0.5 Document the spike results and decide the execution path:
  * **Pass**: Proceed to implement native hook adapter (Phase 2 & 3).
  * **Fail**: Fall back to MCP-only mode (Phase 1) or SDK/CLI wrapper, and update the specifications to reflect `mcp_only`.

## 1. Shared MCP Surface

- [ ] 1.1 Extract host-neutral MCP server behavior from Codex-specific modules or add a neutral entrypoint that reuses the existing shared interaction services.
- [ ] 1.2 Keep Codex MCP behavior backward compatible while exposing an Antigravity-suitable server command.
- [ ] 1.3 Add unit coverage for the shared MCP tool/resource registration contract.

## 2. Antigravity Install And Doctor

- [ ] 2.1 Add `antigravity` to host adapter typing only where install, doctor, and task-run behavior are implemented.
- [ ] 2.2 Implement conservative `ee install antigravity` that registers MCP (and conditionally hook JSON if Phase 0 passes) without patching undocumented host files.
- [ ] 2.3 Implement `ee doctor antigravity` diagnostics for CLI availability, install state, MCP registration, hook wiring state, and active lifecycle mode.
- [ ] 2.4 Implement reversible `ee repair antigravity` behavior or keep doctor recommendations on reinstall until repair is implemented.

## 3. Artifact-Assisted Attribution (Supplemental)

- [ ] 3.1 Implement configurable Markdown artifact analysis as supplemental attribution evidence.
- [ ] 3.2 Add fixtures for successful, failed, ambiguous, and missing artifact evidence.
- [ ] 3.3 Ensure artifact evidence does not override explicit runtime finalization facts.

## 4. Documentation And Validation

- [ ] 4.1 Update README, README.zh-CN, and docs/user-guide.md with Antigravity's verified lifecycle status (hooks vs. MCP-only) and validation steps.
- [ ] 4.2 Validate with `openspec validate add-antigravity-adapter-integration --strict`.
- [ ] 4.3 Run focused tests for install, doctor, MCP registration, hook lifecycle handlers, and artifact attribution.
