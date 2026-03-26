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
PACKAGE_VERSION="0.1.2"
PACKAGE_SPEC="${EXPERIENCE_ENGINE_PLUGIN_PACKAGE_SPEC:-@alan512/experienceengine@${PACKAGE_VERSION}}"

mkdir -p "${PLUGIN_DATA}"

if [[ -f "${STAMP_PATH}" ]] && [[ "$(cat "${STAMP_PATH}")" == "${PACKAGE_VERSION}" ]] && [[ -f "${PACKAGE_ENTRY}" ]]; then
  exit 0
fi

rm -rf "${PLUGIN_DATA}/node_modules"
npm install --prefix "${PLUGIN_DATA}" --no-package-lock --omit=dev --ignore-scripts "${PACKAGE_SPEC}"
printf '%s' "${PACKAGE_VERSION}" > "${STAMP_PATH}"
