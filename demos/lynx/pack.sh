#!/usr/bin/env bash
# Lips, installed into the demo the way an app gets it (RFC-006 §4.7):
# the repository built, packed by npm (only what it publishes: dist/),
# and installed from that tarball. The demo imports `@lipsjs/lips/…`
# and nothing from src/, so every tier builds against the published
# entries. Run it again after changing Lips; run.sh, sim.sh and e2e.mjs
# run it themselves.
#
#   demos/lynx/pack.sh            (needs bun and npm)
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
root="$here/../.."
command -v bun >/dev/null || { echo "✗ packing Lips needs bun (https://bun.sh)"; exit 1; }

[ -d "$root/node_modules" ] || ( cd "$root" && bun install --frozen-lockfile )
[ -d "$here/node_modules" ] || ( cd "$here" && npm ci --no-audit --no-fund )

out="$(mktemp -d)"
trap 'rm -rf "$out"' EXIT
# `prepack` builds dist/ and its declarations
( cd "$root" && npm pack --silent --pack-destination "$out" ) >"$out/pack.log" 2>&1 || { cat "$out/pack.log"; exit 1; }
( cd "$here" && npm install --no-save --no-audit --no-fund "$out"/lipsjs-lips-*.tgz ) >"$out/install.log" 2>&1 || { cat "$out/install.log"; exit 1; }
echo "✓ Lips $(node -p "require('$here/node_modules/@lipsjs/lips/package.json').version") packed and installed"
