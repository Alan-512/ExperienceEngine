import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type {
  MaterializedPublishedArtifact
} from "../../src/runtime/distribution/artifact-materializer.js";
import {
  validateExactPublishedClawHubArtifactClosure
} from "../../src/runtime/distribution/clawhub-artifact-validator.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  while (temporaryRoots.length > 0) {
    await rm(temporaryRoots.pop()!, { recursive: true, force: true });
  }
});

describe("published ClawHub artifact validator", () => {
  it("keeps ClawHub identity independent when the exact artifact lacks closure", async () => {
    const root = await mkdtemp(join(tmpdir(), "ee-clawhub-validator-"));
    temporaryRoots.push(root);
    const artifact: MaterializedPublishedArtifact = {
      published_channel: "clawhub",
      package_name: "@alan512/experienceengine",
      package_version: "0.4.8",
      artifact_path: join(root, "artifact.tgz"),
      artifact_integrity: "sha512-clawhub-fixture",
      artifact_size: 53137,
      registry_record_identity: "clawhub:fixture",
      materialized_at: "2026-07-13T12:00:00.000Z"
    };
    const result = await validateExactPublishedClawHubArtifactClosure({
      packageName: artifact.package_name,
      packageVersion: artifact.package_version,
      validationRoot: root,
      materializeArtifact: async () => artifact,
      installer: async () => {
        const packageRoot = join(root, "install", "installed-package");
        await mkdir(packageRoot, { recursive: true });
        return { packageRoot };
      },
      now: () => new Date("2026-07-13T12:00:00.000Z")
    });
    expect(result).toMatchObject({
      validation_schema_version: "published-clawhub-closure-attempt-v1",
      published_channel: "clawhub",
      status: "closure_failed",
      artifact_integrity: "sha512-clawhub-fixture",
      registry_record_identity: "clawhub:fixture",
      support_claim_allowed: false,
      failure_code: "EE_PUBLISHED_CLOSURE_SCHEMA_INVALID",
      issues: ["read_embedded_manifest:ENOENT"]
    });
  });
});
