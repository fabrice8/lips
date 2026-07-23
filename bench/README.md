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
