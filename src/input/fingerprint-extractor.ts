import { readdirSync, statSync, existsSync, readFileSync } from "node:fs";
import { join, basename, resolve, dirname } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { ProjectFingerprint, ScopeFingerprint } from "../types/domain.js";
import { hashText } from "../utils/hashing.js";
import { stableId } from "../utils/ids.js";
import { nowIso } from "../utils/clock.js";
import { ScopeFingerprintRepository } from "../store/sqlite/repositories/scope-fingerprint-repo.js";
import { normalizeScopeIdentityPath } from "./scope-resolver.js";

const FRAMEWORKS = [
  "react", "vue", "svelte", "solid-js", "express", "koa", "fastify",
  "@nestjs/core", "nest", "next", "nuxt", "astro", "@angular/core", "angular"
];

const DATABASE_OR_ORM = [
  "prisma", "typeorm", "sequelize", "mongoose", "knex", "drizzle-orm",
  "mikro-orm", "pg", "mysql2", "sqlite3", "better-sqlite3"
];

const TEST_BUILD_TOOLS = [
  "vitest", "jest", "mocha", "cypress", "playwright", "vite", "webpack",
  "rollup", "esbuild", "tsup", "gulp", "babel-core", "@babel/core"
];

const HOST_RUNTIME_ADAPTERS = [
  "openai", "@google/genai", "@anthropic-ai/sdk", "langchain", "experienceengine"
];

const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Recursively scan file extensions under a directory to detect the primary language
 */
const scanFileExtensions = (
  dir: string,
  depth = 0,
  maxFiles = 100,
  state = { count: 0, extCounts: {} as Record<string, number> }
) => {
  if (depth > 2 || state.count >= maxFiles) return;
  try {
    const files = readdirSync(dir);
    for (const file of files) {
      if (state.count >= maxFiles) break;
      const fullPath = join(dir, file);
      // Filter out heavy directories or build outputs
      if (
        file === "node_modules" ||
        file === ".git" ||
        file === "dist" ||
        file === "out" ||
        file === "build" ||
        file === ".tmp" ||
        file === "artifacts"
      ) {
        continue;
      }
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          scanFileExtensions(fullPath, depth + 1, maxFiles, state);
        } else if (stat.isFile()) {
          state.count++;
          const ext = file.split(".").pop()?.toLowerCase();
          if (ext) {
            state.extCounts[ext] = (state.extCounts[ext] || 0) + 1;
          }
        }
      } catch {
        // Ignore stats failure
      }
    }
  } catch {
    // Ignore readdir failure
  }
};

/**
 * Detect the primary development language of the project
 */
export const detectPrimaryLanguage = (projectRoot: string): string => {
  if (existsSync(join(projectRoot, "tsconfig.json"))) {
    return "typescript";
  }
  const state = { count: 0, extCounts: {} as Record<string, number> };
  scanFileExtensions(projectRoot, 0, 100, state);

  const extToLang: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    py: "python",
    go: "go",
    rs: "rust",
    java: "java",
    cpp: "cpp",
    c: "c",
    cs: "csharp",
    rb: "ruby",
    php: "php"
  };

  let maxExt = "";
  let maxCount = 0;
  for (const [ext, count] of Object.entries(state.extCounts)) {
    if (count > maxCount && extToLang[ext]) {
      maxCount = count;
      maxExt = ext;
    }
  }

  if (maxExt) {
    return extToLang[maxExt];
  }

  // Fallback to package.json dependencies if scanning yielded no language match
  try {
    const pkgPath = join(projectRoot, "package.json");
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      if (pkg.dependencies?.typescript || pkg.devDependencies?.typescript) {
        return "typescript";
      }
    }
  } catch {}

  return "javascript";
};

export type WorkspaceInfo = {
  workspaceRoot: string;
  projectRoot: string;
  projectRootScopeId: string;
  packageManager: string;
  lockfileFamily: string;
};

/**
 * Heuristically detect Monorepo, Workspace/Project roots, and Project Scope ID
 */
export const detectWorkspaceAndProjectRoots = (cwd: string): WorkspaceInfo => {
  const projectRoot = resolve(cwd);
  let workspaceRoot = projectRoot;
  let current = projectRoot;
  let foundWorkspace = false;

  // Traverse upwards up to 5 levels to locate Monorepo roots
  for (let i = 0; i < 5; i++) {
    const hasPnpmWorkspace = existsSync(join(current, "pnpm-workspace.yaml"));
    const hasLerna = existsSync(join(current, "lerna.json"));
    let hasWorkspacesInPkg = false;
    try {
      const pkgPath = join(current, "package.json");
      if (existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
        if (pkg.workspaces) {
          hasWorkspacesInPkg = true;
        }
      }
    } catch {}

    if (hasPnpmWorkspace || hasLerna || hasWorkspacesInPkg) {
      workspaceRoot = current;
      foundWorkspace = true;
      break;
    }

    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  let packageManager = "npm";
  let lockfileFamily = "none";

  // Check for physical existence of lockfiles (project root prioritized over workspace root)
  const checkDirs = foundWorkspace ? [projectRoot, workspaceRoot] : [projectRoot];
  for (const dir of checkDirs) {
    if (existsSync(join(dir, "pnpm-lock.yaml"))) {
      packageManager = "pnpm";
      lockfileFamily = "pnpm";
      break;
    } else if (existsSync(join(dir, "package-lock.json"))) {
      packageManager = "npm";
      lockfileFamily = "npm";
      break;
    } else if (existsSync(join(dir, "yarn.lock"))) {
      packageManager = "yarn";
      lockfileFamily = "yarn";
      break;
    }
  }

  if (lockfileFamily === "none") {
    try {
      const pkgPath = join(projectRoot, "package.json");
      if (existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
        if (pkg.packageManager) {
          const pm = pkg.packageManager.split("@")[0];
          packageManager = pm;
        }
      }
    } catch {}
  }

  const identityPath = normalizeScopeIdentityPath(projectRoot);
  const projectRootScopeId = stableId("scope", identityPath);

  return {
    workspaceRoot,
    projectRoot,
    projectRootScopeId,
    packageManager,
    lockfileFamily
  };
};

/**
 * Robustly parse dependency major versions from package-lock.json
 */
export const parsePackageLock = (contentStr: string, packagesToFind: string[]): Record<string, string> => {
  const result: Record<string, string> = {};
  try {
    const lock = JSON.parse(contentStr);
    if (lock.packages) {
      for (const pkg of packagesToFind) {
        const key = `node_modules/${pkg}`;
        if (lock.packages[key]?.version) {
          result[pkg] = lock.packages[key].version;
        } else {
          // Fallback loop across nested package names inside lock packages
          for (const k of Object.keys(lock.packages)) {
            if (k === key || k.endsWith(`/node_modules/${pkg}`)) {
              result[pkg] = lock.packages[k].version;
              break;
            }
          }
        }
      }
    }
    if (lock.dependencies) {
      for (const pkg of packagesToFind) {
        if (!result[pkg] && lock.dependencies[pkg]?.version) {
          result[pkg] = lock.dependencies[pkg].version;
        }
      }
    }
  } catch {
    // Ignore error
  }
  return result;
};

/**
 * Robustly parse dependency versions from pnpm-lock.yaml via line scans
 */
export const parsePnpmLock = (contentStr: string, packagesToFind: string[]): Record<string, string> => {
  const result: Record<string, string> = {};
  const lines = contentStr.split(/\r?\n/);

  for (const pkg of packagesToFind) {
    const escapedPkg = escapeRegExp(pkg);
    const patterns = [
      new RegExp(`(?:\\/|'|")` + escapedPkg + `@([0-9]+\\.[0-9]+\\.[0-9]+[^'"\\s_:]*)`),
      new RegExp(`\\/` + escapedPkg + `\\/([0-9]+\\.[0-9]+\\.[0-9]+[^'"\\s_:]*)`),
      new RegExp(`^\\s*` + escapedPkg + `:\\s*['"]?([0-9]+\\.[0-9]+\\.[0-9]+[^'"\\s_:]*)`)
    ];

    let foundVersion: string | null = null;
    for (const line of lines) {
      for (const pattern of patterns) {
        const match = pattern.exec(line);
        if (match && match[1]) {
          const ver = match[1];
          const pureVer = ver.split(/[_\(\)]/)[0];
          if (/^[0-9]+\.[0-9]+\.[0-9]+/.test(pureVer)) {
            foundVersion = pureVer;
            break;
          }
        }
      }
      if (foundVersion) break;
    }
    if (foundVersion) {
      result[pkg] = foundVersion;
    }
  }
  return result;
};

/**
 * Robustly parse dependency versions from yarn.lock via line scans
 */
export const parseYarnLock = (contentStr: string, packagesToFind: string[]): Record<string, string> => {
  const result: Record<string, string> = {};
  const lines = contentStr.split(/\r?\n/);

  for (const pkg of packagesToFind) {
    const escapedPkg = escapeRegExp(pkg);
    const headerPattern = new RegExp(`^"?` + escapedPkg + `@`);
    const versionPattern = /^\s*version:?\s*['"]?([0-9]+\.[0-9]+\.[0-9]+[^'"\s]*)/;

    for (let i = 0; i < lines.length; i++) {
      if (headerPattern.test(lines[i])) {
        for (let j = i + 1; j < Math.min(lines.length, i + 10); j++) {
          const match = versionPattern.exec(lines[j]);
          if (match && match[1]) {
            result[pkg] = match[1];
            break;
          }
        }
      }
      if (result[pkg]) break;
    }
  }
  return result;
};

/**
 * Extract the major version from a SemVer range string heuristically
 */
export const extractMajorFromRange = (range: string): number => {
  const cleanRange = range.trim().replace(/^[\^~>=<*\s]+/, "");
  const match = /^([0-9]+)/.exec(cleanRange);
  if (match && match[1]) {
    return parseInt(match[1], 10);
  }
  return 0;
};

/**
 * Scan for common configuration markers in the project root and sort them
 */
export const detectConfigMarkers = (projectRoot: string): string[] => {
  const possibleMarkers = [
    "tsconfig.json",
    "package.json",
    "vite.config.ts",
    "vite.config.js",
    "webpack.config.js",
    "next.config.js",
    "next.config.mjs",
    "nuxt.config.ts",
    "nuxt.config.js",
    "tailwind.config.js",
    "tailwind.config.ts",
    "postcss.config.js",
    "eslint.config.js",
    ".eslintrc.js",
    ".eslintrc.json",
    "prettier.config.js",
    ".prettierrc",
    "svelte.config.js",
    "astro.config.mjs"
  ];

  const foundMarkers: string[] = [];
  for (const marker of possibleMarkers) {
    if (existsSync(join(projectRoot, marker))) {
      foundMarkers.push(marker);
    }
  }
  return foundMarkers.sort();
};

/**
 * Deterministically serialize any object or array (stable JSON)
 */
export const stableStringify = (obj: any): string => {
  if (obj === null) return "null";
  if (typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map(stableStringify).join(",") + "]";
  }
  const keys = Object.keys(obj).sort();
  const pairs = keys.map(k => `${JSON.stringify(k)}:${stableStringify((obj as any)[k])}`);
  return "{" + pairs.join(",") + "}";
};

/**
 * Compute a 16-character deterministic SHA-256 hash excluding timestamp and fingerprintHash
 */
export const calculateFingerprintHash = (
  fingerprint: Omit<ProjectFingerprint, "fingerprintHash" | "timestamp">
): string => {
  const {
    schemaVersion,
    primaryLanguage,
    packageManager,
    lockfileFamily,
    frameworks,
    databaseOrORM,
    testBuildTools,
    hostRuntimeAdapters,
    configMarkers
  } = fingerprint;

  const portableObj = {
    schemaVersion,
    primaryLanguage,
    packageManager,
    lockfileFamily,
    frameworks,
    databaseOrORM,
    testBuildTools,
    hostRuntimeAdapters,
    configMarkers
  };

  const stableJson = stableStringify(portableObj);
  const fullHash = hashText(stableJson);
  return fullHash.slice(0, 16);
};

/**
 * Main entry point for extracting the project compatibility fingerprint
 */
export const extractProjectFingerprint = (cwd: string): ProjectFingerprint => {
  const info = detectWorkspaceAndProjectRoots(cwd);

  // 1. Load dependencies from project-level package.json
  const localPkgPath = join(info.projectRoot, "package.json");
  const localDeps: Record<string, string> = {};
  if (existsSync(localPkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(localPkgPath, "utf-8"));
      Object.assign(localDeps, pkg.dependencies || {}, pkg.devDependencies || {});
    } catch {
      // Graceful tolerance fallback
    }
  }

  const allScanningDeps = Array.from(
    new Set([...FRAMEWORKS, ...DATABASE_OR_ORM, ...TEST_BUILD_TOOLS, ...HOST_RUNTIME_ADAPTERS])
  );

  // 2. Search for lockfiles from projectRoot up to workspaceRoot and parse their versions
  let lockfileContent = "";
  let lockfileResolved: Record<string, string> = {};

  const lockfilePaths = [
    join(info.projectRoot, "pnpm-lock.yaml"),
    join(info.projectRoot, "package-lock.json"),
    join(info.projectRoot, "yarn.lock"),
    join(info.workspaceRoot, "pnpm-lock.yaml"),
    join(info.workspaceRoot, "package-lock.json"),
    join(info.workspaceRoot, "yarn.lock")
  ];

  let loadedPath = "";
  for (const p of lockfilePaths) {
    if (existsSync(p)) {
      try {
        lockfileContent = readFileSync(p, "utf-8");
        loadedPath = p;
        break;
      } catch {
        // Ignore
      }
    }
  }

  if (lockfileContent) {
    const filename = basename(loadedPath);
    if (filename === "pnpm-lock.yaml") {
      lockfileResolved = parsePnpmLock(lockfileContent, allScanningDeps);
    } else if (filename === "package-lock.json") {
      lockfileResolved = parsePackageLock(lockfileContent, allScanningDeps);
    } else if (filename === "yarn.lock") {
      lockfileResolved = parseYarnLock(lockfileContent, allScanningDeps);
    }
  }

  // 3. Extract major versions combining package.json declarations and lockfile versions
  const getCategoryMap = (pkgList: string[]): Record<string, number> => {
    const map: Record<string, number> = {};
    for (const pkg of pkgList) {
      if (localDeps[pkg] !== undefined) {
        if (lockfileResolved[pkg]) {
          const major = parseInt(lockfileResolved[pkg].split(".")[0], 10);
          map[pkg] = isNaN(major) ? 0 : major;
        } else {
          map[pkg] = extractMajorFromRange(localDeps[pkg]);
        }
      }
    }
    return map;
  };

  const frameworks = getCategoryMap(FRAMEWORKS);
  const databaseOrORM = getCategoryMap(DATABASE_OR_ORM);
  const testBuildTools = getCategoryMap(TEST_BUILD_TOOLS);
  const hostRuntimeAdapters = getCategoryMap(HOST_RUNTIME_ADAPTERS);

  const primaryLanguage = detectPrimaryLanguage(info.projectRoot);
  const configMarkers = detectConfigMarkers(info.projectRoot);

  const partialFingerprint = {
    schemaVersion: "1",
    primaryLanguage,
    packageManager: info.packageManager,
    lockfileFamily: info.lockfileFamily,
    frameworks,
    databaseOrORM,
    testBuildTools,
    hostRuntimeAdapters,
    configMarkers,
    workspaceRootPath:
      info.workspaceRoot !== info.projectRoot ? normalizeScopeIdentityPath(info.workspaceRoot) : undefined,
    projectRootScopeId: info.projectRootScopeId
  };

  const fingerprintHash = calculateFingerprintHash(partialFingerprint);

  return {
    ...partialFingerprint,
    fingerprintHash,
    timestamp: Date.now()
  };
};

/**
 * Extract project fingerprint and atomically UPSERT into the SQLite database
 */
export const persistProjectFingerprint = (db: DatabaseSync, cwd: string): ScopeFingerprint => {
  const fp = extractProjectFingerprint(cwd);
  const now = nowIso();
  const repo = new ScopeFingerprintRepository(db);

  const existing = repo.getById(fp.projectRootScopeId!);
  const scopeFingerprint: ScopeFingerprint = {
    scope_id: fp.projectRootScopeId!,
    schema_version: fp.schemaVersion,
    fingerprint_hash: fp.fingerprintHash,
    fingerprint_json: JSON.stringify(fp),
    created_at: existing?.created_at ?? now,
    updated_at: now
  };

  repo.upsert(scopeFingerprint);
  return scopeFingerprint;
};
