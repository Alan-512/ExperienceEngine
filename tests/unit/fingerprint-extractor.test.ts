import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import * as path from "node:path";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";

// Mock the entire node:fs module to bypass ESM read-only namespace limitations
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    readdirSync: vi.fn(),
    statSync: vi.fn()
  };
});

import {
  stableStringify,
  calculateFingerprintHash,
  extractMajorFromRange,
  parsePackageLock,
  parsePnpmLock,
  parseYarnLock,
  detectConfigMarkers,
  detectPrimaryLanguage,
  detectWorkspaceAndProjectRoots,
  extractProjectFingerprint
} from "../../src/input/fingerprint-extractor.js";

describe("Fingerprint Extractor", () => {
  describe("stableStringify & Hash Determinism", () => {
    it("serializes objects deterministically regardless of key insertion order", () => {
      const objA = { b: 2, a: 1, c: { e: 5, d: 4 } };
      const objB = { a: 1, b: 2, c: { d: 4, e: 5 } };

      const strA = stableStringify(objA);
      const strB = stableStringify(objB);

      expect(strA).toBe(strB);
      expect(strA).toBe('{"a":1,"b":2,"c":{"d":4,"e":5}}');
    });

    it("serializes null, arrays, and primitives correctly", () => {
      expect(stableStringify(null)).toBe("null");
      expect(stableStringify([3, 1, 2])).toBe("[3,1,2]");
      expect(stableStringify("hello")).toBe('"hello"');
      expect(stableStringify(true)).toBe("true");
    });

    it("generates deterministic 16-character hex hash", () => {
      const fpA = {
        schemaVersion: "1",
        primaryLanguage: "typescript",
        packageManager: "pnpm",
        lockfileFamily: "pnpm",
        frameworks: { react: 18 },
        databaseOrORM: { prisma: 5 },
        testBuildTools: { vitest: 1 },
        hostRuntimeAdapters: {},
        configMarkers: ["tsconfig.json", "package.json"]
      };

      const fpB = {
        lockfileFamily: "pnpm",
        packageManager: "pnpm",
        primaryLanguage: "typescript",
        schemaVersion: "1",
        configMarkers: ["tsconfig.json", "package.json"],
        hostRuntimeAdapters: {},
        testBuildTools: { vitest: 1 },
        databaseOrORM: { prisma: 5 },
        frameworks: { react: 18 }
      };

      const hashA = calculateFingerprintHash(fpA);
      const hashB = calculateFingerprintHash(fpB);

      expect(hashA).toBe(hashB);
      expect(hashA).toMatch(/^[0-9a-f]{16}$/);
    });

    it("guarantees fingerprint hash portability across different workspace paths and project scopes", () => {
      const fp1 = {
        schemaVersion: "1",
        primaryLanguage: "typescript",
        packageManager: "pnpm",
        lockfileFamily: "pnpm",
        frameworks: { react: 18 },
        databaseOrORM: { prisma: 5 },
        testBuildTools: { vitest: 1 },
        hostRuntimeAdapters: {},
        configMarkers: ["tsconfig.json", "package.json"],
        workspaceRootPath: "/some/workspace/path",
        projectRootScopeId: "scope-a"
      };

      const fp2 = {
        schemaVersion: "1",
        primaryLanguage: "typescript",
        packageManager: "pnpm",
        lockfileFamily: "pnpm",
        frameworks: { react: 18 },
        databaseOrORM: { prisma: 5 },
        testBuildTools: { vitest: 1 },
        hostRuntimeAdapters: {},
        configMarkers: ["tsconfig.json", "package.json"],
        workspaceRootPath: "/another/completely/different/path",
        projectRootScopeId: "scope-b"
      };

      const hash1 = calculateFingerprintHash(fp1);
      const hash2 = calculateFingerprintHash(fp2);

      expect(hash1).toBe(hash2);
    });
  });

  describe("SemVer Range Major Parsing", () => {
    it("extracts major version from diverse ranges correctly", () => {
      expect(extractMajorFromRange("^18.2.0")).toBe(18);
      expect(extractMajorFromRange("~4.5.1")).toBe(4);
      expect(extractMajorFromRange(">=2.0.0 <3.0.0")).toBe(2);
      expect(extractMajorFromRange("3.x")).toBe(3);
      expect(extractMajorFromRange("12")).toBe(12);
      expect(extractMajorFromRange("latest")).toBe(0);
      expect(extractMajorFromRange("*")).toBe(0);
    });
  });

  describe("Lockfile Version Parsers", () => {
    it("parses package-lock.json (both v1 and v2/v3 styles) accurately", () => {
      const v2v3Content = JSON.stringify({
        packages: {
          "": { version: "1.0.0" },
          "node_modules/react": { version: "18.3.1" },
          "node_modules/prisma": { version: "5.14.0" }
        }
      });

      const v1Content = JSON.stringify({
        dependencies: {
          react: { version: "17.0.2" },
          vitest: { version: "1.6.0" }
        }
      });

      const resV2 = parsePackageLock(v2v3Content, ["react", "prisma", "vitest"]);
      expect(resV2).toEqual({
        react: "18.3.1",
        prisma: "5.14.0"
      });

      const resV1 = parsePackageLock(v1Content, ["react", "prisma", "vitest"]);
      expect(resV1).toEqual({
        react: "17.0.2",
        vitest: "1.6.0"
      });
    });

    it("parses pnpm-lock.yaml (v5, v6, v9 styles) robustly", () => {
      const lockContent = `
lockfileVersion: '6.0'

dependencies:
  react: 18.2.0
  prisma: 5.1.0_@types+node@18.0.0

packages:
  /react@18.2.0:
    resolution: {integrity: sha512-...}
  '/prisma@5.1.0_@types+node@18.0.0':
    resolution: {integrity: sha512-...}
  /express/4.18.2:
    resolution: {integrity: sha512-...}
      `;

      const res = parsePnpmLock(lockContent, ["react", "prisma", "express", "vitest"]);
      expect(res).toEqual({
        react: "18.2.0",
        prisma: "5.1.0",
        express: "4.18.2"
      });
    });

    it("parses yarn.lock (v1 classic & berry styles) accurately", () => {
      const classicContent = `
react@^18.2.0:
  version "18.2.0"
  resolved "https://registry.yarnpkg.com/react..."

prisma@npm:^5.1.0:
  version: 5.1.0
      `;

      const res = parseYarnLock(classicContent, ["react", "prisma", "vitest"]);
      expect(res).toEqual({
        react: "18.2.0",
        prisma: "5.1.0"
      });
    });
  });

  describe("File System Detections with Mocked Functions", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("detects config markers correctly based on physical files", () => {
      (existsSync as any).mockImplementation((p: string) => {
        const base = path.basename(p);
        return base === "tsconfig.json" || base === "package.json";
      });

      const markers = detectConfigMarkers("/mock/root");
      expect(markers).toEqual(["package.json", "tsconfig.json"]);
    });

    it("detects primaryLanguage based on tsconfig.json existence", () => {
      (existsSync as any).mockImplementation((p: string) => path.basename(p) === "tsconfig.json");
      const lang = detectPrimaryLanguage("/mock/root");
      expect(lang).toBe("typescript");
    });

    it("detects primaryLanguage based on file extensions if tsconfig is missing", () => {
      (existsSync as any).mockReturnValue(false);
      (readdirSync as any).mockReturnValue(["index.js", "utils.js", "styles.css"]);
      (statSync as any).mockReturnValue({ isDirectory: () => false, isFile: () => true } as any);

      const lang = detectPrimaryLanguage("/mock/root");
      expect(lang).toBe("javascript");
    });

    it("detects Monorepo roots up the directory tree", () => {
      (existsSync as any).mockImplementation((p: string) => {
        return p === path.resolve("/mock/workspace/pnpm-workspace.yaml");
      });

      const info = detectWorkspaceAndProjectRoots("/mock/workspace/packages/subproject");
      expect(info.workspaceRoot).toBe(path.resolve("/mock/workspace"));
      expect(info.projectRoot).toBe(path.resolve("/mock/workspace/packages/subproject"));
      expect(info.lockfileFamily).toBe("unknown");
      expect(info.packageManager).toBe("unknown");
    });
  });

  describe("Integrated extractProjectFingerprint", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("successfully compiles full fingerprint with lockfile package versions and range fallbacks", () => {
      const mockProjectRoot = path.resolve("/mock/project");

      (existsSync as any).mockImplementation((p: string) => {
        const normalized = path.normalize(p);
        if (normalized.endsWith("package.json")) return true;
        if (normalized.endsWith("pnpm-lock.yaml")) return true;
        if (normalized.endsWith("tsconfig.json")) return true;
        return false;
      });

      (readFileSync as any).mockImplementation((p: string) => {
        const normalized = path.normalize(p);
        if (normalized.endsWith("package.json")) {
          return JSON.stringify({
            dependencies: {
              react: "^18.0.0",
              prisma: "latest"
            },
            devDependencies: {
              vitest: "^1.0.0"
            }
          });
        }
        if (normalized.endsWith("pnpm-lock.yaml")) {
          return `
packages:
  /react@18.3.1:
    resolution: {integrity: sha512-...}
  /vitest@1.6.0:
    resolution: {integrity: sha512-...}
          `;
        }
        return "";
      });

      (readdirSync as any).mockReturnValue([]);

      const fingerprint = extractProjectFingerprint(mockProjectRoot);

      expect(fingerprint.schemaVersion).toBe("1");
      expect(fingerprint.primaryLanguage).toBe("typescript");
      expect(fingerprint.packageManager).toBe("pnpm");
      expect(fingerprint.lockfileFamily).toBe("pnpm");

      // react matches exact lockfile extraction
      expect(fingerprint.frameworks).toEqual({ react: 18 });
      // prisma not found in lockfile, falls back to range (latest -> 0)
      expect(fingerprint.databaseOrORM).toEqual({ prisma: 0 });
      // vitest matches exact lockfile extraction
      expect(fingerprint.testBuildTools).toEqual({ vitest: 1 });
      expect(fingerprint.configMarkers).toEqual(["package.json", "tsconfig.json"]);
      expect(fingerprint.fingerprintHash).toBeDefined();
    });
  });

  describe("Monorepo Conflict Resolution and Unknown Project Signals", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("parses conflicting pnpm-lock.yaml in monorepo, choosing subproject specific importer", () => {
      const pnpmLockContent = `
lockfileVersion: '6.0'

importers:
  packages/app-a:
    dependencies:
      react:
        specifier: ^17.0.2
        version: 17.0.2
  packages/app-b:
    dependencies:
      react:
        specifier: ^18.2.0
        version: 18.2.0

packages:
  /react@17.0.2:
    resolution: {integrity: sha512-...}
  /react@18.2.0:
    resolution: {integrity: sha512-...}
      `;

      const resA = parsePnpmLock(pnpmLockContent, ["react"], "packages/app-a", { react: "^17.0.2" });
      expect(resA.react).toBe("17.0.2");

      const resB = parsePnpmLock(pnpmLockContent, ["react"], "packages/app-b", { react: "^18.2.0" });
      expect(resB.react).toBe("18.2.0");
    });

    it("parses conflicting package-lock.json in monorepo, resolving correct local subproject node_modules first", () => {
      const packageLockContent = JSON.stringify({
        lockfileVersion: 3,
        packages: {
          "": { version: "1.0.0" },
          "node_modules/react": { version: "18.2.0" },
          "packages/sub-a/node_modules/react": { version: "17.0.2" }
        }
      });

      const resSubA = parsePackageLock(packageLockContent, ["react"], "packages/sub-a", { react: "^17.0.2" });
      expect(resSubA.react).toBe("17.0.2");

      const resRoot = parsePackageLock(packageLockContent, ["react"], ".", { react: "^18.2.0" });
      expect(resRoot.react).toBe("18.2.0");
    });

    it("parses conflicting yarn.lock in monorepo using range and expectedMajor heuristics", () => {
      const yarnLockContent = `
react@^17.0.2:
  version "17.0.2"

react@^18.2.0:
  version "18.2.0"
      `;

      const resA = parseYarnLock(yarnLockContent, ["react"], "packages/sub-a", { react: "^17.0.2" });
      expect(resA.react).toBe("17.0.2");

      const resB = parseYarnLock(yarnLockContent, ["react"], "packages/sub-b", { react: "^18.2.0" });
      expect(resB.react).toBe("18.2.0");
    });

    it("resolves to unknown project signals when no lockfiles and no package.json manifest exist", () => {
      (existsSync as any).mockReturnValue(false);
      (readdirSync as any).mockReturnValue([]);

      const info = detectWorkspaceAndProjectRoots("/mock/unrecognized-project");
      expect(info.lockfileFamily).toBe("unknown");
      expect(info.packageManager).toBe("unknown");

      const lang = detectPrimaryLanguage("/mock/unrecognized-project");
      expect(lang).toBe("unknown");
    });

    it("resolves to none lockfileFamily and npm packageManager when package.json exists but no lockfile exists", () => {
      (existsSync as any).mockImplementation((p: string) => {
        return p.endsWith("package.json");
      });
      (readFileSync as any).mockReturnValue(JSON.stringify({
        name: "test-pkg"
      }));

      const info = detectWorkspaceAndProjectRoots("/mock/no-lockfile-project");
      expect(info.lockfileFamily).toBe("none");
      expect(info.packageManager).toBe("npm");
    });
  });
});

