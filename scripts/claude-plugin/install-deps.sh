#!/usr/bin/env bash
set -euo pipefail

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
PLUGIN_DATA="${CLAUDE_PLUGIN_DATA:-$PLUGIN_ROOT/.claude-plugin-data}"
STAMP_PATH="$PLUGIN_DATA/.experienceengine-plugin-version"

mkdir -p "$PLUGIN_DATA"

PACKAGE_VERSION="$(node -e "const fs=require('fs'); const path=require('path'); const pkg=JSON.parse(fs.readFileSync(path.join(process.argv[1],'package.json'),'utf8')); process.stdout.write(pkg.version);" "$PLUGIN_ROOT")"

if [[ -f "$STAMP_PATH" ]] && [[ "$(cat "$STAMP_PATH")" == "$PACKAGE_VERSION" ]] && [[ -d "$PLUGIN_DATA/node_modules" ]]; then
  exit 0
fi

rm -rf "$PLUGIN_DATA/node_modules"
npm install --prefix "$PLUGIN_DATA" --no-package-lock --omit=dev "$PLUGIN_ROOT"
printf '%s' "$PACKAGE_VERSION" > "$STAMP_PATH"
