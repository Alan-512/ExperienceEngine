import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { open as openFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ExperienceStateArtifactService } from "../../src/interaction/state-artifact-service.js";
import { RuntimeIdentityError } from "../../src/runtime/identity/errors.js";
import {
  assertMachineIntegrityKeyId,
  assertMachineIntegrityKeyPermissions,
  createOrAdoptMachineIntegrityKey,
  hmacMachineIntegrityInput,
  readMachineIntegrityKey,
  resolveMachineIntegrityKeyPath
} from "../../src/runtime/identity/integrity-key.js";

const tempDirs: string[] = [];
const OS_PERMISSION_TEST_TIMEOUT_MS = 15_000;

const listFilesRecursively = (root: string): string[] => {
  if (!existsSync(root)) {
    return [];
  }
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    return statSync(path).isDirectory() ? listFilesRecursively(path) : [path];
  });
};

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "ee-integrity-key-"));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("machine integrity key", () => {
  it("atomically converges concurrent creators on the first committed key", async () => {
    const home = makeTempDir();
    const keys = await Promise.all(
      Array.from({ length: 16 }, () => createOrAdoptMachineIntegrityKey(home))
    );

    expect(new Set(keys.map((key) => key.integrity_key_id)).size).toBe(1);
    expect(new Set(keys.map((key) => key.key_material)).size).toBe(1);
    expect(await readMachineIntegrityKey(home)).toEqual(keys[0]);
    expect(await assertMachineIntegrityKeyPermissions(home)).toBe(true);
    expect(resolveMachineIntegrityKeyPath(home)).toBe(
      join(home, "machine-secrets", "integrity-key.json")
    );
    expect(readdirSync(join(home, "machine-secrets"))).toEqual(["integrity-key.json"]);
  }, OS_PERMISSION_TEST_TIMEOUT_MS);

  it.skipIf(process.platform !== "win32")(
    "isolates Windows PowerShell ACL commands from an inherited incompatible PSModulePath",
    async () => {
      const originalModulePath = process.env.PSModulePath;
      process.env.PSModulePath = makeTempDir();
      try {
        const home = makeTempDir();
        await expect(createOrAdoptMachineIntegrityKey(home)).resolves.toMatchObject({
          key_schema_version: "machine-integrity-key-v1"
        });
        await expect(assertMachineIntegrityKeyPermissions(home)).resolves.toBe(true);
      } finally {
        if (originalModulePath === undefined) {
          delete process.env.PSModulePath;
        } else {
          process.env.PSModulePath = originalModulePath;
        }
      }
    },
    OS_PERMISSION_TEST_TIMEOUT_MS
  );

  it("uses exact zero-separated HMAC domains and never reuses a cross-domain output", async () => {
    const key = await createOrAdoptMachineIntegrityKey(makeTempDir());
    const value = "same-input";
    const home = hmacMachineIntegrityInput(key, "home-path-v1", value);
    const diagnostic = hmacMachineIntegrityInput(key, "diagnostic-identity-v1", value);
    const nested = hmacMachineIntegrityInput(key, "home-path-v1", diagnostic);

    expect(home).not.toBe(diagnostic);
    expect(home).not.toBe(nested);
    expect(home).toMatch(/^[a-f0-9]{64}$/u);
  }, OS_PERMISSION_TEST_TIMEOUT_MS);

  it("rejects a different key id instead of rotating or silently adopting it", async () => {
    const key = await createOrAdoptMachineIntegrityKey(makeTempDir());

    expect(() => assertMachineIntegrityKeyId(key, "ik_other")).toThrowError(
      expect.objectContaining<Partial<RuntimeIdentityError>>({
        code: "EE_INTEGRITY_KEY_MISMATCH"
      })
    );
  }, OS_PERMISSION_TEST_TIMEOUT_MS);

  it("discards an uncommitted candidate when candidate fsync fails", async () => {
    const home = makeTempDir();
    const probePath = join(home, "file-handle-probe");
    const probeHandle = await openFile(probePath, "w");
    const fileHandlePrototype = Object.getPrototypeOf(probeHandle) as {
      sync: () => Promise<void>;
    };
    await probeHandle.close();
    rmSync(probePath, { force: true });
    const originalSync = fileHandlePrototype.sync;
    fileHandlePrototype.sync = async () => {
      throw new Error("forced candidate fsync failure");
    };
    try {
      await expect(createOrAdoptMachineIntegrityKey(home)).rejects.toThrow(
        "forced candidate fsync failure"
      );
    } finally {
      fileHandlePrototype.sync = originalSync;
    }

    expect(readdirSync(join(home, "machine-secrets"))).toEqual([]);
  }, OS_PERMISSION_TEST_TIMEOUT_MS);

  it("rejects non-canonical base64url key material", async () => {
    const home = makeTempDir();
    const keyPath = resolveMachineIntegrityKeyPath(home);
    mkdirSync(dirname(keyPath), { recursive: true });
    writeFileSync(keyPath, `${JSON.stringify({
      key_schema_version: "machine-integrity-key-v1",
      integrity_key_id: "ik_test",
      key_material: `${Buffer.alloc(32).toString("base64url")}!`,
      created_at: "2026-07-11T00:00:00.000Z"
    })}\n`, "utf8");

    await expect(readMachineIntegrityKey(home)).rejects.toMatchObject({
      code: "EE_INTEGRITY_KEY_INVALID"
    });
  });

  it("excludes the integrity key file and material from managed exports", async () => {
    const home = makeTempDir();
    const key = await createOrAdoptMachineIntegrityKey(home);
    const service = new ExperienceStateArtifactService({
      env: { EXPERIENCE_ENGINE_HOME: home },
      homeDir: home,
      now: () => "2026-07-11T00:00:00.000Z",
      idFactory: () => "runtime-key-export-test"
    });
    const plan = service.planOperation({ operation: "export" });
    const result = service.executePlannedOperation({
      planId: plan.planId,
      confirmationToken: plan.confirmationToken
    });
    const artifactPath = result.artifact?.path;

    expect(artifactPath).toBeDefined();
    expect(existsSync(join(artifactPath!, "machine-secrets"))).toBe(false);
    const artifactFiles = listFilesRecursively(artifactPath!);
    expect(artifactFiles.some((path) => path.endsWith("integrity-key.json"))).toBe(false);
    for (const path of artifactFiles) {
      const content = readFileSync(path, "utf8");
      expect(content).not.toContain(key.key_material);
      expect(content).not.toContain('"key_material"');
    }
  }, OS_PERMISSION_TEST_TIMEOUT_MS);
});
