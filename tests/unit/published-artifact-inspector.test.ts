import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createRuntimeDistributionAttestation,
  deriveInstalledDependencyClosure,
  inspectPublishedArtifactClosure
} from "../../src/runtime/distribution/artifact-inspector.js";
import type {
  MaterializedPublishedArtifact
} from "../../src/runtime/distribution/artifact-materializer.js";
import type {
  RuntimeClosureManifest
} from "../../src/runtime/identity/types.js";

const temporaryRoots: string[] = [];

const makeTempRoot = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "ee-published-inspection-"));
  temporaryRoots.push(root);
  return root;
};

afterEach(async () => {
  while (temporaryRoots.length > 0) {
    await rm(temporaryRoots.pop()!, { recursive: true, force: true });
  }
});

const artifact = (): MaterializedPublishedArtifact => ({
  published_channel: "npm",
  package_name: "@alan512/experienceengine",
  package_version: "0.4.8",
  artifact_path: "artifact.tgz",
  artifact_integrity: "sha512-artifact",
  artifact_size: 4096,
  registry_record_identity: "npm:@alan512/experienceengine@0.4.8:record",
  materialized_at: "2026-07-13T12:00:00.000Z"
});

const manifest = (): RuntimeClosureManifest => ({
  closure_manifest_version: "runtime-closure-manifest-v1",
  package_name: "@alan512/experienceengine",
  package_version: "0.4.8",
  package_build_id: "build-test",
  required_entrypoints: [],
  required_runtime_files: [],
  required_schema_and_migrations: [],
  profile_registry_digest: "profile-digest",
  dependency_requirements_digest: "dependency-requirements",
  compatibility_metadata_digest: "compatibility-digest",
  closure_manifest_digest: "closure-digest"
});

describe("published artifact closure inspection", () => {
  it("derives a deterministic installed dependency closure without source-repo paths", async () => {
    const root = await makeTempRoot();
    await writeFile(join(root, "package.json"), JSON.stringify({
      name: "root-package",
      version: "1.0.0",
      dependencies: { alpha: "1.0.0" }
    }), "utf8");
    const alphaRoot = join(root, "node_modules", "alpha");
    const betaRoot = join(root, "node_modules", "beta");
    await mkdir(alphaRoot, { recursive: true });
    await mkdir(betaRoot, { recursive: true });
    await writeFile(join(alphaRoot, "package.json"), JSON.stringify({
      name: "alpha",
      version: "1.0.0",
      dependencies: { beta: "2.0.0" }
    }), "utf8");
    await writeFile(join(betaRoot, "package.json"), JSON.stringify({
      name: "beta",
      version: "2.0.0"
    }), "utf8");
    const first = await deriveInstalledDependencyClosure(root);
    const second = await deriveInstalledDependencyClosure(root);
    expect(first).toEqual(second);
    expect(first.records.map((record) => `${record.package_name}@${record.package_version}`))
      .toEqual(["alpha@1.0.0", "beta@2.0.0"]);
  });

  it("binds observed closure to the exact artifact, channel, attestation, and dependency digest", async () => {
    const observedArtifact = artifact();
    const observedManifest = manifest();
    const dependencyClosureDigest = "dependency-closure";
    const attestation = createRuntimeDistributionAttestation({
      artifact: observedArtifact,
      manifest: observedManifest,
      dependencyClosureDigest,
      createdAt: "2026-07-13T12:05:00.000Z"
    });
    const report = await inspectPublishedArtifactClosure({
      artifact: observedArtifact,
      packageRoot: "isolated-package-root",
      attestation,
      closureValidator: () => ({
        valid: true,
        manifestPath: "embedded-manifest",
        closureManifestDigest: observedManifest.closure_manifest_digest,
        packageBuildId: observedManifest.package_build_id,
        issues: []
      }),
      manifestReader: async () => observedManifest,
      dependencyClosureDeriver: async () => ({
        records: [],
        digest: dependencyClosureDigest
      })
    });
    expect(report).toMatchObject({
      valid: true,
      published_channel: "npm",
      closure_manifest_digest: "closure-digest",
      dependency_closure_digest: dependencyClosureDigest,
      issues: []
    });
  });

  it("rejects omitted, mismatched, or source-assisted closure evidence", async () => {
    const observedArtifact = artifact();
    const observedManifest = manifest();
    const attestation = createRuntimeDistributionAttestation({
      artifact: observedArtifact,
      manifest: observedManifest,
      dependencyClosureDigest: "expected-dependency-closure"
    });
    const report = await inspectPublishedArtifactClosure({
      artifact: observedArtifact,
      packageRoot: "isolated-package-root",
      attestation: {
        ...attestation,
        published_channel: "clawhub"
      },
      closureValidator: () => ({
        valid: false,
        manifestPath: "embedded-manifest",
        issues: [
          "asset_missing:package_local_worker",
          "expected_manifest_unavailable:source checkout required"
        ]
      }),
      manifestReader: async () => ({
        ...observedManifest,
        compatibility_metadata_digest: "wrong-compatibility"
      }),
      dependencyClosureDeriver: async () => ({
        records: [],
        digest: "wrong-dependency-closure"
      })
    });
    expect(report.valid).toBe(false);
    expect(report.issues).toEqual(expect.arrayContaining([
      "published_channel_mismatch",
      "closure:asset_missing:package_local_worker",
      "closure:expected_manifest_unavailable:source checkout required",
      "compatibility_metadata_digest_mismatch",
      "dependency_closure_digest_mismatch"
    ]));
  });
});
