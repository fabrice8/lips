#!/usr/bin/env bash
# RFC-006 test tier C on a simulator: the demo, live from the dev server,
# in Lynx Explorer 4.1.0, the engine version tier B runs.
#
#   demos/lynx/sim.sh ios          the booted iOS simulator, or the first iPhone
#   demos/lynx/sim.sh android      the running emulator, or the first AVD
#   demos/lynx/sim.sh ios --check  open it, then prove it rendered, and exit
#
# It starts `rspeedy dev` unless one already serves the bundle, installs
# Lynx Explorer where it is missing (a pinned release, SHA-256 checked),
# and opens the bundle in it: on iOS as the page Explorer launches with,
# on Android through Explorer's `lynx://open?url=` link. The dev server
# rebuilds on every edit; run this again to reopen. Ctrl-C stops a dev
# server it started.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
cache="$here/native/.cache/explorer"
EXPLORER=4.1.0
RELEASE=https://github.com/lynx-family/lynx/releases/download/$EXPLORER
# Rspeedy's default port. iOS simulators share the Mac's localhost; the
# Android emulator reaches it through `adb reverse`.
BUNDLE=http://localhost:3000/main.lynx.bundle

fail() { echo "✗ $*" >&2; exit 1; }
sha256() { if command -v sha256sum >/dev/null; then sha256sum "$1"; else shasum -a 256 "$1"; fi | cut -d' ' -f1; }

fetch() { # asset sha256 → its path, downloaded and verified once
  local dest="$cache/$1"
  if [ ! -f "$dest" ] || [ "$(sha256 "$dest")" != "$2" ]; then
    mkdir -p "$cache"
    echo "Fetching Lynx Explorer $EXPLORER ($1)…" >&2
    curl -fL --retry 3 --progress-bar -o "$dest.part" "$RELEASE/$1"
    [ "$(sha256 "$dest.part")" = "$2" ] || fail "checksum mismatch: $1"
    mv "$dest.part" "$dest"
  fi
  echo "$dest"
}

# The demo's swatch is background: var(--accent), a Lips style bind: its
# colour on screen means Lips rendered and its styles applied (#e11d48)
ACCENT="225 29 72"

# Pixels within reach of the accent, in a screenshot scaled down and
# matched to sRGB by sips (simulators shoot in Display P3). With `top`,
# the screenshot's commonest colours instead: what is on screen.
accent_pixels() {
  sips -m '/System/Library/ColorSync/Profiles/sRGB Profile.icc' -Z 400 -s format bmp "$1" --out "$1.bmp" >/dev/null
  python3 - "$1.bmp" "${2:-count}" $ACCENT <<'PY'
import struct, sys, collections
b = open( sys.argv[ 1 ], 'rb' ).read()
want = [ int( x ) for x in sys.argv[ 3: ] ]
start, = struct.unpack_from( '<I', b, 10 )
w, h = struct.unpack_from( '<ii', b, 18 )
step = struct.unpack_from( '<H', b, 28 )[ 0 ] // 8
row = ( w * step + 3 ) & ~3
n, seen = 0, collections.Counter()
for y in range( abs( h ) ):
  r = start + y * row
  for x in range( w ):
    p = r + x * step
    rgb = ( b[ p + 2 ], b[ p + 1 ], b[ p ] )
    seen[ rgb ] += 1
    if all( abs( rgb[ i ] - want[ i ] ) < 24 for i in range( 3 ) ): n += 1
print( n if sys.argv[ 2 ] == 'count' else ' '.join( 'rgb%s×%d' % c for c in seen.most_common( 8 ) ) )
PY
}

check() { # the platform → a screenshot with the accent in it, or fail
  local shot="$here/dist/$1.png" n=0
  mkdir -p "$here/dist"
  for _ in $(seq 1 30); do
    sleep 2
    if [ "$1" = ios ]; then xcrun simctl io booted screenshot "$shot" >/dev/null 2>&1
    else adb exec-out screencap -p >"$shot"; fi
    n=$(accent_pixels "$shot")
    if [ "$n" -gt 300 ]; then
      echo "✓ Lips rendered in Lynx Explorer ($1): the accent bind is on screen, $n pixels. $shot"
      return
    fi
  done
  echo "  on screen: $(accent_pixels "$shot" top)" >&2
  fail "no accent on screen after 60 s ($n pixels): see $shot"
}

dev=
serve() {
  if curl -fsS -o /dev/null "$BUNDLE" 2>/dev/null; then
    echo "Using the dev server already serving $BUNDLE"
    return
  fi
  [ -d "$here/node_modules" ] || ( cd "$here" && npm ci --no-audit --no-fund )
  echo "Starting the dev server…"
  # The binary itself, not npx: stopping it stops the server
  ( cd "$here" && exec node_modules/.bin/rspeedy dev ) &
  dev=$!
  trap 'kill "$dev" 2>/dev/null || true' EXIT
  for _ in $(seq 1 120); do
    curl -fsS -o /dev/null "$BUNDLE" 2>/dev/null && return
    kill -0 "$dev" 2>/dev/null || fail "the dev server exited"
    sleep 0.5
  done
  fail "nothing serves $BUNDLE: is port 3000 taken by something else?"
}

ios() {
  if ! xcrun simctl list devices booted | grep -q Booted; then
    local udid
    udid=$(xcrun simctl list devices available | grep -m1 -E '^[[:space:]]+iPhone' | grep -oE '[0-9A-F-]{36}' || true)
    [ -n "$udid" ] || fail "no iPhone simulator: add one in Xcode › Settings › Components"
    echo "Booting $(xcrun simctl list devices available | grep "$udid" | sed -E 's/^[[:space:]]+//; s/ \(.*//')…"
    xcrun simctl boot "$udid"
  fi
  open -a Simulator

  if ! xcrun simctl get_app_container booted com.lynx.LynxExplorer >/dev/null 2>&1; then
    local asset sum app
    case "$(uname -m)" in
      arm64) asset=LynxExplorer-arm64.app.tar.gz sum=7b10e34ac2a0b1c3f6cd1003f68243a5565078304ebd4760b363557778ee4968 ;;
      *) asset=LynxExplorer-x86_64.app.tar.gz sum=ca8e9a8b86b5990b87d48c510c3be21117b33999b36193ba29ef4b4d0995e6d6 ;;
    esac
    # The archive holds the bundle's contents, not the .app folder itself
    app="$cache/LynxExplorer.app"
    rm -rf "$app" && mkdir -p "$app"
    tar -xzf "$(fetch "$asset" "$sum")" -C "$app"
    echo "Installing Lynx Explorer…"
    xcrun simctl install booted "$app"
  fi

  # The bundle as Explorer's first page (its lynx_initial_url): a lynx://
  # link would wait on iOS's "Open in 'LynxExplorer'?" prompt
  SIMCTL_CHILD_lynx_initial_url="$BUNDLE" xcrun simctl launch --terminate-running-process booted com.lynx.LynxExplorer >/dev/null
}

android() {
  if ! adb get-state >/dev/null 2>&1; then
    command -v emulator >/dev/null || fail "no emulator running, and no \`emulator\` on PATH (\$ANDROID_HOME/emulator) to start one"
    local avd
    avd=$(emulator -list-avds | head -1)
    [ -n "$avd" ] || fail "no Android virtual device: create one in Android Studio › Device Manager"
    echo "Starting $avd…"
    emulator -avd "$avd" >/dev/null 2>&1 &
    adb wait-for-device
    until [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ]; do sleep 1; done
  fi

  if [ -z "$(adb shell pm path com.lynx.explorer 2>/dev/null | tr -d '\r')" ]; then
    echo "Installing Lynx Explorer…"
    adb install -r "$(fetch LynxExplorer-noasan-release.apk 6ae29787a2166974c29c2f23d87f3b20a137abcf9a8c17903ad19f3fb7f00cb6)" >/dev/null
  fi

  adb reverse tcp:3000 tcp:3000 >/dev/null
  adb shell am start -a android.intent.action.VIEW -d "'lynx://open?url=$BUNDLE'" >/dev/null
}

[ "${2:-}" = --check ] && { command -v sips >/dev/null || fail "--check needs macOS (sips)"; }
case "${1:-}" in
  ios) command -v xcrun >/dev/null || fail "needs Xcode and its command line tools (xcrun)" ;;
  android) command -v adb >/dev/null || fail "needs adb: put \$ANDROID_HOME/platform-tools on PATH" ;;
  *) fail "usage: $0 ios|android [--check]" ;;
esac

serve
"$1"
echo "✓ The demo is open in Lynx Explorer ($1): $BUNDLE"
if [ "${2:-}" = --check ]; then
  check "$1"
elif [ -n "$dev" ]; then
  echo "  The dev server rebuilds on every edit. Ctrl-C stops it."
  wait "$dev"
fi
