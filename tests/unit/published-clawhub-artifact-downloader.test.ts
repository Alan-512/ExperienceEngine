import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createPublicClawHubArtifactDownloader
} from "../../src/runtime/distribution/clawhub-artifact-downloader.js";

const sha256Hex = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");
const sha512Sri = (bytes: Uint8Array): string =>
  `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
const sha1Hex = (bytes: Uint8Array): string =>
  createHash("sha1").update(bytes).digest("hex");

describe("published ClawHub artifact downloader", () => {
  it("resolves one exact npm-pack artifact and verifies all registry digests", async () => {
    const bytes = new TextEncoder().encode("clawhub-published-artifact");
    const sha256 = sha256Hex(bytes);
    const npmIntegrity = sha512Sri(bytes);
    const npmShasum = sha1Hex(bytes);
    const requests: string[] = [];
    const downloader = createPublicClawHubArtifactDownloader({
      baseUrl: "https://clawhub.example.test",
      fetchImpl: async (input) => {
        const url = String(input);
        requests.push(url);
        if (url.includes("/versions/0.4.8/artifact")) {
          return new Response(JSON.stringify({
            package: {
              name: "@alan512/experienceengine",
              family: "code-plugin"
            },
            version: "0.4.8",
            artifact: {
              kind: "npm-pack",
              format: "tgz",
              sha256,
              size: bytes.byteLength,
              npmIntegrity,
              npmShasum,
              npmTarballName: "alan512-experienceengine-0.4.8.tgz",
              downloadUrl:
                "https://clawhub.example.test/api/npm/@alan512/experienceengine/-/artifact.tgz"
            }
          }), { status: 200 });
        }
        return new Response(bytes, {
          status: 200,
          headers: {
            "X-ClawHub-Artifact-Sha256": sha256,
            "X-ClawHub-Npm-Integrity": npmIntegrity,
            "X-ClawHub-Npm-Shasum": npmShasum
          }
        });
      }
    });
    const result = await downloader({
      packageName: "@alan512/experienceengine",
      packageVersion: "0.4.8"
    });
    expect(requests).toEqual([
      "https://clawhub.example.test/api/v1/packages/%40alan512%2Fexperienceengine/versions/0.4.8/artifact",
      "https://clawhub.example.test/api/npm/@alan512/experienceengine/-/artifact.tgz"
    ]);
    expect(result).toMatchObject({
      package_name: "@alan512/experienceengine",
      package_version: "0.4.8",
      artifact_integrity: npmIntegrity,
      filename: "alan512-experienceengine-0.4.8.tgz"
    });
    expect(result.registry_record_identity).toMatch(
      /^clawhub:@alan512\/experienceengine@0\.4\.8:[a-f0-9]{64}$/u
    );
  });

  it("rejects cross-origin downloads and mismatched response headers", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const metadata = {
      package: {
        name: "@alan512/experienceengine",
        family: "code-plugin"
      },
      version: "0.4.8",
      artifact: {
        kind: "npm-pack",
        format: "tgz",
        sha256: sha256Hex(bytes),
        size: bytes.byteLength,
        npmIntegrity: sha512Sri(bytes),
        npmShasum: sha1Hex(bytes),
        npmTarballName: "artifact.tgz",
        downloadUrl: "https://other.example.test/artifact.tgz"
      }
    };
    const crossOrigin = createPublicClawHubArtifactDownloader({
      baseUrl: "https://clawhub.example.test",
      fetchImpl: async () => new Response(JSON.stringify(metadata), {
        status: 200
      })
    });
    await expect(crossOrigin({
      packageName: "@alan512/experienceengine",
      packageVersion: "0.4.8"
    })).rejects.toMatchObject({
      code: "EE_PUBLISHED_CLOSURE_SCHEMA_INVALID"
    });

    let requestCount = 0;
    const badHeaders = createPublicClawHubArtifactDownloader({
      baseUrl: "https://clawhub.example.test",
      fetchImpl: async () => {
        requestCount += 1;
        return requestCount === 1
          ? new Response(JSON.stringify({
            ...metadata,
            artifact: {
              ...metadata.artifact,
              downloadUrl: "https://clawhub.example.test/artifact.tgz"
            }
          }), { status: 200 })
          : new Response(bytes, {
            status: 200,
            headers: {
              "X-ClawHub-Artifact-Sha256": "0".repeat(64),
              "X-ClawHub-Npm-Integrity": sha512Sri(bytes),
              "X-ClawHub-Npm-Shasum": sha1Hex(bytes)
            }
          });
      }
    });
    await expect(badHeaders({
      packageName: "@alan512/experienceengine",
      packageVersion: "0.4.8"
    })).rejects.toMatchObject({
      code: "EE_PUBLISHED_ARTIFACT_INTEGRITY_MISMATCH"
    });
  });
});
