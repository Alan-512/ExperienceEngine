#!/usr/bin/env bash
set -euo pipefail

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
PLUGIN_DATA="${CLAUDE_PLUGIN_DATA:-$PLUGIN_ROOT/.claude-plugin-data}"

export NODE_PATH="${CLAUDE_PLUGIN_DATA}/node_modules${NODE_PATH:+:${NODE_PATH}}"
export EXPERIENCE_ENGINE_HOME="${EXPERIENCE_ENGINE_HOME:-${PLUGIN_DATA}/experienceengine-home}"

exec node --no-warnings "${PLUGIN_ROOT}/dist/cli/index.js" claude-hook "$@"
