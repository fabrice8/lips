# Benchmark harness

jsfb-style keyed benchmark for the Lips engine: standard operations at 1,000 rows
against four engines on one page —

- **vanilla** — hand-written DOM (the ruler)
- **ir** — the Phase-2 architecture prototype (`spike/ir-engine.js`)
- **ir-rt** — the REAL Phase-2 engine (`dist/lips-ir.min.js`: parser → IR compiler →
  runtime with keyed reconciler + per-key signals; 13 KB gzip)
- **lips** — current engine via `dist/lips.min.js`, keyed `<for … by="id">`

Ops: create · replace-all · partial update (every 10th) · select · swap (1 ↔ 998) ·
remove (mid) · append 1k · clear. Timings span op → DOM settled (paint excluded —
identical DOM deltas make paint comparable). Medians reported.

## Run it

```bash
bun run build                      # dist/lips.min.js
python3 -m http.server 8931        # repo root
# open http://localhost:8931/bench/index.html → Run all
```

Results land in the on-page table and `window.__RESULTS__`.

## Baselines

Recorded snapshots live in `baseline/` — one JSON per date/config, committed so
the engine swap has an honest before/after. Latest: `2026-07-23-1k-ir-runtime.json`.

| op (median ms, 1k rows) | vanilla | ir-rt (Phase 2) | lips (current) | gain |
|---|---|---|---|---|
| create | 3.6 | **5.6** | 485.5 | ~87× |
| replace all | 2.2 | **8.2** | 2071.6 | ~253× |
| partial update | 0.1 | **0.7** | 102.6 | ~147× |
| select row | 0.1 | **0.5** | 104.3 | ~209× |
| swap rows | 0.0 | **1.4** | 3.8 | ~3× |
| remove row | 0.0 | **0.5** | 5.2 | ~10× |
| append 1k | 1.6 | **4.6** | 648.8 | ~141× |
| clear | 1.3 | **2.4** | 15.6 | ~7× |

The real Phase-2 engine (runtime template parse → IR → keyed reconciler →
per-key signals) holds the spike prototype's promise with the full pipeline:
create at ~1.6× vanilla, sub-millisecond updates, at 13 KB gzip. Remaining
levers to the ≤1.4× create budget: LIS reconciler, bind-walk tuning.

## ab.mjs — is a change faster or slower?

`index.html` compares engines. To compare two builds of the same engine, use
`ab.mjs`. It runs the same keyed-list ops on every build in one headless
Chromium page:

```bash
bun run build
node bench/ab.mjs --rows 10000 --iters 40 base=master new=dist base2=master
```

- **Builds.** Each build is a path to a `lips.min.js`, a directory that holds
  one, or a git ref. A ref is built in a temporary worktree and cached by
  commit. `label=` names a column.
- **Baseline.** The first build is the baseline. Every other column also shows
  its ratio to the baseline.
- **Playwright.** It needs Playwright and a Chromium. Set `PLAYWRIGHT` and
  `CHROMIUM` if they aren't resolvable.

It is built to make small differences trustworthy:

- The page is cross-origin isolated, so timers resolve to about 5 µs, not
  100 µs.
- GC runs before every op, so one build's garbage is not billed to the next.
- The builds take turns in a rotating order, so drift lands on all of them
  alike.

**Read the ratios against a control.** List the baseline twice (`base2=master`
above): the gap between the two copies is the noise floor.

- At 10k rows and 40 iterations, that floor is about ±5% per op.
- A difference inside it is not a result. Rerun with more iterations before
  acting on it.

Example: the L1 binding against L0, 10k rows, 40 iterations (2026-10-16). L1
is within ±4% of L0 on every op, and the same-build controls spread just as
wide. Every number is a median in ms, with the ratio to L0 in brackets:

| op | L0 | L1 | L0 again | L1 again |
|---|---|---|---|---|
| create | 141.7 | 139.7 (0.99) | 137.5 (0.97) | 139.6 (0.99) |
| replace | 207.8 | 212.8 (1.02) | 206.6 (0.99) | 212.1 (1.02) |
| update | 49.3 | 51.2 (1.04) | 51.4 (1.04) | 51.4 (1.04) |
| swap | 89.2 | 90.5 (1.02) | 85.1 (0.95) | 88.6 (0.99) |
| remove | 52.3 | 53.3 (1.02) | 54.0 (1.03) | 51.2 (0.98) |
| append | 223.2 | 228.9 (1.03) | 231.1 (1.04) | 219.4 (0.98) |

## Notes

- Div-based rows: current Lips cannot render `<for>` inside `<table>`
  (innerHTML parsing hoists unknown elements out of table context).
- An official js-framework-benchmark submission is deferred until the Phase 2
  engine lands — submitting the current engine would only publish the "before".

## particles.html — feature + animation stress

`bench/particles.html` drives every template construct (`if`/`else-if`/`else`,
keyed `for`, `for` over Map/Set/range, `switch`, `async`, `let`/`const`, macros,
argument slots, dynamic component tags, spread inputs, events, i18n, context)
and every StyleIR construct (reactive declarations, direct custom-property
binds, `:hover`, `@media`, `@keyframes`, `@property`) at animation rate, and
self-checks all of it: **29/29**.

It also produces one number worth acting on.

### Nested writes are O(1) in list length

Measured with the loop paused, per write, 40 samples:

| particles | nested write (`particles[i].x = v`) | control write (few subscribers) |
|---|---|---|
| 150 | 0.01 ms | 0.007 ms |
| 300 | 0.01 ms | 0.005 ms |
| 450 | 0.01 ms | 0.003 ms |

Flat, and level with a plain top-level write. Each nested object carries its own
per-key channels (`nestedProxy` in [src/ir/signal.ts](../src/ir/signal.ts)), so
`rows[3].x = v` notifies exactly the bindings that read `rows[3].x`. The keyed
`<for>` subscribed to `length` and the index/key fields — not to `x` — so a field
change never wakes it.

**Before per-object signals** every nested write force-notified the top key, and
the `<for>` was one of its subscribers, so one field write re-ran the whole list:

| particles | then | now |
|---|---|---|
| 150 | 0.75 ms | 0.01 ms |
| 300 | 1.21 ms | 0.01 ms |
| 450 | 1.73 ms | 0.01 ms |

## reactivity-batch.html — frame cost

Frame cost, median, no animation loop. A frame writes 4 fields per particle:

| particles | frame | was (top-key notification) |
|---|---|---|
| 50 | 0.30 ms | 7.90 ms |
| 100 | 0.50 ms | 29.40 ms |
| 200 | 0.90 ms | 114.80 ms |
| 300 | 2.00 ms | 278.40 ms |

6× the particles now costs ~6.7× the time — linear. It used to cost 35× —
O(N²), because each of the N×4 writes did O(N) work.

### Live frame rate (`particles.html`)

| | original | with `batch()` | with per-object signals |
|---|---|---|---|
| 150 particles | 1.3 fps | 91 fps | **120 fps** |
| 450 particles | ~0.2 fps | 42.6 fps | **46.5 fps** |

### What this means for `batch()`

Batching is now close to a no-op for this workload — 120 vs 120 fps at 150
particles, 46.5 vs 48.4 at 450. It was a mitigation for a cost that no longer
exists.

It still earns its place for two things:

- **Structural fan-out.** A `push` or `splice` invalidates every channel on the
  array; the fan-out is batched internally so a subscriber that read `length`
  and every index runs once, not once per channel.
- **Explicit coalescing.** Writing several keys a single binding reads still
  notifies once per key. `batch()` collapses that to one run.

### The case this fixes that batching never could

Changing **one** item. Batching collapses a sweep over many; it did nothing for a
single drag, which still routed through the top key and re-ran the list. That is
the Modela-shaped interaction — dragging one node on a canvas — and it is now
O(1) in the number of nodes.
