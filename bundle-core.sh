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

# Remove any prior staging. Use find to delete contents first in case a file is
# momentarily locked (e.g. Spotlight/QuickLook holding a handle), then rmdir.
if [[ -d "$STAGE" ]]; then
  find "$STAGE" -mindepth 1 -maxdepth 1 -exec rm -rf {} + 2>/dev/null || true
  rmdir "$STAGE" 2>/dev/null || true
fi
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
# `command -v node` (Git Bash/MSYS on Windows) strips the `.exe`, so we re-add it
# when the bare path is not executable. main.rs resolves the interpreter by
# checking both `node` and `node.exe`.
NODE_BIN="$(command -v node)"
if [[ -z "$NODE_BIN" ]]; then
  echo "ERROR: 'node' not found on PATH; cannot bundle a Node runtime." >&2
  exit 1
fi
# On Windows `command -v` returns e.g. `/c/Program Files/nodejs/node` (no .exe),
# and that bare path is not directly runnable. If the resolved name has no .exe
# extension but a sibling `<name>.exe` exists, use that so the copied binary is
# actually executable on Windows. main.rs also checks both `node` and `node.exe`.
if [[ "${NODE_BIN##*.}" != "exe" && -f "${NODE_BIN}.exe" ]]; then
  NODE_BIN="${NODE_BIN}.exe"
fi
NODE_NAME="$(basename "$NODE_BIN")"
cp "$NODE_BIN" "$STAGE/bin/$NODE_NAME"
chmod +x "$STAGE/bin/$NODE_NAME"

# ── Bundle Chromium (Playwright) so PDF export needs no system browser ──
# Playwright looks for browsers under PLAYWRIGHT_BROWSERS_PATH (defaults to
# ~/.cache/ms-playwright on macOS/Linux, %LOCALAPPDATA%/ms-playwright on Windows).
# We copy that dir into the staged core and point the runtime at it via the same
# env var, so the released app is fully self-contained.
# Candidate locations, in priority order. We take the first that actually exists
# and is non-empty (a bare path string doesn't mean the dir is there).
PW_CANDIDATES=(
  "${PLAYWRIGHT_BROWSERS_PATH:-}"
  "$HOME/.cache/ms-playwright"
  "$HOME/Library/Caches/ms-playwright"
  "${LOCALAPPDATA:-}/ms-playwright"
  "${USERPROFILE:-}/AppData/Local/ms-playwright"
)
PW_SRC=""
for cand in "${PW_CANDIDATES[@]}"; do
  if [[ -n "$cand" && -d "$cand" && -n "$(ls -A "$cand" 2>/dev/null)" ]]; then
    PW_SRC="$cand"
    break
  fi
done
if [[ -n "$PW_SRC" ]]; then
  cp -R "$PW_SRC" "$STAGE/ms-playwright"
  # ms-playwright sits next to bin/ and dist/ at the core root.
  echo "  playwright browsers: $(du -sh "$STAGE/ms-playwright" | cut -f1)"
else
  echo "WARNING: Playwright Chromium not found in any of:" >&2
  printf '           - %s\n' "${PW_CANDIDATES[@]}" >&2
  echo "         Run 'npx playwright install chromium' before bundling," >&2
  echo "         otherwise PDF export will fail on the user's machine." >&2
fi

echo "Staged core at $STAGE"
echo "  node: $($STAGE/bin/$NODE_NAME --version) ($NODE_NAME)"
echo "  size: $(du -sh "$STAGE" | cut -f1)"

# Drop macOS metadata so it doesn't leak into the shipped bundle.
find "$STAGE" -name '.DS_Store' -delete 2>/dev/null || true
# Drop the dev-only tsx entry so the bundled core never pulls the dev runtime.
