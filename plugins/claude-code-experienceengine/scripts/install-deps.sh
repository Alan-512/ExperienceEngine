#!/usr/bin/env bash
set -euo pipefail

PLUGIN_DATA="${CLAUDE_PLUGIN_DATA:-${CLAUDE_PLUGIN_ROOT:-}}"
if [[ -z "${PLUGIN_DATA}" ]]; then
  echo "CLAUDE_PLUGIN_DATA or CLAUDE_PLUGIN_ROOT is required" >&2
  exit 1
fi
PACKAGE_DIR="${PLUGIN_DATA}/node_modules/@alan512/experienceengine"
PACKAGE_ENTRY="${PACKAGE_DIR}/dist/cli/index.js"
STAMP_PATH="${PLUGIN_DATA}/.experienceengine-plugin-version"
EXPERIENCE_ENGINE_HOME_PATH="${EXPERIENCE_ENGINE_HOME:-${PLUGIN_DATA}/experienceengine-home}"
STATE_PATH="${EXPERIENCE_ENGINE_HOME_PATH}/claude-marketplace-state.json"
PACKAGE_VERSION="0.1.2"
PACKAGE_SPEC="${EXPERIENCE_ENGINE_PLUGIN_PACKAGE_SPEC:-@alan512/experienceengine@${PACKAGE_VERSION}}"

mkdir -p "${PLUGIN_DATA}"
mkdir -p "${EXPERIENCE_ENGINE_HOME_PATH}"

write_marketplace_state() {
  node - "${STATE_PATH}" "${PACKAGE_VERSION}" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const [statePath, packageVersion] = process.argv.slice(2);
let current = {};
try {
  current = JSON.parse(fs.readFileSync(statePath, "utf8"));
} catch {}

const next = {
  adapter: "claude-code",
  install_mode: "marketplace",
  hook_source: "marketplace",
  package_version: packageVersion,
  written_at: current.written_at ?? new Date().toISOString(),
  last_hook_seen_at: current.last_hook_seen_at,
  last_mcp_seen_at: current.last_mcp_seen_at
};

fs.mkdirSync(path.dirname(statePath), { recursive: true });
fs.writeFileSync(statePath, `${JSON.stringify(next, null, 2)}\n`);
NODE
}

if [[ -f "${STAMP_PATH}" ]] && [[ "$(cat "${STAMP_PATH}")" == "${PACKAGE_VERSION}" ]] && [[ -f "${PACKAGE_ENTRY}" ]]; then
  write_marketplace_state
  exit 0
fi

rm -rf "${PLUGIN_DATA}/node_modules"
npm install --prefix "${PLUGIN_DATA}" --no-package-lock --omit=dev --ignore-scripts "${PACKAGE_SPEC}"
printf '%s' "${PACKAGE_VERSION}" > "${STAMP_PATH}"
write_marketplace_state
