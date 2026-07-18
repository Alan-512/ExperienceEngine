import { describe, expect, it } from "vitest";
import {
  assertReleaseArtifactEntries,
  RELEASE_CANDIDATE_REQUIRED_ENTRIES
} from "../../scripts/release/release-candidate-contract.mjs";

describe("release candidate artifact contract", () => {
  it.each(["npm", "clawhub"] as const)(
    "accepts a complete %s artifact entry set",
    (channel) => {
      expect(
        assertReleaseArtifactEntries(
          channel,
          RELEASE_CANDIDATE_REQUIRED_ENTRIES[channel]
        )
      ).toEqual({
        required_entries: [...RELEASE_CANDIDATE_REQUIRED_ENTRIES[channel]],
        required_entries_present: true
      });
    }
  );

  it.each(["npm", "clawhub"] as const)(
    "rejects a %s artifact missing one mandatory runtime entry",
    (channel) => {
      const entries = RELEASE_CANDIDATE_REQUIRED_ENTRIES[channel].slice(1);

      expect(() => assertReleaseArtifactEntries(channel, entries)).toThrow(
        `EE_RELEASE_ARTIFACT_INCOMPLETE: channel=${channel}`
      );
    }
  );

  it("rejects an unknown release channel", () => {
    expect(() =>
      assertReleaseArtifactEntries("unknown" as "npm", [])
    ).toThrow("EE_RELEASE_CHANNEL_INVALID");
  });

  it("requires the CLI only in the npm distribution surface", () => {
    expect(RELEASE_CANDIDATE_REQUIRED_ENTRIES.npm).toContain(
      "package/dist/cli/index.js"
    );
    expect(RELEASE_CANDIDATE_REQUIRED_ENTRIES.clawhub).not.toContain(
      "package/dist/cli/index.js"
    );
  });
});
