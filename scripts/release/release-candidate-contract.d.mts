export type ReleaseCandidateChannel = "npm" | "clawhub";

export const RELEASE_CANDIDATE_REQUIRED_ENTRIES: Readonly<
  Record<ReleaseCandidateChannel, readonly string[]>
>;

export function assertReleaseArtifactEntries(
  channel: ReleaseCandidateChannel,
  entries: readonly string[]
): {
  required_entries: string[];
  required_entries_present: true;
};
