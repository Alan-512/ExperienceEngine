import { describe, expect, it } from "vitest";

import { buildRetrievalQuery } from "../../src/controller/query-rewrite.js";

describe("buildRetrievalQuery", () => {
  it("strips procedural read-only clauses and adds failing-test context for regression prompts", () => {
    const query = buildRetrievalQuery(
      "Investigate the payments auth test regression in this workspace by checking the auth fixture handshake first. Read-only analysis only; do not modify files."
    );

    expect(query.rawQueryText).toContain("Read-only analysis only");
    expect(query.retrievalQueryText).toContain(
      "Investigate the payments auth test regression by checking the auth fixture handshake first"
    );
    expect(query.retrievalQueryText).not.toContain("in this workspace");
    expect(query.retrievalQueryText).not.toContain("Read-only analysis only");
    expect(query.retrievalQueryText).not.toContain("do not modify files");
    expect(query.addedContextTerms).toContain("failing test");
    expect(query.rewriteApplied).toBe(true);
  });

  it("leaves already focused prompts unchanged", () => {
    const query = buildRetrievalQuery("Fix the failing payments auth test in ExperienceEngine");

    expect(query.retrievalQueryText).toBe("Fix the failing payments auth test in ExperienceEngine");
    expect(query.addedContextTerms).toEqual([]);
    expect(query.removedClauses).toEqual([]);
    expect(query.rewriteApplied).toBe(false);
  });

  it("normalizes authentication investigation prompts and strips read-only mode noise", () => {
    const query = buildRetrievalQuery(
      "Review payments authentication regression starting from fixture handshake behavior in read-only mode; identify likely first diagnostic step."
    );

    expect(query.retrievalQueryText).toContain("payments auth regression");
    expect(query.retrievalQueryText).toContain("fixture handshake");
    expect(query.retrievalQueryText).not.toContain("authentication");
    expect(query.retrievalQueryText).not.toContain("read-only mode");
    expect(query.addedContextTerms).toContain("failing test");
    expect(query.rewriteApplied).toBe(true);
  });
});
