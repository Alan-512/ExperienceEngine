import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type {
  MaterializedPublishedArtifact
} from "../../src/runtime/distribution/artifact-materializer.js";
import {
  createNpmPublishedArtifactInstaller,
  resolveNpmCliEntrypoint,
  type NpmCliInvocation
} from "../../src/runtime/distribution/npm-artifact-installer.js";

const temporaryRoots: string[] = [];

const makeTempRoot = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "ee-npm-installer-"));
  temporaryRoots.push(root);
  return root;
};

const artifactAt = (artifactPath: string): MaterializedPublishedArtifact => ({
  published_channel: "npm",
  package_name: "@alan512/experienceengine",
  package_version: "0.4.8",
  artifact_path: artifactPath,
  artifact_integrity: "sha512-fixture",
  artifact_size: 123,
  registry_record_identity: "npm:fixture",
  materialized_at: "2026-07-13T12:00:00.000Z"
});

afterEach(async () => {
  while (temporaryRoots.length > 0) {
    await rm(temporaryRoots.pop()!, { recursive: true, force: true });
  }
});

describe("published npm artifact installer", () => {
  it("runs npm through Node with isolated config and verifies exact identity", async () => {
    const root = await makeTempRoot();
    const archive = join(root, "artifact.tgz");
    await writeFile(archive, "fixture", "utf8");
    let invocation: NpmCliInvocation | undefined;
    const installer = createNpmPublishedArtifactInstaller({
      execPath: "C:/node/node.exe",
      npmCliPath: "C:/node/node_modules/npm/bin/npm-cli.js",
      env: { PATH: "fixture-path", NODE_PATH: "unsafe-global-path" },
      runner: async (input) => {
        invocation = input;
        const packageRoot = join(
          input.cwd,
          "node_modules",
          "@alan512",
          "experienceengine"
        );
        await mkdir(packageRoot, { recursive: true });
        await writeFile(join(packageRoot, "package.json"), JSON.stringify({
          name: "@alan512/experienceengine",
          version: "0.4.8"
        }), "utf8");
        return { stdout: "installed", stderr: "" };
      }
    });
    const installed = await installer({
      artifact: artifactAt(archive),
      installRoot: join(root, "install")
    });
    expect(installed.packageRoot).toBe(join(
      root,
      "install",
      "node_modules",
      "@alan512",
      "experienceengine"
    ));
    expect(invocation?.executable).toBe("C:/node/node.exe");
    expect(invocation?.args).toEqual(expect.arrayContaining([
      "C:/node/node_modules/npm/bin/npm-cli.js",
      "install",
      "--ignore-scripts",
      "--cache",
      join(root, "install", ".npm-cache"),
      "--userconfig",
      join(root, "install", ".npmrc"),
      archive
    ]));
    expect(invocation?.env.NODE_PATH).toBe("");
  });

  it("rejects an installed package identity mismatch", async () => {
    const root = await makeTempRoot();
    const archive = join(root, "artifact.tgz");
    await writeFile(archive, "fixture", "utf8");
    const installer = createNpmPublishedArtifactInstaller({
      npmCliPath: "C:/node/npm-cli.js",
      runner: async (input) => {
        const packageRoot = join(
          input.cwd,
          "node_modules",
          "@alan512",
          "experienceengine"
        );
        await mkdir(packageRoot, { recursive: true });
        await writeFile(join(packageRoot, "package.json"), JSON.stringify({
          name: "@alan512/experienceengine",
          version: "0.4.9"
        }), "utf8");
        return { stdout: "", stderr: "" };
      }
    });
    await expect(installer({
      artifact: artifactAt(archive),
      installRoot: join(root, "install")
    })).rejects.toMatchObject({
      code: "EE_PUBLISHED_ARTIFACT_VERSION_INVALID"
    });
  });

  it("resolves only an existing npm CLI entrypoint", () => {
    expect(resolveNpmCliEntrypoint({
      execPath: "C:/node/node.exe",
      env: {},
      exists: (path) => path.endsWith("node_modules\\npm\\bin\\npm-cli.js")
    })).toContain("node_modules\\npm\\bin\\npm-cli.js");
  });
});
