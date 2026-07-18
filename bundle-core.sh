#!/usr/bin/env bash
# Stage the Node render core into bundle-staging/mdTool/ so Tauri can embed it
# in the app Resources (see tauri.conf.json -> bundle.resources). The result is
# a self-contained core: compiled dist/, node_modules/, package.json, and a
# Node binary at bin/node so the released app needs no system Node.
#
# Usage: npm run bundle-core
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STAGE="$SCRIPT_DIR/bundle-staging/mdTool"

# Build the core first (no-op if already built).
( cd "$SCRIPT_DIR" && npm run build >/dev/null )

rm -rf "$STAGE"
mkdir -p "$STAGE/bin" "$STAGE/dist/src"

# Compiled core (tsc emits to dist/src/...).
cp -R "$SCRIPT_DIR/dist/src" "$STAGE/dist/"

# Runtime dependencies + package manifest.
cp -R "$SCRIPT_DIR/node_modules" "$STAGE/node_modules"
cp "$SCRIPT_DIR/package.json" "$STAGE/package.json"

# Theme CSS files are NOT compiled by tsc (only .ts -> .js). The core resolves
# them at dist/src/theme/themes/<name>.css, so stage the source theme dir there.
cp -R "$SCRIPT_DIR/src/theme/themes" "$STAGE/dist/src/theme/themes"

# Bundle a Node binary so the app is self-contained (must match build OS/arch).
NODE_BIN="$(command -v node)"
if [[ -z "$NODE_BIN" ]]; then
  echo "ERROR: 'node' not found on PATH; cannot bundle a Node runtime." >&2
  exit 1
fi
cp "$NODE_BIN" "$STAGE/bin/node"
chmod +x "$STAGE/bin/node"

echo "Staged core at $STAGE"
echo "  node: $($STAGE/bin/node --version) ($(basename "$NODE_BIN"))"
echo "  size: $(du -sh "$STAGE" | cut -f1)"
