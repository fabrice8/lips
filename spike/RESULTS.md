# Spike results — IR engine vs current Lips (2026-07-23)

**Question:** does the ROADMAP.md Phase-2 architecture (parse once → template IR →
`cloneNode` instantiation → per-key signal bindings) actually beat the current engine
(regex preprocess → cash-dom walk → deep-proxy → deep-clone/deep-equal digest)?

**Method:** `spike/bench.html` served locally, Chromium (embedded pane), 1,000 rows,
div-based rows with a reactive class + text + label link per row. Ops: create,
partial update (every 10th row, ×10 runs), select row (×10), clear (×3).
Timings are **script + DOM settle** (paint excluded — rAF is throttled in the pane;
DOM deltas are identical across engines). Medians reported.
`spike/ir-engine.js` is ~200 lines and shares no code with Lips.

## Numbers (median ms, 1,000 rows)

| op | vanilla | IR prototype | current Lips | Lips ÷ IR |
|---|---|---|---|---|
| create 1k rows | 2.7 | **3.0** | 492.7 | **~164×** |
| partial update (100 labels) | 0.1 | **0.2** | 46.7 | **~230×** |
| select row (class toggle) | ~0.0 | **0.2** | 96.2 | **~480×** |
| clear | 0.7 | **1.6** | 3.2 | ~2× |
| heap Δ after create | <precision | <precision | **12.5 MB** | — |

**Scaling (Lips create, from console):** 10 rows → 1.6 ms · 100 → 14.3 ms · 1,000 → 497.6 ms.
10× rows costs ~35× time — superlinear, consistent with the digest/deep-compare
architecture. The IR engine scales linearly.

## Qualitative findings tripped en route

1. **`<for>` cannot render inside `<table>`/`<tbody>`** — cash-dom parses templates via
   `innerHTML`, and the HTML parser hoists unknown elements out of table context
   ("Undefined mesh renderer"). Real-world constraint of the innerHTML parsing pipeline;
   the IR engine avoids it because `<template>` parsing is lenient.
2. **`appendTo(rawElement)` silently renders `[object Object]`** — the API accepts only a
   selector string or Cash object, with no runtime validation.
3. Empty initial `<for>` array logs "will not update" warning — awkward path for
   data-loaded-later UIs.

## Interpretation

- The Phase-2 architecture lands **at/near vanilla** on this workload (create within 11 %
  of hand-written DOM; sub-ms updates) — i.e., Solid-class runtime shape, achieved with a
  runtime-parsed template and runtime-compiled expressions (both cached, no build step).
- The current engine's costs are architectural, not tuning: deep-proxy wrap of state,
  `deepClone` snapshots, per-dep deep `isEqual` digest, per-evaluation `new Function`,
  per-element cash-dom construction. Select-row is the clearest signature: toggling one
  class costs 96 ms because every row's class dependency re-evaluates through the digest.
- ROADMAP.md Phase 2 target was "≥2× update throughput". The measured architectural
  headroom is **two orders of magnitude**. Target stands, comfortably.

## Caveats

- The IR prototype is an **architecture floor**, not a framework: no component tree,
  lifecycle, slots, or error handling. A real Phase-2 engine gives some margin back —
  but Solid proves the same shape survives full-framework weight.
- One environment, one workload, paint excluded, `performance.memory` is coarse.
  Publishable numbers come from the js-framework-benchmark harness (Phase 0).

## Reproduce

```bash
python3 -m http.server 8931   # repo root (build dist/lips.min.js first: bun run compile)
# open http://localhost:8931/spike/bench.html → Run all
```
