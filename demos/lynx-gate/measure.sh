#!/usr/bin/env bash
# RFC-006 L4: run each app once in Lynx Explorer on the running Android
# device and print what `src/screen.ts` logs, with per-thread CPU (/proc)
# and memory (dumpsys meminfo). Serve `dist/` and `pushed.lips` first, at
# $BASE (default http://localhost:3125/gate), and `adb reverse` that port.
#
#   demos/lynx-gate/measure.sh [lips|react]...
set -euo pipefail
BASE=${BASE:-http://localhost:3125/gate}
out="$(cd "$(dirname "$0")" && pwd)/dist/measure"
mkdir -p "$out"

run() {
  local app=$1 pid
  adb shell am force-stop com.lynx.explorer
  adb logcat -c
  adb shell am start -a android.intent.action.VIEW -d "'lynx://open?url=$BASE/$app.lynx.bundle'" >/dev/null
  sleep 2
  pid=$(adb shell pidof com.lynx.explorer | tr -d '\r')
  # CPU per thread: its CPU time (utime + stime, in clock ticks) from the
  # first step to the last, read from /proc. `top -H` rounds this load to 0.
  for _ in $(seq 1 50); do adb logcat -d | grep -q "L4 $app step 1 " && break; sleep 0.2; done
  adb shell "for t in /proc/$pid/task/*; do echo \$(cat \$t/comm) \$(cut -d' ' -f14,15 \$t/stat); done" >"$out/$app.cpu0"
  for _ in $(seq 1 60); do adb logcat -d | grep -q "L4 $app done" && break; sleep 0.2; done
  adb shell "for t in /proc/$pid/task/*; do echo \$(cat \$t/comm) \$(cut -d' ' -f14,15 \$t/stat); done" >"$out/$app.cpu1"
  sleep 2 # the push, for Lips
  adb shell dumpsys meminfo "$pid" >"$out/$app.mem"
  adb logcat -d | grep -oE "L4 $app [^\"]*" >"$out/$app.log"
  node - "$app" "$out" <<'JS'
const [ app, out ] = process.argv.slice( 2 ), fs = require('fs')
const lines = fs.readFileSync( `${out}/${app}.log`, 'utf8' ).trim().split('\n').map( l => l.split(' ') )
const steps = lines.filter( l => l[ 2 ] === 'step' ).map( l => +l[ 4 ] ), flushes = lines.filter( l => l[ 2 ] === 'flush' ).map( l => +l[ 3 ] )
const bytes = lines.filter( l => l[ 2 ] === 'bytes' ).map( l => +l[ 3 ] )
// Latency: a step's start to the first main-thread flush after it
const lat = steps.map( t => flushes.find( f => f >= t ) - t ).filter( Number.isFinite ).sort( ( a, b ) => a - b )
const med = a => a.length ? a[ a.length >> 1 ] : NaN
// CPU: each thread's clock ticks (10 ms) over the steps, the busiest first
const ticks = f => Object.fromEntries( fs.readFileSync( f, 'utf8' ).trim().split('\n').map( l => l.trim().split(' ') ).map( p => [ p.slice( 0, -2 ).join(' '), +p.at( -2 ) + +p.at( -1 ) ] ) )
const c0 = ticks( `${out}/${app}.cpu0` ), c1 = ticks( `${out}/${app}.cpu1` )
const threads = Object.entries( c1 ).map( ( [ t, v ] ) => [ t, v - ( c0[ t ] ?? 0 ) ] ).filter( ( [ , d ] ) => d > 0 ).sort( ( a, b ) => b[ 1 ] - a[ 1 ] ).slice( 0, 6 )
const mem = fs.readFileSync( `${out}/${app}.mem`, 'utf8' ), pss = ( mem.match( /TOTAL PSS:\s+(\d+)/ ) || mem.match( /TOTAL\s+(\d+)/ ) || [] )[ 1 ]
console.log( JSON.stringify({ app, steps: steps.length, updates: bytes.length, firstBytes: bytes[ 0 ], stepBytes: med( bytes.slice( 1 ) ),
  latencyMs: { median: med( lat ), max: lat[ lat.length - 1 ] }, cpuTicks: Object.fromEntries( threads ),
  pssKB: +pss, other: lines.filter( l => ![ 'step', 'flush', 'bytes' ].includes( l[ 2 ] ) ).map( l => l.slice( 2 ).join(' ') ) }) )
JS
}

apps=( "$@" ); [ ${#apps[@]} -gt 0 ] || apps=( lips react )
for app in "${apps[@]}"; do run "$app"; done
