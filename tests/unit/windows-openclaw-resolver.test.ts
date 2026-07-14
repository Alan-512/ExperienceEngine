import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  WINDOWS_OPENCLAW_RESOLVER_CONTRACT,
  invokeResolvedWindowsOpenClaw,
  probeWindowsOpenClawVersion,
  resolveWindowsOpenClawExecutable,
  type WindowsOpenClawExecutor
} from "../../src/install/windows-openclaw-resolver.js";

const roots: string[] = [];

const makeRoot = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "ee-windows-openclaw-"));
  roots.push(root);
  return root;
};

afterEach(async () => {
  while (roots.length > 0) {
    await rm(roots.pop()!, { recursive: true, force: true });
  }
});

describe("Windows OpenClaw resolver", () => {
  it("prefers the operator-configured supported executable", async () => {
    const root = await makeRoot();
    const configured = join(root, "configured", "openclaw.cmd");
    const pathCandidate = join(root, "path", "openclaw.exe");
    await mkdir(join(root, "configured"), { recursive: true });
    await mkdir(join(root, "path"), { recursive: true });
    await writeFile(configured, "@echo off\r\n", "utf8");
    await writeFile(pathCandidate, "fixture", "utf8");
    await chmod(configured, 0o755);
    await chmod(pathCandidate, 0o755);
    expect(resolveWindowsOpenClawExecutable({
      operatorConfiguredPath: configured,
      env: {
        PATH: join(root, "path"),
        PATHEXT: ".EXE;.CMD"
      }
    })).toEqual({
      path: configured,
      source: "operator_configured_path",
      extension: ".cmd"
    });
  });

  it("searches PATHEXT forms without accepting an extensionless file", async () => {
    const root = await makeRoot();
    const pathDir = join(root, "bin");
    await mkdir(pathDir, { recursive: true });
    await writeFile(join(pathDir, "openclaw"), "not sufficient", "utf8");
    await writeFile(join(pathDir, "openclaw.bat"), "@echo off\r\n", "utf8");
    const resolved = resolveWindowsOpenClawExecutable({
      env: { PATH: pathDir, PATHEXT: ".BAT" }
    });
    expect(resolved.extension).toBe(".bat");
    expect(resolved.path).toBe(join(pathDir, "openclaw.bat"));
  });

  it("invokes batch shims through fixed cmd.exe arguments without shell concatenation", () => {
    const executor = vi.fn<WindowsOpenClawExecutor>(() => "OpenClaw 2026.4.1");
    const output = invokeResolvedWindowsOpenClaw({
      executable: {
        path: "C:\\Program Files\\OpenClaw & Tools\\openclaw.cmd",
        source: "operator_configured_path",
        extension: ".cmd"
      },
      args: ["plugins", "info", "experienceengine"],
      env: { ComSpec: "C:\\Windows\\System32\\cmd.exe" },
      executor
    });
    expect(output).toBe("OpenClaw 2026.4.1");
    expect(executor).toHaveBeenCalledOnce();
    const invocation = executor.mock.calls[0][0];
    expect(invocation.file).toBe("C:\\Windows\\System32\\cmd.exe");
    expect(invocation.args.slice(0, 3)).toEqual(["/d", "/s", "/c"]);
    expect(invocation.args[3]).toContain('"C:\\Program Files\\OpenClaw & Tools\\openclaw.cmd"');
  });

  it("records a bounded version-probe evidence record", async () => {
    const root = await makeRoot();
    const executablePath = join(root, "openclaw.exe");
    await writeFile(executablePath, "fixture", "utf8");
    const result = probeWindowsOpenClawVersion({
      operatorConfiguredPath: executablePath,
      executor: () => "OpenClaw 2026.4.1 (fixture)\n",
      env: {}
    });
    expect(result.version).toBe("OpenClaw 2026.4.1 (fixture)");
    expect(result.record).toMatchObject({
      resolution_source: "operator_configured_path",
      resolved_extension: ".exe",
      version_probe_status: "passed"
    });
    expect(result.record.resolved_executable_path_fingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(result.record.version_probe_output_digest).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("freezes bounded fallback behavior", () => {
    expect(WINDOWS_OPENCLAW_RESOLVER_CONTRACT).toMatchObject({
      extensionless_lookup_is_sufficient: false,
      broad_shell_true_allowed: false,
      batch_invocation_uses_fixed_cmd_arguments: true,
      canonical_package_local_activation_depends_on_resolver: false
    });
  });
});
