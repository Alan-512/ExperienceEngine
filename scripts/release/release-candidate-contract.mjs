const COMMON_RUNTIME_ENTRIES = Object.freeze([
  "package/package.json",
  "package/openclaw.plugin.json",
  "package/dist/plugin/openclaw-plugin.js",
  "package/dist/runtime/package/runtime-closure-manifest.json"
]);

export const RELEASE_CANDIDATE_REQUIRED_ENTRIES = Object.freeze({
  npm: Object.freeze([
    ...COMMON_RUNTIME_ENTRIES,
    "package/dist/cli/index.js",
    "package/docs/assets/readme/experienceengine-icon.png",
    "package/plugins/claude-code-experienceengine/.claude-plugin/plugin.json",
    "package/plugins/claude-code-experienceengine/scripts/install-deps.sh"
  ]),
  clawhub: Object.freeze([
    ...COMMON_RUNTIME_ENTRIES,
    "package/node_modules/@modelcontextprotocol/sdk/package.json",
    "package/node_modules/zod/package.json"
  ])
});

export const assertReleaseArtifactEntries = (channel, entries) => {
  const requiredEntries = RELEASE_CANDIDATE_REQUIRED_ENTRIES[channel];
  if (!requiredEntries) {
    throw new Error(`EE_RELEASE_CHANNEL_INVALID: ${String(channel)}`);
  }

  const entrySet = new Set(entries);
  const missingEntries = requiredEntries.filter((entry) => !entrySet.has(entry));
  if (missingEntries.length > 0) {
    throw new Error(
      `EE_RELEASE_ARTIFACT_INCOMPLETE: channel=${channel} missing=${missingEntries.join(",")}`
    );
  }

  return {
    required_entries: [...requiredEntries],
    required_entries_present: true
  };
};
