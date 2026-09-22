#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-run}"
case "$MODE" in run|--verify|--debug|--logs|--telemetry) ;; *) echo "Usage: $0 [--verify|--debug|--logs|--telemetry]" >&2; exit 2 ;; esac
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGE_DIR="$ROOT_DIR/macos"
APP_BUNDLE="$PACKAGE_DIR/dist/Aster.app"
APP_CONTENTS="$APP_BUNDLE/Contents"
APP_BINARY="$APP_CONTENTS/MacOS/Aster"
BUNDLE_ID="studio.sandman.aster"

# Stop only this project's application, allowing unrelated apps with the same name.
if [ -f "$PACKAGE_DIR/dist/aster.pid" ]; then
  OLD_PID="$(cat "$PACKAGE_DIR/dist/aster.pid")"
  OLD_COMMAND="$(ps -p "$OLD_PID" -o comm= 2>/dev/null || true)"
  if [ "$OLD_COMMAND" = "$APP_BINARY" ]; then kill "$OLD_PID" 2>/dev/null || true; fi
fi
while IFS= read -r APP_PID; do
  [ -z "$APP_PID" ] && continue
  RUNNING_COMMAND="$(ps -p "$APP_PID" -o comm= 2>/dev/null || true)"
  if [ "$RUNNING_COMMAND" = "$APP_BINARY" ]; then kill "$APP_PID" 2>/dev/null || true; fi
done < <(pgrep -x Aster || true)

swift build --package-path "$PACKAGE_DIR" --product Aster
BUILD_DIR="$(swift build --package-path "$PACKAGE_DIR" --show-bin-path)"
mkdir -p "$APP_CONTENTS/MacOS" "$APP_CONTENTS/Resources"
cp "$BUILD_DIR/Aster" "$APP_BINARY"
chmod +x "$APP_BINARY"
python3 "$ROOT_DIR/script/prepare_web.py" "$APP_CONTENTS/Resources/Web"

if [ -f "$PACKAGE_DIR/Web/AppIcon.icns" ]; then
  cp "$PACKAGE_DIR/Web/AppIcon.icns" "$APP_CONTENTS/Resources/AppIcon.icns"
fi
cat > "$APP_CONTENTS/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleExecutable</key><string>Aster</string>
  <key>CFBundleIdentifier</key><string>$BUNDLE_ID</string>
  <key>CFBundleName</key><string>Aster</string>
  <key>CFBundleDisplayName</key><string>Aster</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>0.5.0</string>
  <key>CFBundleVersion</key><string>5</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>LSMinimumSystemVersion</key><string>14.0</string>
  <key>NSPrincipalClass</key><string>NSApplication</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSHumanReadableCopyright</key><string>Aster · Sandman Studio</string>
</dict></plist>
PLIST
/usr/bin/codesign --force --sign - "$APP_BUNDLE"

if [ "$MODE" = "--debug" ]; then
  /usr/bin/open -n "$APP_BUNDLE"
  exec lldb -n Aster
fi
if [ -n "${ASTER_SMOKE_REPORT:-}" ]; then
  /usr/bin/open -n "$APP_BUNDLE" --args --smoke-report "$ASTER_SMOKE_REPORT"
else
  /usr/bin/open -n "$APP_BUNDLE"
fi
sleep 1
pgrep -x Aster | tail -1 > "$PACKAGE_DIR/dist/aster.pid"
case "$MODE" in
  --verify) pgrep -x Aster >/dev/null; echo "Aster built and running: $APP_BUNDLE" ;;
  --logs) exec /usr/bin/log stream --info --style compact --predicate 'process == "Aster"' ;;
  --telemetry) exec /usr/bin/log stream --info --style compact --predicate "subsystem == \"$BUNDLE_ID\"" ;;
esac
