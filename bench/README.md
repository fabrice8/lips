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

### Nested writes are O(list) — and `batch()` fixes the sweep

Measured with the loop paused, per write, 40 samples:

| particles | nested write (`particles[i].x = v`) | control write (few subscribers) |
|---|---|---|
| 150 | 0.75 ms | 0.005 ms |
| 300 | 1.21 ms | 0.003 ms |
| 450 | 1.73 ms | 0.002 ms |

The control is a top-level key with a handful of subscribers: flat, as
fine-grained reactivity should be. A nested write costs ~350× more and grows
linearly with the list.

The cause is documented, not accidental — `deepWrap`'s `set` trap in
[src/ir/signal.ts](../src/ir/signal.ts) force-notifies the **top key's**
subscribers (RFC-001 §6, "coarse but O(subscribers-of-key)"), and the keyed
`<for>` is one of those subscribers. So one field write re-runs the whole list
binding, and a frame touching 4 fields × N particles pays N × O(N).

## reactivity-batch.html — batched vs unbatched

`batch()` queues each signal's notification instead of running it, and the queue
is a Set, so N writes to one key collapse to **one** notification. Frame cost,
median, measured synchronously with no animation loop:

| particles | unbatched | batched | speedup | batched ceiling |
|---|---|---|---|---|
| 50 | 7.90 ms | 0.20 ms | 40× | ~5000 fps |
| 100 | 29.40 ms | 0.50 ms | 59× | ~2000 fps |
| 200 | 114.80 ms | 0.80 ms | 144× | ~1250 fps |
| 300 | 278.40 ms | 1.30 ms | 214× | ~770 fps |

From 50 to 300 particles — 6× the work — the unbatched cost grows **35×**
(superlinear, O(N²)) while the batched cost grows **6.5×** (linear, O(N)).

End to end in `particles.html`, live frame rate:

| | unbatched | batched |
|---|---|---|
| 150 particles | 1.3 fps | **91 fps** |
| 450 particles | ~0.2 fps | **42.6 fps** |

### What batching does not fix

It collapses a **sweep over many items**. It does nothing for a change to **one**
item: the notification is still routed through the top key, so the keyed `<for>`
still re-runs and a single drag still costs O(list).

That is the Modela-shaped case — dragging one node on a canvas — so `batch()` is
a mitigation, not the fix. Giving nested objects their own per-key signals, so
`p.x = v` notifies only the binds that read `p.x`, remains the actual lever.
