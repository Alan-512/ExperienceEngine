import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string): string => readFileSync(resolve(path), "utf8");

const issueTemplates = [
  ".github/ISSUE_TEMPLATE/installation-problem.yml",
  ".github/ISSUE_TEMPLATE/runtime-bug.yml",
  ".github/ISSUE_TEMPLATE/harmful-intervention.yml",
  ".github/ISSUE_TEMPLATE/feature-request.yml"
];

describe("public feedback assets", () => {
  it("ships the required issue, contribution, and security surfaces", () => {
    for (const path of [
      ...issueTemplates,
      ".github/ISSUE_TEMPLATE/config.yml",
      "CONTRIBUTING.md",
      "SECURITY.md"
    ]) {
      expect(existsSync(resolve(path)), path).toBe(true);
    }
  });

  it("keeps bug-oriented templates on reviewed diagnostics and explicit privacy confirmation", () => {
    for (const path of issueTemplates.slice(0, 3)) {
      const content = read(path);
      expect(content).toContain("Reviewed diagnostic evidence");
      expect(content).toContain("Privacy confirmation");
      expect(content).toMatch(/raw (SQLite|databases)/i);
      expect(content).toMatch(/credentials/i);
      expect(content).toMatch(/provider/i);
      expect(content).not.toMatch(/label:\s*(Raw prompt|Database upload|Full logs)/i);
    }
  });

  it("keeps feature diagnostics optional and security reports private", () => {
    expect(read(".github/ISSUE_TEMPLATE/feature-request.yml")).toContain(
      "Diagnostic artifacts are optional for feature requests"
    );
    const security = read("SECURITY.md");
    expect(security).toContain("Do not open a public issue");
    expect(security).toContain("private vulnerability reporting");
    expect(security).toContain("No upload or report submission occurs automatically");
    expect(read(".github/ISSUE_TEMPLATE/config.yml")).toContain(
      "security/policy"
    );
  });

  it("requires synthetic fixtures and preserves product authority boundaries", () => {
    const contributing = read("CONTRIBUTING.md");
    expect(contributing).toContain("synthetic or sanitized data");
    expect(contributing).toContain("Do not bypass delivery-state, activation, fencing, queue, or migration authority");
    expect(contributing).toContain("No upload occurs automatically");
  });

  it("keeps English, Chinese, and user-guide workflows aligned", () => {
    for (const path of ["README.md", "README.zh-CN.md", "docs/user-guide.md"]) {
      const content = read(path);
      expect(content, path).toContain("ee diagnose --prepare-bundle");
      expect(content, path).toContain("ee diagnose --archive <review-directory>");
      expect(content, path).toMatch(/No upload|不会自动上传|No upload or GitHub issue/i);
      expect(content, path).toContain("manifest.json");
    }
  });
});
