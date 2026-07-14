import { describe, expect, it } from "vitest";
import {
  OPENCLAW_SECURITY_APPROVAL_CONTRACT,
  digestOpenClawSecurityScanSummary,
  isOpenClawSecurityApprovalRequired,
  normalizeOpenClawSecurityScanSummary
} from "../../src/install/openclaw-security-approval.js";

describe("OpenClaw security approval", () => {
  it("produces a stable digest when OpenClaw changes only its extraction root", () => {
    const first = new Error(
      'Config warnings: stale entry Plugin "experienceengine" installation blocked: dangerous code patterns detected: Shell command execution detected (/tmp/openclaw-plugin-ABC123/extract/package/dist/runtime/worker.js:10)'
    );
    const second = new Error(
      'Config warnings: another stale entry Plugin "experienceengine" installation blocked: dangerous code patterns detected: Shell command execution detected (/tmp/openclaw-plugin-ZYX987/extract/package/dist/runtime/worker.js:10)'
    );
    expect(isOpenClawSecurityApprovalRequired(first)).toBe(true);
    expect(normalizeOpenClawSecurityScanSummary(first)).toBe(
      'Plugin "experienceengine" installation blocked: dangerous code patterns detected: Shell command execution detected (<artifact>/dist/runtime/worker.js:10)'
    );
    expect(digestOpenClawSecurityScanSummary(first)).toBe(
      digestOpenClawSecurityScanSummary(second)
    );
  });

  it("does not classify unrelated install failures as security approval", () => {
    expect(isOpenClawSecurityApprovalRequired(
      new Error("package archive is corrupt")
    )).toBe(false);
  });

  it("freezes explicit and closure-bound approval behavior", () => {
    expect(OPENCLAW_SECURITY_APPROVAL_CONTRACT).toEqual({
      default_unsafe_install_flag: false,
      approval_is_explicit: true,
      scan_summary_removes_random_temp_roots: true,
      scan_summary_digest_algorithm: "sha256",
      signed_attestation_binds_candidate_closure: true
    });
  });
});
