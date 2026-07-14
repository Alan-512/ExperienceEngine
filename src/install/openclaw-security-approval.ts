import { createHash } from "node:crypto";

const ANSI_ESCAPE_PATTERN = /\u001b\[[0-9;]*m/gu;
const POSIX_OPENCLAW_TEMP_PATTERN =
  /\/tmp\/openclaw-plugin-[^/\s]+\/extract\/package\//giu;
const WINDOWS_OPENCLAW_TEMP_PATTERN =
  /[A-Za-z]:\\[^\r\n]*?\\openclaw-plugin-[^\\\s]+\\extract\\package\\/giu;

const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const isOpenClawSecurityApprovalRequired = (error: unknown): boolean =>
  /dangerously-force-unsafe-install|unsafe install|security scan|security approval|dangerous code patterns detected|installation blocked/iu.test(
    errorText(error)
  );

export const normalizeOpenClawSecurityScanSummary = (error: unknown): string => {
  const normalized = errorText(error)
    .replace(ANSI_ESCAPE_PATTERN, "")
    .replace(POSIX_OPENCLAW_TEMP_PATTERN, "<artifact>/")
    .replace(WINDOWS_OPENCLAW_TEMP_PATTERN, "<artifact>/")
    .replace(/\\/gu, "/")
    .replace(/\s+/gu, " ")
    .trim();
  const blockedIndex = normalized.search(
    /Plugin\s+"?experienceengine"?\s+installation blocked|dangerous code patterns detected/iu
  );
  return (blockedIndex >= 0 ? normalized.slice(blockedIndex) : normalized)
    .slice(0, 8_000);
};

export const digestOpenClawSecurityScanSummary = (error: unknown): string =>
  createHash("sha256")
    .update(normalizeOpenClawSecurityScanSummary(error), "utf8")
    .digest("hex");

export const OPENCLAW_SECURITY_APPROVAL_CONTRACT = Object.freeze({
  default_unsafe_install_flag: false,
  approval_is_explicit: true,
  scan_summary_removes_random_temp_roots: true,
  scan_summary_digest_algorithm: "sha256",
  signed_attestation_binds_candidate_closure: true
});
