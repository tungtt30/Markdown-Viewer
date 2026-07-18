#!/usr/bin/env bash
# Build steps that must run before the Rust/Tauri app is bundled.
# Path resolution is cwd-independent: ROOT is derived from this script's own
# location, so it works no matter what directory Tauri invokes it from.
set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND="$ROOT/tauri-app"

# 1) Frontend bundle (vite -> tauri-app/dist).
( cd "$FRONTEND" && npm run build )

# 2) Compile the Node core (tsc -> dist/) and stage it into bundle-staging/
#    so Tauri can embed it in the app Resources (see bundle-core.sh).
( cd "$ROOT" && npm run bundle-core )
