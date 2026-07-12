import { randomBytes, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import {
  chmod,
  link,
  mkdir,
  open,
  readFile,
  rm,
  stat
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import {
  MACHINE_INTEGRITY_KEY_RELATIVE_PATH,
  MACHINE_INTEGRITY_KEY_SCHEMA_VERSION,
  type IntegrityHmacDomain
} from "./constants.js";
import { RuntimeIdentityError } from "./errors.js";
import { createDomainSeparatedHmac } from "./home-identity.js";
import type { MachineIntegrityKey } from "./types.js";

const KEY_MATERIAL_BYTES = 32;
const WINDOWS_FULL_CONTROL_MASK = 2032127;
const execFileAsync = promisify(execFile);
let windowsUserSidPromise: Promise<string> | undefined;
const inFlightKeyAdoptions = new Map<string, Promise<MachineIntegrityKey>>();

const isNodeError = (error: unknown): error is NodeJS.ErrnoException =>
  error instanceof Error;

const parseCsvFields = (line: string): string[] => {
  const fields: string[] = [];
  const pattern = /"((?:[^"]|"")*)"(?:,|$)/gu;
  for (const match of line.matchAll(pattern)) {
    fields.push(match[1].replace(/""/gu, '"'));
  }
  return fields;
};

const resolveWindowsUserSid = async (): Promise<string> => {
  windowsUserSidPromise ??= execFileAsync("whoami", ["/user", "/fo", "csv", "/nh"], {
    windowsHide: true,
    encoding: "utf8"
  }).then(({ stdout }) => {
    const fields = parseCsvFields(stdout.trim());
    const sid = fields[1];
    if (!sid || !/^S-\d(?:-\d+)+$/u.test(sid)) {
      throw new RuntimeIdentityError(
        "EE_INTEGRITY_KEY_INVALID",
        "Unable to resolve the current Windows user SID for integrity-key permissions."
      );
    }
    return sid;
  });
  return windowsUserSidPromise;
};

type WindowsAclEntry = {
  sid: string;
  type: "Allow" | "Deny" | string;
  inherited: boolean;
  rights: number;
};

type WindowsAclReport = {
  protected: boolean;
  entries: WindowsAclEntry[];
};

const readWindowsAclReport = async (path: string): Promise<WindowsAclReport> => {
  const script = [
    "$acl = Get-Acl -LiteralPath $env:EE_INTEGRITY_ACL_PATH",
    "$entries = @($acl.Access | ForEach-Object {",
    "  [pscustomobject]@{",
    "    sid = $_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value",
    "    type = $_.AccessControlType.ToString()",
    "    inherited = $_.IsInherited",
    "    rights = [int64]$_.FileSystemRights",
    "  }",
    "})",
    "[pscustomobject]@{",
    "  protected = $acl.AreAccessRulesProtected",
    "  entries = $entries",
    "} | ConvertTo-Json -Depth 4 -Compress"
  ].join("\n");
  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      {
        windowsHide: true,
        encoding: "utf8",
        env: {
          ...process.env,
          EE_INTEGRITY_ACL_PATH: path
        }
      }
    );
    const parsed = JSON.parse(stdout.trim()) as {
      protected: boolean;
      entries: WindowsAclEntry | WindowsAclEntry[] | null;
    };
    return {
      protected: parsed.protected,
      entries: parsed.entries === null
        ? []
        : Array.isArray(parsed.entries)
          ? parsed.entries
          : [parsed.entries]
    };
  } catch (error) {
    throw new RuntimeIdentityError(
      "EE_INTEGRITY_KEY_INVALID",
      `Unable to inspect integrity-key Windows ACLs: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

const aclIsCurrentUserOnly = (report: WindowsAclReport, sid: string): boolean =>
  report.protected && report.entries.length > 0 && report.entries.every((entry) =>
    entry.sid === sid &&
    entry.type === "Allow" &&
    entry.inherited === false &&
    (entry.rights & WINDOWS_FULL_CONTROL_MASK) === WINDOWS_FULL_CONTROL_MASK
  );

const applyWindowsUserOnlyAcl = async (path: string, directory: boolean): Promise<void> => {
  const sid = await resolveWindowsUserSid();
  const script = [
    "$path = $env:EE_INTEGRITY_ACL_PATH",
    "$sid = $env:EE_INTEGRITY_ACL_SID",
    "$grant = if ($env:EE_INTEGRITY_ACL_DIRECTORY -eq 'true') { '*' + $sid + ':(OI)(CI)(F)' } else { '*' + $sid + ':(F)' }",
    "& icacls.exe $path /inheritance:r /grant:r $grant | Out-Null",
    "if ($LASTEXITCODE -ne 0) { throw 'initial icacls grant failed' }",
    "$initialRules = @((Get-Acl -LiteralPath $path).Access)",
    "foreach ($entry in $initialRules) {",
    "  $entrySid = $entry.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value",
    "  $entryType = $entry.AccessControlType.ToString()",
    "  if ($entrySid -eq $sid -and $entryType -eq 'Allow') { continue }",
    "  $removeMode = if ($entryType -eq 'Deny') { '/remove:d' } else { '/remove:g' }",
    "  & icacls.exe $path $removeMode ('*' + $entrySid) | Out-Null",
    "  if ($LASTEXITCODE -ne 0) { throw ('icacls remove failed for ' + $entrySid) }",
    "}",
    "& icacls.exe $path /inheritance:r /grant:r $grant | Out-Null",
    "if ($LASTEXITCODE -ne 0) { throw 'final icacls grant failed' }",
    "$acl = Get-Acl -LiteralPath $path",
    "$entries = @($acl.Access)",
    "$valid = $acl.AreAccessRulesProtected -and $entries.Count -gt 0",
    "foreach ($entry in $entries) {",
    "  $entrySid = $entry.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value",
    "  $rights = [int64]$entry.FileSystemRights",
    `  if ($entrySid -ne $sid -or $entry.AccessControlType.ToString() -ne 'Allow' -or $entry.IsInherited -or (($rights -band ${WINDOWS_FULL_CONTROL_MASK}) -ne ${WINDOWS_FULL_CONTROL_MASK})) {`,
    "    $valid = $false",
    "  }",
    "}",
    "if (-not $valid) { throw 'Windows ACL verification did not converge on the current user only' }"
  ].join("\n");
  try {
    await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      {
        windowsHide: true,
        encoding: "utf8",
        env: {
          ...process.env,
          EE_INTEGRITY_ACL_PATH: path,
          EE_INTEGRITY_ACL_SID: sid,
          EE_INTEGRITY_ACL_DIRECTORY: directory ? "true" : "false"
        }
      }
    );
  } catch (error) {
    throw new RuntimeIdentityError(
      "EE_INTEGRITY_KEY_INVALID",
      `Unable to enforce user-only Windows ACLs for the integrity key: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

const applyUserOnlyPermissions = async (path: string, directory: boolean): Promise<void> => {
  if (process.platform === "win32") {
    await applyWindowsUserOnlyAcl(path, directory);
    return;
  }
  await chmod(path, directory ? 0o700 : 0o600);
};

const hasWindowsUserOnlyAcl = async (path: string): Promise<boolean> => {
  const sid = await resolveWindowsUserSid();
  return aclIsCurrentUserOnly(await readWindowsAclReport(path), sid);
};

const createCandidateKey = (now: Date): MachineIntegrityKey => ({
  key_schema_version: MACHINE_INTEGRITY_KEY_SCHEMA_VERSION,
  integrity_key_id: `ik_${randomUUID()}`,
  key_material: randomBytes(KEY_MATERIAL_BYTES).toString("base64url"),
  created_at: now.toISOString()
});

const validateMachineIntegrityKey = (value: unknown): MachineIntegrityKey => {
  if (!value || typeof value !== "object") {
    throw new RuntimeIdentityError("EE_INTEGRITY_KEY_INVALID", "Machine integrity key is not an object.");
  }

  const key = value as Partial<MachineIntegrityKey>;
  const encodedMaterial = typeof key.key_material === "string" ? key.key_material : "";
  const material = /^[A-Za-z0-9_-]{43}$/u.test(encodedMaterial)
    ? Buffer.from(encodedMaterial, "base64url")
    : Buffer.alloc(0);
  if (
    key.key_schema_version !== MACHINE_INTEGRITY_KEY_SCHEMA_VERSION ||
    typeof key.integrity_key_id !== "string" ||
    !key.integrity_key_id.startsWith("ik_") ||
    material.length !== KEY_MATERIAL_BYTES ||
    material.toString("base64url") !== encodedMaterial ||
    typeof key.created_at !== "string" ||
    Number.isNaN(Date.parse(key.created_at))
  ) {
    throw new RuntimeIdentityError(
      "EE_INTEGRITY_KEY_INVALID",
      "Machine integrity key does not match the frozen v1 schema."
    );
  }

  return key as MachineIntegrityKey;
};

export const resolveMachineIntegrityKeyPath = (canonicalHome: string): string =>
  join(canonicalHome, ...MACHINE_INTEGRITY_KEY_RELATIVE_PATH.split("/"));

export const readMachineIntegrityKey = async (canonicalHome: string): Promise<MachineIntegrityKey> => {
  const path = resolveMachineIntegrityKeyPath(canonicalHome);
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    throw new RuntimeIdentityError(
      "EE_INTEGRITY_KEY_INVALID",
      `Machine integrity key is missing or unreadable: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  try {
    return validateMachineIntegrityKey(JSON.parse(raw));
  } catch (error) {
    if (error instanceof RuntimeIdentityError) {
      throw error;
    }
    throw new RuntimeIdentityError("EE_INTEGRITY_KEY_INVALID", "Machine integrity key JSON is invalid.");
  }
};

const createOrAdoptMachineIntegrityKeyInternal = async (
  canonicalHome: string,
  options: { now?: () => Date } = {}
): Promise<MachineIntegrityKey> => {
  const finalPath = resolveMachineIntegrityKeyPath(canonicalHome);
  const keyDir = dirname(finalPath);
  await mkdir(keyDir, { recursive: true, mode: 0o700 });
  await applyUserOnlyPermissions(keyDir, true);

  const candidate = createCandidateKey((options.now ?? (() => new Date()))());
  const candidatePath = `${finalPath}.${process.pid}.${randomUUID()}.candidate`;
  let candidateCreated = false;
  try {
    const handle = await open(candidatePath, "wx", 0o600);
    candidateCreated = true;
    try {
      await handle.writeFile(`${JSON.stringify(candidate, null, 2)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await applyUserOnlyPermissions(candidatePath, false);

    try {
      await link(candidatePath, finalPath);
      await applyUserOnlyPermissions(finalPath, false);
      return candidate;
    } catch (error) {
      if (!isNodeError(error) || error.code !== "EEXIST") {
        throw error;
      }
      await applyUserOnlyPermissions(finalPath, false);
      return readMachineIntegrityKey(canonicalHome);
    }
  } finally {
    if (candidateCreated) {
      await rm(candidatePath, { force: true });
    }
  }
};

export const createOrAdoptMachineIntegrityKey = (
  canonicalHome: string,
  options: { now?: () => Date } = {}
): Promise<MachineIntegrityKey> => {
  const finalPath = resolveMachineIntegrityKeyPath(canonicalHome);
  const existing = inFlightKeyAdoptions.get(finalPath);
  if (existing) {
    return existing;
  }
  const pending = createOrAdoptMachineIntegrityKeyInternal(canonicalHome, options)
    .finally(() => {
      if (inFlightKeyAdoptions.get(finalPath) === pending) {
        inFlightKeyAdoptions.delete(finalPath);
      }
    });
  inFlightKeyAdoptions.set(finalPath, pending);
  return pending;
};

export const assertMachineIntegrityKeyPermissions = async (canonicalHome: string): Promise<boolean> => {
  if (process.platform === "win32") {
    const keyPath = resolveMachineIntegrityKeyPath(canonicalHome);
    const [directoryValid, fileValid] = await Promise.all([
      hasWindowsUserOnlyAcl(dirname(keyPath)),
      hasWindowsUserOnlyAcl(keyPath)
    ]);
    return directoryValid && fileValid;
  }
  const keyPath = resolveMachineIntegrityKeyPath(canonicalHome);
  const [directoryStat, keyStat] = await Promise.all([
    stat(dirname(keyPath)),
    stat(keyPath)
  ]);
  return directoryStat.isDirectory() &&
    keyStat.isFile() &&
    (directoryStat.mode & 0o077) === 0 &&
    (keyStat.mode & 0o077) === 0;
};

export const assertMachineIntegrityKeyId = (
  key: MachineIntegrityKey,
  expectedIntegrityKeyId: string
): void => {
  if (key.integrity_key_id !== expectedIntegrityKeyId) {
    throw new RuntimeIdentityError(
      "EE_INTEGRITY_KEY_MISMATCH",
      `Machine integrity key id mismatch: expected ${expectedIntegrityKeyId}, observed ${key.integrity_key_id}.`
    );
  }
};

export const hmacMachineIntegrityInput = (
  key: MachineIntegrityKey,
  domain: IntegrityHmacDomain,
  value: string | Uint8Array
): string => createDomainSeparatedHmac(key, domain, value);
