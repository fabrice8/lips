# The L4 gate screen (RFC-006 §7)

One screen, built twice: in Lips (`src/lips/`, through the published
`@lipsjs/lips/lynx/*` entries) and in ReactLynx (`src/react/`). A
counter and 100 keyed rows; `src/screen.ts` drives the same 20 state
changes in both, from the background thread, and logs what crosses
the threads and when the main thread flushes. Lips compiles its
template at run time, so after the run it fetches `pushed.lips` and
swaps it into the live instance: a changed template with no rebuild.

```bash
# Lips, as npm publishes it, installed without saving (as in ../lynx/pack.sh)
(cd ../.. && npm pack --pack-destination /tmp)
npm ci && npm install --no-save /tmp/lipsjs-lips-*.tgz
npm run build                 # dist/lips.lynx.bundle, dist/react.lynx.bundle

# Serve dist/*.bundle and pushed.lips under one folder, e.g. on port 3125:
mkdir -p /tmp/serve/gate && cp dist/*.bundle pushed.lips /tmp/serve/gate/
(cd /tmp/serve && python3 -m http.server 3125) &
adb reverse tcp:3125 tcp:3125

./measure.sh                  # each app once in Lynx Explorer; BASE=… for another server
```

`measure.sh` prints one line of JSON per run: update sizes, latency
(a step's start on the background thread to the next main-thread
flush), each thread's CPU time over the steps (clock ticks from
`/proc`, since `top -H` rounds this load to zero) and PSS from
`dumpsys meminfo`. Raw logs go to `dist/measure/`.

The numbers and what they can and cannot say are in RFC-006 §7, L4.
