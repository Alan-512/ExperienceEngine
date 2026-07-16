import { afterEach, describe, expect, it } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extract as extractTarArchive, list as listTarArchive } from "tar";
import { createDiagnosticReviewArchive } from "../../src/diagnostics/archive.js";
import { collectSafeDiagnosticManifest } from "../../src/diagnostics/collector.js";
import { prepareDiagnosticReviewDirectory } from "../../src/diagnostics/review-directory.js";
import { validateDiagnosticReviewDirectory } from "../../src/diagnostics/review-validator.js";

const roots: string[] = [];

const temporaryRoot = (): string => {
  const root = mkdtempSync(join(tmpdir(), "experienceengine-diagnostic-archive-"));
  roots.push(root);
  return root;
};

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const prepareReview = async (root: string) => {
  const manifest = await collectSafeDiagnosticManifest({
    homeDir: root,
    env: {},
    hosts: [],
    packageVersion: "0.5.1",
    now: () => "2026-07-16T20:00:00.000Z"
  });
  return prepareDiagnosticReviewDirectory({
    manifest,
    outputRoot: join(root, "reviews"),
    homeDir: root,
    env: {},
    idFactory: () => "review-id"
  });
};

describe("diagnostic review archive", () => {
  it("creates deterministic archives containing exactly the reviewed manifest", async () => {
    const root = temporaryRoot();
    const prepared = await prepareReview(root);
    const firstPath = join(root, "first.tar.gz");
    const secondPath = join(root, "second.tar.gz");

    const first = await createDiagnosticReviewArchive({
      reviewDirectory: prepared.review_directory,
      outputPath: firstPath,
      idFactory: () => "candidate-one"
    });
    const second = await createDiagnosticReviewArchive({
      reviewDirectory: prepared.review_directory,
      outputPath: secondPath,
      idFactory: () => "candidate-two"
    });

    expect(first.archive_sha256).toBe(second.archive_sha256);
    expect(first.archive_size).toBe(second.archive_size);
    expect(readFileSync(firstPath)).toEqual(readFileSync(secondPath));
    expect(first.uploaded).toBe(false);

    const entries: string[] = [];
    await listTarArchive({
      file: firstPath,
      strict: true,
      onentry: (entry) => entries.push(entry.path)
    });
    expect(entries).toEqual(["manifest.json"]);

    const extracted = join(root, "extracted");
    mkdirSync(extracted);
    await extractTarArchive({ file: firstPath, cwd: extracted, strict: true });
    expect(readFileSync(join(extracted, "manifest.json"))).toEqual(
      readFileSync(prepared.manifest_path)
    );
  });

  it("rejects extra files before creating an archive", async () => {
    const root = temporaryRoot();
    const prepared = await prepareReview(root);
    writeFileSync(join(prepared.review_directory, "extra.log"), "secret");
    const outputPath = join(root, "unsafe.tar.gz");

    await expect(createDiagnosticReviewArchive({
      reviewDirectory: prepared.review_directory,
      outputPath
    })).rejects.toThrow("exactly one regular manifest.json");
    expect(existsSync(outputPath)).toBe(false);
  });

  it("rejects unknown or privacy-inconsistent manifest edits", async () => {
    const root = temporaryRoot();
    const prepared = await prepareReview(root);
    const parsed = JSON.parse(readFileSync(prepared.manifest_path, "utf8"));
    parsed.raw_prompt = "secret";
    writeFileSync(prepared.manifest_path, `${JSON.stringify(parsed)}\n`);
    expect(() => validateDiagnosticReviewDirectory(prepared.review_directory)).toThrow();

    delete parsed.raw_prompt;
    parsed.provider.exact_model_id = "openrouter/example/model";
    writeFileSync(prepared.manifest_path, `${JSON.stringify(parsed)}\n`);
    expect(() => validateDiagnosticReviewDirectory(prepared.review_directory)).toThrow(
      "Exact-model privacy assertion does not match manifest content"
    );
  });

  it("rejects linked review roots and linked manifests", async () => {
    const root = temporaryRoot();
    const prepared = await prepareReview(root);
    const linkedRoot = join(root, "linked-review");
    symlinkSync(
      prepared.review_directory,
      linkedRoot,
      process.platform === "win32" ? "junction" : "dir"
    );
    expect(() => validateDiagnosticReviewDirectory(linkedRoot)).toThrow("real directory");

    const originalManifest = readFileSync(prepared.manifest_path);
    rmSync(prepared.manifest_path);
    const outsideManifest = join(root, "outside-manifest.json");
    writeFileSync(outsideManifest, originalManifest);
    try {
      symlinkSync(outsideManifest, prepared.manifest_path, "file");
    } catch {
      return;
    }
    expect(() => validateDiagnosticReviewDirectory(prepared.review_directory)).toThrow(
      "exactly one regular manifest.json"
    );
  });

  it("refuses to overwrite an existing archive", async () => {
    const root = temporaryRoot();
    const prepared = await prepareReview(root);
    const outputPath = join(root, "existing.tar.gz");
    writeFileSync(outputPath, "existing-content");

    await expect(createDiagnosticReviewArchive({
      reviewDirectory: prepared.review_directory,
      outputPath
    })).rejects.toThrow("overwrite is forbidden");
    expect(readFileSync(outputPath, "utf8")).toBe("existing-content");
  });

  it("rejects a linked archive output directory", async () => {
    const root = temporaryRoot();
    const prepared = await prepareReview(root);
    const realOutput = join(root, "real-output");
    const linkedOutput = join(root, "linked-output");
    mkdirSync(realOutput);
    symlinkSync(realOutput, linkedOutput, process.platform === "win32" ? "junction" : "dir");

    await expect(createDiagnosticReviewArchive({
      reviewDirectory: prepared.review_directory,
      outputPath: join(linkedOutput, "diagnostic.tar.gz")
    })).rejects.toThrow("real directory");
  });
});
