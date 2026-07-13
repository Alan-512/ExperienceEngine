import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  installMaterializedPublishedArtifact,
  materializeExactClawHubArtifact,
  materializeExactNpmArtifact
} from "../../src/runtime/distribution/artifact-materializer.js";
import {
  PublishedRuntimeClosureError
} from "../../src/runtime/distribution/contract.js";

const temporaryRoots: string[] = [];

const makeTempRoot = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "ee-published-artifact-"));
  temporaryRoots.push(root);
  return root;
};

const sri = (bytes: Uint8Array): string =>
  `sha512-${createHash("sha512").update(bytes).digest("base64")}`;

afterEach(async () => {
  while (temporaryRoots.length > 0) {
    await rm(temporaryRoots.pop()!, { recursive: true, force: true });
  }
});

describe("published artifact materialization", () => {
  it("downloads one exact npm version, verifies SRI, and writes only the downloaded bytes", async () => {
    const root = await makeTempRoot();
    const bytes = new TextEncoder().encode("npm-artifact-bytes");
    const integrity = sri(bytes);
    const requests: string[] = [];
    const artifact = await materializeExactNpmArtifact({
      packageName: "@alan512/experienceengine",
      packageVersion: "0.4.8",
      destinationDirectory: join(root, "download"),
      registryBaseUrl: "https://registry.example.test",
      fetchImpl: async (input) => {
        const url = String(input);
        requests.push(url);
        if (url.includes("registry.example.test")) {
          return new Response(JSON.stringify({
            name: "@alan512/experienceengine",
            version: "0.4.8",
            dist: {
              tarball: "https://cdn.example.test/experienceengine-0.4.8.tgz",
              integrity
            }
          }), {
            status: 200,
            headers: { "content-type": "application/json" }
          });
        }
        return new Response(bytes, { status: 200 });
      },
      now: () => new Date("2026-07-13T12:00:00.000Z")
    });
    expect(requests).toEqual([
      "https://registry.example.test/%40alan512%2Fexperienceengine/0.4.8",
      "https://cdn.example.test/experienceengine-0.4.8.tgz"
    ]);
    expect(artifact).toMatchObject({
      published_channel: "npm",
      package_name: "@alan512/experienceengine",
      package_version: "0.4.8",
      artifact_integrity: integrity,
      artifact_size: bytes.length,
      materialized_at: "2026-07-13T12:00:00.000Z"
    });
  });

  it("rejects npm metadata version drift and downloaded-byte integrity mismatch", async () => {
    const root = await makeTempRoot();
    await expect(materializeExactNpmArtifact({
      packageName: "@alan512/experienceengine",
      packageVersion: "0.4.8",
      destinationDirectory: join(root, "version-drift"),
      fetchImpl: async () => new Response(JSON.stringify({
        name: "@alan512/experienceengine",
        version: "0.4.9",
        dist: {
          tarball: "https://cdn.example.test/wrong.tgz",
          integrity: sri(new Uint8Array([1]))
        }
      }), { status: 200 })
    })).rejects.toMatchObject({
      code: "EE_PUBLISHED_ARTIFACT_VERSION_INVALID"
    });

    let call = 0;
    await expect(materializeExactNpmArtifact({
      packageName: "@alan512/experienceengine",
      packageVersion: "0.4.8",
      destinationDirectory: join(root, "integrity-drift"),
      fetchImpl: async () => {
        call += 1;
        return call === 1
          ? new Response(JSON.stringify({
            name: "@alan512/experienceengine",
            version: "0.4.8",
            dist: {
              tarball: "https://cdn.example.test/drift.tgz",
              integrity: sri(new Uint8Array([1]))
            }
          }), { status: 200 })
          : new Response(new Uint8Array([2]), { status: 200 });
      }
    })).rejects.toMatchObject({
      code: "EE_PUBLISHED_ARTIFACT_INTEGRITY_MISMATCH"
    });
  });

  it("keeps ClawHub materialization independent and exact", async () => {
    const root = await makeTempRoot();
    const bytes = new TextEncoder().encode("clawhub-artifact-bytes");
    const artifact = await materializeExactClawHubArtifact({
      packageName: "experienceengine",
      packageVersion: "0.4.8",
      destinationDirectory: join(root, "clawhub"),
      downloader: async (request) => ({
        package_name: request.packageName,
        package_version: request.packageVersion,
        artifact_bytes: bytes,
        artifact_integrity: sri(bytes),
        registry_record_identity: "clawhub:experienceengine@0.4.8:record-1",
        filename: "experienceengine-0.4.8.clawhub.tgz"
      })
    });
    expect(artifact).toMatchObject({
      published_channel: "clawhub",
      package_name: "experienceengine",
      package_version: "0.4.8",
      registry_record_identity: "clawhub:experienceengine@0.4.8:record-1"
    });
  });

  it("accepts only package roots inside the isolated install root", async () => {
    const root = await makeTempRoot();
    const bytes = new Uint8Array([1, 2, 3]);
    const artifact = await materializeExactClawHubArtifact({
      packageName: "experienceengine",
      packageVersion: "0.4.8",
      destinationDirectory: join(root, "download"),
      downloader: async () => ({
        package_name: "experienceengine",
        package_version: "0.4.8",
        artifact_bytes: bytes,
        artifact_integrity: sri(bytes),
        registry_record_identity: "clawhub:record",
        filename: "artifact.tgz"
      })
    });
    const installRoot = join(root, "install");
    const installed = await installMaterializedPublishedArtifact({
      artifact,
      installRoot,
      installer: async ({ installRoot: isolatedRoot }) => {
        const packageRoot = join(isolatedRoot, "package");
        await mkdir(packageRoot, { recursive: true });
        await writeFile(join(packageRoot, "package.json"), "{}", "utf8");
        return { packageRoot };
      }
    });
    expect(installed.packageRoot).toBe(join(installRoot, "package"));

    const outside = join(root, "outside-package");
    await mkdir(outside);
    await expect(installMaterializedPublishedArtifact({
      artifact,
      installRoot: join(root, "other-install"),
      installer: async () => ({ packageRoot: outside })
    })).rejects.toBeInstanceOf(PublishedRuntimeClosureError);
  });
});
