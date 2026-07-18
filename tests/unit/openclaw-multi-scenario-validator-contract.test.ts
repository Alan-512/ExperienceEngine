import { describe, expect, it } from "vitest";
import {
  requireCompleteBlockDisposition
} from "../../scripts/validation/lib/openclaw-multi-scenario-validator-contract.mjs";

describe("OpenClaw multi-scenario validator contract", () => {
  it("accepts the frozen complete disposition", () => {
    const disposition = { disposition: "complete", evidence: "sealed" };
    expect(requireCompleteBlockDisposition(disposition, "block-1")).toBe(disposition);
  });

  it("rejects excluded and missing dispositions", () => {
    expect(() => requireCompleteBlockDisposition(
      { disposition: "excluded_infrastructure" },
      "block-2"
    )).toThrow("Block block-2 lacks a complete disposition.");
    expect(() => requireCompleteBlockDisposition(null, "block-3")).toThrow(
      "Block block-3 lacks a complete disposition."
    );
  });

  it("rejects the obsolete included-complete spelling", () => {
    expect(() => requireCompleteBlockDisposition(
      { disposition: "included_complete" },
      "block-4"
    )).toThrow("Block block-4 lacks a complete disposition.");
  });
});
