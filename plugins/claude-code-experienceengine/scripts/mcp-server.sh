#!/usr/bin/env bash
set -euo pipefail

PLUGIN_DATA="${CLAUDE_PLUGIN_DATA:-${CLAUDE_PLUGIN_ROOT:-}}"
if [[ -z "${PLUGIN_DATA}" ]]; then
  echo "CLAUDE_PLUGIN_DATA or CLAUDE_PLUGIN_ROOT is required" >&2
  exit 1
fi

INSTALL_SCRIPT="${PLUGIN_DATA}/scripts/install-deps.sh"
if [[ -x "${INSTALL_SCRIPT}" ]]; then
  "${INSTALL_SCRIPT}" >&2
fi

export NODE_PATH="${PLUGIN_DATA}/node_modules${NODE_PATH:+:${NODE_PATH}}"
export EXPERIENCE_ENGINE_HOME="${EXPERIENCE_ENGINE_HOME:-${PLUGIN_DATA}/experienceengine-home}"
STATE_PATH="${EXPERIENCE_ENGINE_HOME}/claude-marketplace-state.json"

node - "${STATE_PATH}" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const [statePath] = process.argv.slice(2);
let current = {};
try {
  current = JSON.parse(fs.readFileSync(statePath, "utf8"));
} catch {}

const next = {
  adapter: "claude-code",
  install_mode: "marketplace",
  hook_source: "marketplace",
  package_version: current.package_version,
  written_at: current.written_at ?? new Date().toISOString(),
  last_hook_seen_at: current.last_hook_seen_at,
  last_mcp_seen_at: new Date().toISOString()
};

fs.mkdirSync(path.dirname(statePath), { recursive: true });
fs.writeFileSync(statePath, `${JSON.stringify(next, null, 2)}\n`);
NODE

exec node --no-warnings "${PLUGIN_DATA}/node_modules/@alan512/experienceengine/dist/cli/index.js" mcp-server "$@"
