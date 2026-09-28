#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-run}"
case "$MODE" in run|--verify|--debug|--logs|--telemetry|--offline) ;; *) echo "Usage: $0 [--verify|--debug|--logs|--telemetry|--offline]" >&2; exit 2 ;; esac
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGE_DIR="$ROOT_DIR/macos"
APP_BUNDLE="$PACKAGE_DIR/dist/Aster.app"
APP_CONTENTS="$APP_BUNDLE/Contents"
APP_BINARY="$APP_CONTENTS/MacOS/Aster"
BUNDLE_ID="studio.sandman.aster"

# Stop only this project's application, allowing unrelated apps with the same name.
stop_owned_aster() {
  local app_pid="$1"
  local running_command
  running_command="$(ps -p "$app_pid" -o comm= 2>/dev/null || true)"
  [ "$running_command" = "$APP_BINARY" ] || return 0
  # Ask AppKit to quit so it can release the DSH Host gracefully.
  /usr/bin/osascript -e "tell application id \"$BUNDLE_ID\" to quit" >/dev/null 2>&1 || true
  for _ in 1 2 3 4 5; do
    kill -0 "$app_pid" 2>/dev/null || return 0
    sleep 1
  done
  # If the Apple Event was unavailable, stop only children owned by this app
  # before ending it. This avoids leaving the Node Host behind on rebuild.
  while IFS= read -r child_pid; do
    [ -n "$child_pid" ] && kill "$child_pid" 2>/dev/null || true
  done < <(pgrep -P "$app_pid" || true)
  kill "$app_pid" 2>/dev/null || true
}

if [ -f "$PACKAGE_DIR/dist/aster.pid" ]; then
  OLD_PID="$(cat "$PACKAGE_DIR/dist/aster.pid")"
  stop_owned_aster "$OLD_PID"
fi
while IFS= read -r APP_PID; do
  [ -z "$APP_PID" ] && continue
  stop_owned_aster "$APP_PID"
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
  <key>CFBundleShortVersionString</key><string>0.8.0</string>
  <key>CFBundleVersion</key><string>8</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>LSMinimumSystemVersion</key><string>14.0</string>
  <key>NSPrincipalClass</key><string>NSApplication</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
  <key>NSDesktopFolderUsageDescription</key><string>Aster opens your selected DSH project so its local agent can use the project files.</string>
  <key>NSHumanReadableCopyright</key><string>Aster · Sandman Studio</string>
</dict></plist>
PLIST
# A stable development identity preserves macOS folder consent across rebuilds.
# Ad-hoc signing remains available on machines without a local identity.
SIGN_IDENTITY="${ASTER_CODESIGN_IDENTITY:-}"
if [ -z "$SIGN_IDENTITY" ]; then
  SIGN_IDENTITY="$(/usr/bin/security find-identity -v -p codesigning | /usr/bin/sed -n 's/.*"\(Apple Development:[^"]*\)".*/\1/p' | /usr/bin/head -n 1)"
fi
/usr/bin/codesign --force --sign "${SIGN_IDENTITY:--}" "$APP_BUNDLE"

APP_ARGS=()
if [ "$MODE" = "--offline" ] || [ "${ASTER_OFFLINE:-}" = "1" ]; then APP_ARGS+=(--offline); fi
if [ -n "${ASTER_DSH_REPO:-}" ]; then APP_ARGS+=(--dsh-repo "$ASTER_DSH_REPO"); fi
if [ -n "${ASTER_DSH_NODE:-}" ]; then APP_ARGS+=(--dsh-node "$ASTER_DSH_NODE"); fi
if [ "${ASTER_DSH_SOURCE:-}" = "1" ]; then APP_ARGS+=(--dsh-source); fi
if [ -n "${ASTER_SMOKE_REPORT:-}" ]; then APP_ARGS+=(--smoke-report "$ASTER_SMOKE_REPORT"); fi
if [ -n "${ASTER_HOST_SMOKE_REPORT:-}" ]; then APP_ARGS+=(--host-smoke-report "$ASTER_HOST_SMOKE_REPORT"); fi

launch_app() {
  local dsh_repo_path="${ASTER_DSH_REPO:-$HOME/Desktop/dsh}"
  # Opening the project folder as the app's document gives the native app and
  # its child Host macOS user-selected access to this exact directory.
  if [ "$MODE" != "--offline" ] && [ "${ASTER_OFFLINE:-}" != "1" ] && [ -d "$dsh_repo_path" ]; then
    /usr/bin/open -n -a "$APP_BUNDLE" "$dsh_repo_path" --args "${APP_ARGS[@]}"
  elif [ "${#APP_ARGS[@]}" -gt 0 ]; then
    /usr/bin/open -n "$APP_BUNDLE" --args "${APP_ARGS[@]}"
  else
    /usr/bin/open -n "$APP_BUNDLE"
  fi
}

if [ "$MODE" = "--debug" ]; then
  launch_app
  exec lldb -n Aster
fi
launch_app
sleep 1
pgrep -x Aster | tail -1 > "$PACKAGE_DIR/dist/aster.pid"
case "$MODE" in
  --verify) pgrep -x Aster >/dev/null; echo "Aster built and running: $APP_BUNDLE" ;;
  --logs) exec /usr/bin/log stream --info --style compact --predicate 'process == "Aster"' ;;
  --telemetry) exec /usr/bin/log stream --info --style compact --predicate "subsystem == \"$BUNDLE_ID\"" ;;
esac
