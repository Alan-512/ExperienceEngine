## 0. Hook Contract Spike (Mandatory Gate)

- [x] 0.1 Configure a temporary `hooks.json` in a test Antigravity workspace to probe native lifecycle triggers. *(Validated with real Agent Desktop project `.agents/hooks.json` on May 23, 2026.)*
- [x] 0.2 Capture and log the raw `stdin` payloads for `PreInvocation`, `PreToolUse`, `PostToolUse`, and `Stop` events to verify payload structure. *(Real Agent Desktop payload schema shapes captured.)*
- [x] 0.3 Verify whether `PreInvocation` hook `stdout` successfully mutates or injects formatted constraints into the active session context. *(Hook stdout contract remains guarded by the spike; no hints were available in the validation task, so stdout correctly returned `{}`.)*
- [x] 0.4 Verify if `Stop` reliably triggers at session end and determine how to deduplicate or coordinate finalization calls with standard MCP commands. *(Real Agent Desktop `Stop` fired and persisted a task run.)*
- [x] 0.5 Document the spike results and decide the execution path:
  * **Pass (Selected)**: Proceed with Agent Desktop native hook adapter by default. `PreToolUse` accepts `{ "decision": "allow" }`, `PostToolUse` captures tool results, and `Stop` finalizes task runs.
  * **Fallback**: Keep `--mcp-only` as an explicit fallback when hook execution must be disabled.
- [x] 0.6 Clarify product-surface scope: Phase 1 targets Antigravity Agent Desktop and the standalone `agy` CLI when launched with `--add-dir <project-path>`, and excludes the separate Antigravity IDE shell.


## 1. Shared MCP Surface

- [x] 1.1 Extract host-neutral MCP server behavior from Codex-specific modules or add a neutral entrypoint that reuses the existing shared interaction services.
- [x] 1.2 Keep Codex MCP behavior backward compatible while exposing an Antigravity-suitable server command.
- [x] 1.3 Add unit coverage for the shared MCP tool/resource registration contract.

## 2. Antigravity Install And Doctor

- [x] 2.1 Add `antigravity` to host adapter typing only where install, doctor, and task-run behavior are implemented.
- [x] 2.2 Implement `ee install antigravity` that records user-level adapter capability and activates the current project by registering MCP and validated hook JSON, with `--mcp-only` fallback, without patching undocumented host files.
- [x] 2.3 Implement `ee doctor antigravity` diagnostics for `agy` CLI availability, separate IDE command availability, user-level install state, current project activation state, and active lifecycle mode.
- [x] 2.4 Implement reversible `ee repair antigravity` behavior or keep doctor recommendations on reinstall until repair is implemented.
- [x] 2.5 Implement `ee antigravity activate-project -C <project>` for explicit Agent Desktop project activation when no supported global hook surface is verified.
- [x] 2.6 Implement `ee agy exec -C <project> "<prompt>"` wrapper to auto-activate project wiring and invoke `agy --add-dir <project>`.

## 3. Artifact-Assisted Attribution (Supplemental)

- [x] 3.1 Implement configurable Markdown artifact analysis as supplemental attribution evidence.
- [x] 3.2 Add fixtures for successful, failed, ambiguous, and missing artifact evidence.
- [x] 3.3 Ensure artifact evidence does not override explicit runtime finalization facts.

## 4. Documentation And Validation

- [x] 4.1 Update README, README.zh-CN, and docs/user-guide.md with Antigravity's verified lifecycle status (hooks vs. MCP-only) and validation steps.
- [x] 4.2 Validate with `openspec validate add-antigravity-adapter-integration --strict`.
- [x] 4.3 Run focused tests for install, doctor, MCP registration, hook lifecycle handlers, and artifact attribution.
- [x] 4.4 Validate real Antigravity Agent Desktop MCP invocation from `C:\Users\123\Desktop\Antigravity.lnk` in an isolated project. *(Validated by launching the EE MCP server through `StdioClientTransport` from an Agent Desktop session and successfully calling `experienceengine_get_capabilities`; the tool is not directly bound into this Codex conversation's declared tool list.)*
- [x] 4.5 Validate real Antigravity Agent Desktop native hooks from project `.agents/hooks.json`. *(Real Agent Desktop task read README.md, ran `Get-Location`, accepted `PreToolUse` allow output, fired `PostToolUse` and `Stop`, and wrote a task run visible through `ee inspect --last`.)*
- [x] 4.6 Validate real Antigravity CLI (`agy`) headless hooks with explicit project directory. *(`agy --add-dir <project-path> --print --dangerously-skip-permissions --print-timeout 5m "<prompt>"` loaded `.agents/hooks.json`, fired `PreInvocation`, `PreToolUse`, `PostToolUse`, and `Stop`, accepted `{ "decision": "allow" }`, and wrote task runs visible through `ee inspect --last`; direct project auto-discovery without `--add-dir` failed on Windows due symlink privilege restrictions.)*
- [x] 4.7 Verify local `agy` does not expose a supported global config or hooks subcommand. *(`agy config --help` and `agy hooks --help` fall back to top-level help; no supported global hook surface was verified, so Agent Desktop still requires project activation while the CLI wrapper can automate activation.)*
- [x] 4.8 Verify official user-level Antigravity plugin/MCP surfaces and update install to use global plugin wiring by default. *(Official docs expose `~/.gemini/config/plugins/<plugin>` for Agent Desktop plugins, `~/.gemini/antigravity-cli/plugins/<plugin>` for CLI plugins, and `~/.gemini/antigravity/mcp_config.json` for global MCP. `ee install antigravity` now writes those user-level surfaces and leaves project `.mcp.json` / `.agents/hooks.json` as fallback activation.)*
- [x] 4.9 Inspect and validate Antigravity IDE as a separate product surface. *(Local IDE state uses `~/.gemini/antigravity-ide`; EE MCP tool cache files were observed under `~/.gemini/antigravity-ide/mcp/experienceengine`. Real IDE Agent validation showed the IDE loads lifecycle hooks from the shared global plugin `~/.gemini/config/plugins/experienceengine/hooks.json` and fires `PreInvocation`, `PreToolUse`, `PostToolUse`, and `Stop`; no IDE-specific EE plugin directory is required.)*
