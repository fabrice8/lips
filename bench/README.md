# Benchmark harness

jsfb-style keyed benchmark for the Lips engine: standard operations at 1,000 rows
against three engines on one page —

- **vanilla** — hand-written DOM (the ruler)
- **ir** — the Phase-2 architecture prototype (`spike/ir-engine.js`)
- **lips** — current engine via `dist/lips.min.js`, keyed `<for … by="id">`

Ops: create · replace-all · partial update (every 10th) · select · swap (1 ↔ 998) ·
remove (mid) · append 1k · clear. Timings span op → DOM settled (paint excluded —
identical DOM deltas make paint comparable). Medians reported.

## Run it

```bash
bun run build                      # produce dist/lips.min.js from current src
python3 -m http.server 8931        # repo root
# open http://localhost:8931/bench/index.html → Run all
```

Results land in the on-page table and `window.__RESULTS__`.

## Baselines

Recorded snapshots live in `baseline/` — one JSON per date/config, committed so
Phase 2's engine swap has an honest "before". Current: `2026-07-23-1k.json`.

| op (median ms, 1k rows) | vanilla | ir | lips |
|---|---|---|---|
| create | 4.4 | 4.2 | 490.7 |
| replace all | 2.8 | 6.9 | 2108.3 |
| partial update | 0.1 | 0.2 | 109.0 |
| select row | 0.1 | 0.4 | 104.2 |
| swap rows | 0.0 | 0.0 | **4.4** |
| remove row | 0.1 | 0.1 | **5.4** |
| append 1k | 1.4 | 2.5 | 653.7 |
| clear | 1.1 | 1.8 | 22.2 |

Keyed swap/remove already sit close to the fine-grained ideal (the `by=`
reconciliation moves boundary ranges); create/replace/update/select remain
dominated by the digest architecture Phase 2 replaces.

## Notes

- Div-based rows: current Lips cannot render `<for>` inside `<table>`
  (innerHTML parsing hoists unknown elements out of table context).
- An official js-framework-benchmark submission is deferred until the Phase 2
  engine lands — submitting the current engine would only publish the "before".
