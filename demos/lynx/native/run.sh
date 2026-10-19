#!/usr/bin/env bash
# RFC-006 test tier B: the demo's native bundle in the REAL Lynx engine
# (4.1, libLynx_clay, Linux x86_64), headless.
#
#   demos/lynx/native/run.sh            (needs git, curl, cargo, node)
#
# Everything it fetches is pinned and verified:
#   - lynx-family/lynx-stack @ b651885: the engine bridge and the headless
#     runner crates (not published to any registry)
#   - the runtime and lynx_core.js from lynx-genui-storage.tos-cn-beijing.
#     volces.com, checked against the SHA-256s lynx-stack pins
# Fails on any unmet check AND on any JS error the engine reports.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
cache="$here/.cache"
sdk="$cache/lynx-sdk"
LYNX_STACK_COMMIT=b651885e

RUNTIME_URL=https://lynx-genui-storage.tos-cn-beijing.volces.com/lynx_4_1_core_libs/liblynx_oss_amd64_linux.so
RUNTIME_SHA256=45904d9d065e5dd03d27d959145ea8d31f11f4331129a33b1c8aa020c307cf5e
CORE_URL=https://lynx-genui-storage.tos-cn-beijing.volces.com/lynx_4_1_core_libs/lynx_core.jslynx_core.js
CORE_SHA256=81f0b9dbf51684872de0489b037110eab448e42039f5ac69d6ebe18371ea3efa

mkdir -p "$cache"

# 1. Runner crates
if [ ! -d "$cache/headless-rust-test-runner" ]; then
  rm -rf "$cache/lynx-stack"
  git clone -q --filter=blob:none --no-checkout https://github.com/lynx-family/lynx-stack.git "$cache/lynx-stack"
  git -C "$cache/lynx-stack" sparse-checkout set packages/lynx/engine-bridge packages/lynx/headless-rust-test-runner
  git -C "$cache/lynx-stack" checkout -q "$LYNX_STACK_COMMIT"
  # Sibling layout preserved: the runner's build script reaches ../engine-bridge
  cp -r "$cache/lynx-stack/packages/lynx/engine-bridge" "$cache/lynx-stack/packages/lynx/headless-rust-test-runner" "$cache/"
fi
# The runner taps, but has no public way to drag or scroll: one small patch
# exposes its native view (runner.patch)
grep -q 'pub fn view(&self)' "$cache/headless-rust-test-runner/src/lib.rs" \
  || patch -s -p1 -d "$cache/headless-rust-test-runner" <"$here/runner.patch"

# 2. Runtime + core script, verified
fetch() { # url sha256 dest
  if [ -f "$3" ] && echo "$2  $3" | sha256sum -c --quiet - 2>/dev/null; then return; fi
  mkdir -p "$(dirname "$3")"
  curl -sS -fL --retry 3 --retry-delay 5 --connect-timeout 30 -o "$3.part" "$1"
  echo "$2  $3.part" | sha256sum -c --quiet -
  mv "$3.part" "$3"
}
fetch "$RUNTIME_URL" "$RUNTIME_SHA256" "$sdk/lib/libLynx_clay.so"
fetch "$CORE_URL" "$CORE_SHA256" "$sdk/resources/lynx_core.js"

# 3. The bundle under test
[ -d "$here/../node_modules" ] || ( cd "$here/.." && npm ci --no-audit --no-fund )
( cd "$here/.." && npx rspeedy build >"$cache/build.log" 2>&1 ) || { cat "$cache/build.log"; exit 1; }

# 4. Run; the runner's build scripts use the verified SDK instead of downloading
export LYNX_SDK_DIR="$sdk"
( cd "$here" && cargo build -q -p lips-tierb )
log="$cache/run.log"
status=0
# From the cache: the engine writes its quickjs_cache/ into the working directory
( cd "$cache" && "$here/target/debug/lips-tierb" "$here/../dist/main.lynx.bundle" "$here/../dist/native.bmp" ) >"$log" 2>&1 || status=$?

# Anywhere in a line: the engine logs to the same stream, mid-line at times
grep -oE '(✓|✗) .*|all checks passed|SOME CHECKS FAILED' "$log" || true
errors=$(grep -cE 'onAppJSError|exception:' "$log" || true)
if [ "$errors" != "0" ]; then
  echo "✗ the engine reported $errors JS error(s) — see $log"
  grep -E 'onAppJSError|exception:' "$log" | head -5
  exit 1
fi
echo "✓ no JS errors reported by the engine"
exit "$status"
