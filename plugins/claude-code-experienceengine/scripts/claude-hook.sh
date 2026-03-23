#!/usr/bin/env bash
set -euo pipefail

PLUGIN_DATA="${CLAUDE_PLUGIN_DATA:?CLAUDE_PLUGIN_DATA is required}"

export NODE_PATH="${PLUGIN_DATA}/node_modules${NODE_PATH:+:${NODE_PATH}}"
export EXPERIENCE_ENGINE_HOME="${EXPERIENCE_ENGINE_HOME:-${PLUGIN_DATA}/experienceengine-home}"

exec node --no-warnings "${PLUGIN_DATA}/node_modules/@alan512/experienceengine/dist/cli/index.js" claude-hook "$@"
