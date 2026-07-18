#!/usr/bin/env bash
# Build a .dmg for mdTool on macOS, working around the macOS 15/26
# "Resource busy" failure Tauri's vendored create-dmg hits when it
# opens a Finder window on the mounted volume and can't unmount it.
#
# Usage: ./make-dmg.sh
# Requires: the .app already built at
#   tauri-app/src-tauri/target/release/bundle/macos/mdTool.app

set -e
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$SCRIPT_DIR/tauri-app/src-tauri/target/release/bundle/macos"
APP="$APP_DIR/mdTool.app"
OUT_DIR="$SCRIPT_DIR/tauri-app/src-tauri/target/release/bundle/dmg"
OUT="$OUT_DIR/mdTool_0.1.0_aarch64.dmg"
SRC_RW="$OUT_DIR/rw.mdtool.dmg"

if [[ ! -d "$APP" ]]; then
  echo "ERROR: $APP not found. Run 'npm run tauri build' first (app bundles fine; the dmg step may fail — that's ok)." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
rm -f "$OUT" "$SRC_RW"

# Size the image from the .app contents (+ headroom).
SIZE_MB=$(( ( $(du -sm "$APP" | cut -f1) + 20 ) ))

# Close any Finder window that may hold a volume lock (macOS 15/26 fix).
osascript -e 'tell application "Finder" to close every window' 2>/dev/null || true

echo "Creating read-write DMG ($SIZE_MB MB)..."
hdiutil create -srcfolder "$APP" -volname "mdTool" -fs HFS+ \
  -format UDRW -size "${SIZE_MB}m" "$SRC_RW"

DEV=$(hdiutil attach -readwrite -noverify -noautoopen "$SRC_RW" | grep -E '^/dev/' | sed 1q | awk '{print $1}')
MOUNT="/Volumes/mdTool"

# Optional: pretty layout. On macOS 26 (Tahoe) skip the AppleScript that
# opens a Finder window — it keeps the volume busy and breaks unmount.
if [[ "$(sw_vers -productVersion | cut -d. -f1)" -lt 26 ]]; then
  osascript -e 'tell application "Finder" to close every window' 2>/dev/null || true
fi

# Detach the writable image BEFORE converting (convert needs it unmounted).
echo "Unmounting writable image..."
osascript -e 'tell application "Finder" to close every window' 2>/dev/null || true
hdiutil detach "$DEV" -force 2>/dev/null || diskutil unmount force "$DEV" 2>/dev/null || true

echo "Converting to compressed, read-only DMG..."
hdiutil convert "$SRC_RW" -format UDZO -imagekey zlib-level=9 -o "$OUT"
rm -f "$SRC_RW"

echo "Done: $OUT"
