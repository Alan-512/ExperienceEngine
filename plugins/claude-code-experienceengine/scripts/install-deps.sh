#!/usr/bin/env bash
set -euo pipefail

PLUGIN_DATA="${CLAUDE_PLUGIN_DATA:?CLAUDE_PLUGIN_DATA is required}"
PACKAGE_DIR="${PLUGIN_DATA}/node_modules/experienceengine"
STAMP_PATH="${PLUGIN_DATA}/.experienceengine-plugin-version"
REPO_URL="${EXPERIENCE_ENGINE_PLUGIN_GIT_URL:-https://github.com/Alan-512/ExperienceEngine.git}"
REPO_REF="${EXPERIENCE_ENGINE_PLUGIN_GIT_REF:-main}"
PACKAGE_VERSION="0.1.0"

mkdir -p "${PLUGIN_DATA}"

if [[ -f "${STAMP_PATH}" ]] && [[ "$(cat "${STAMP_PATH}")" == "${PACKAGE_VERSION}" ]] && [[ -d "${PACKAGE_DIR}" ]]; then
  exit 0
fi

rm -rf "${PLUGIN_DATA}/node_modules"
npm install --prefix "${PLUGIN_DATA}" --no-package-lock --omit=dev "${REPO_URL}#${REPO_REF}"
printf '%s' "${PACKAGE_VERSION}" > "${STAMP_PATH}"
