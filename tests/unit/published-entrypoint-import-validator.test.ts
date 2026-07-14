import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type {
  RuntimeClosureManifest
} from "../../src/runtime/identity/types.js";
import {
  validatePublishedEntrypointImports,
  type EntrypointImportInvocation
} from "../../src/runtime/distribution/entrypoint-import-validator.js";

const temporaryRoots: string[] = [];

const makeTempRoot = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "ee-entrypoint-import-"));
  temporaryRoots.push(root);
  return root;
};

const manifestWith = (
  requiredEntrypoints: RuntimeClosureManifest["required_entrypoints"]
): RuntimeClosureManifest => ({
  closure_manifest_version: "runtime-closure-v1",
  package_name: "@alan512/experienceengine",
  package_version: "0.4.9",
  package_build_id: "build-fixture",
  required_entrypoints: requiredEntrypoints,
  required_runtime_files: [],
  required_schema_and_migrations: [],
  profile_registry_digest: "profile-fixture",
  dependency_requirements_digest: "dependencies-fixture",
  compatibility_metadata_digest: "compatibility-fixture",
  closure_manifest_digest: "closure-fixture"
});

afterEach(async () => {
  while (temporaryRoots.length > 0) {
    await rm(temporaryRoots.pop()!, { recursive: true, force: true });
  }
});

describe("published entrypoint import validator", () => {
  it("imports only manifest-declared entrypoints with global Node resolution disabled", async () => {
    const root = await makeTempRoot();
    const entrypoint = join(root, "dist", "plugin.js");
    await mkdir(join(root, "dist"), { recursive: true });
    await writeFile(entrypoint, "export const ready = true;", "utf8");
    const invocations: EntrypointImportInvocation[] = [];
    const report = await validatePublishedEntrypointImports({
      packageRoot: root,
      manifest: manifestWith([{
        role: "openclaw_plugin",
        path: "dist/plugin.js",
        sha256: "fixture"
      }]),
      env: {
        NODE_PATH: "unsafe-global-modules",
        NODE_OPTIONS: "--require unsafe-global-hook"
      },
      runner: async (invocation) => {
        invocations.push(invocation);
      }
    });
    expect(report).toMatchObject({
      valid: true,
      issues: [],
      records: [{
        role: "openclaw_plugin",
        path: "dist/plugin.js",
        status: "passed",
        failure_code: null
      }]
    });
    expect(invocations).toHaveLength(1);
    expect(invocations[0].cwd).toBe(root);
    expect(invocations[0].env.NODE_PATH).toBe("");
    expect(invocations[0].env.NODE_OPTIONS).toBe("");
    expect(invocations[0].env.EXPERIENCE_ENGINE_ENTRYPOINT_IMPORT_TARGET)
      .toBe(entrypoint);
  });

  it("rejects a missing entrypoint with a stable path-free failure", async () => {
    const root = await makeTempRoot();
    const report = await validatePublishedEntrypointImports({
      packageRoot: root,
      manifest: manifestWith([{
        role: "package_local_worker",
        path: "dist/runtime/package/worker-entrypoint.js",
        sha256: "fixture"
      }])
    });
    expect(report).toMatchObject({
      valid: false,
      issues: [
        "package_local_worker:EE_PUBLISHED_ENTRYPOINT_MISSING"
      ]
    });
    expect(JSON.stringify(report)).not.toContain(root);
  });

  it("rejects entrypoint traversal before invoking Node", async () => {
    const root = await makeTempRoot();
    let invoked = false;
    const report = await validatePublishedEntrypointImports({
      packageRoot: root,
      manifest: manifestWith([{
        role: "package_local_supervisor",
        path: "../supervisor.js",
        sha256: "fixture"
      }]),
      runner: async () => {
        invoked = true;
      }
    });
    expect(invoked).toBe(false);
    expect(report).toMatchObject({
      valid: false,
      issues: [
        "package_local_supervisor:EE_PUBLISHED_ARTIFACT_INSTALL_INVALID"
      ]
    });
    expect(report.records[0].path).toMatch(
      /^invalid-entrypoint-path:[a-f0-9]{64}$/u
    );
  });

  it("fingerprints an absolute manifest path instead of persisting it", async () => {
    const root = await makeTempRoot();
    const absolutePath = join(root, "outside", "worker.js");
    const report = await validatePublishedEntrypointImports({
      packageRoot: root,
      manifest: manifestWith([{
        role: "package_local_worker",
        path: absolutePath,
        sha256: "fixture"
      }])
    });
    expect(report.valid).toBe(false);
    expect(report.records[0].path).toMatch(
      /^invalid-entrypoint-path:[a-f0-9]{64}$/u
    );
    expect(JSON.stringify(report)).not.toContain(absolutePath);
  });

  it("maps child import failure without persisting stderr or absolute paths", async () => {
    const root = await makeTempRoot();
    const entrypoint = join(root, "dist", "worker.js");
    await mkdir(join(root, "dist"), { recursive: true });
    await writeFile(entrypoint, "throw new Error('secret local path');", "utf8");
    const report = await validatePublishedEntrypointImports({
      packageRoot: root,
      manifest: manifestWith([{
        role: "package_local_worker",
        path: "dist/worker.js",
        sha256: "fixture"
      }]),
      runner: async () => {
        throw new Error(`import failed at ${entrypoint}`);
      }
    });
    expect(report).toMatchObject({
      valid: false,
      issues: [
        "package_local_worker:EE_PUBLISHED_ENTRYPOINT_IMPORT_FAILED"
      ]
    });
    expect(JSON.stringify(report)).not.toContain(root);
    expect(JSON.stringify(report)).not.toContain("secret local path");
  });
});
