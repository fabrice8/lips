# Lips — Technical Roadmap

> Status: proposal · Drafted 2026-07-23 from a full source intake of `v0.1.2`
> Thesis: **the template syntax is the product; the engine underneath it gets replaced in place.**
> Public API and template syntax stay stable through every phase below.

---

## Origin constraints (Modela)

Lips exists to serve Modela: sketch/draw UI by hand, an assistant renders the sketch to a
styled UI **and generates interactive code in realtime**, portable to any platform UI.
Non-negotiables that rule out off-the-shelf frameworks (Solid/Svelte/Marko need a compiler
in the loop; JSX isn't serializable; Lit forbids runtime string templates; Vue = VDOM +
attribute DSL):

1. **Runtime-renderable from strings** — no build step inside the generation loop
2. **Serializable component format** — the plain `Template` object (string `default`,
   `stylesheet`, `macros`) is an interchange artifact: JSON-able, diffable, streamable
3. **HTML-native syntax** — element-shaped control flow, minimal invented grammar
4. **Renderer portability** — the same definition must be renderable beyond the DOM

Consequences that re-rank the phases:
- The Phase-2 **IR is the strategic centerpiece**, not perf hygiene: it is the portable
  artifact (template → IR platform-agnostic; IR → renderer swappable) and the vehicle for
  **machine-readable diagnostics** (`{ line, col, code, hint }`) the assistant needs to
  self-correct — regex preprocessing can never provide either.
- **State-preserving hot-swap** (diff old IR vs new IR, rebind only changes) is the killer
  editor feature; add to Phase 2 exit criteria.
- Template cache keyed on exact string never hits under continuous assistant revision —
  fast parse + structural IR diff instead.
- Signal undo/redo, metrics, DOM watching are **Modela editor features, not runtime
  features** — keep them as opt-in layers (`historySignal()`, devtools plugin) so the
  editor retains them while published UIs stop paying for them.
- Published/embedded Modela UIs run generated code in third-party contexts → dual
  execution mode on one IR: eval-compiled (trusted, fast) / interpreter (CSP, sandboxed).

## Guiding decisions

| # | Decision | Replaces | Why |
|---|----------|----------|-----|
| 1 | Real tokenizer → AST → template IR | Regex preprocessor (`src/tps.ts`) + cash-dom innerHTML parsing | Kills the regex-fragility bug class, gives positioned template errors, preserves whitespace, removes `:xtag`/`<template>` hacks. The IR later becomes the target of an *optional* build-time compiler (CSP-safe mode, SSR). |
| 2 | Compile each unique expression once; derive dependencies from the expression AST | Per-evaluation `new Function` + `with(scope)` + regex dep extraction | Hot-path allocation removed; correct dependency lists; isolates the only eval site so a precompiled build can swap it out. |
| 3 | One reactivity layer: per-key signals (shallow default, deep opt-in) | Deep Proxy (IUC) + signal + deep-clone snapshots + `isEqual` digest loop | True fine-grained updates: O(subscribers-of-changed-key) instead of O(all-deps × deep-equal). Deletes most of the memory footprint. |
| 4 | Undo/redo history as opt-in `historySignal()` wrapper | 100-entry history inside every `signal()` | No memory ballast on internal signals. |
| 5 | Template instantiation by `<template>.content.cloneNode(true)` + bind walk | Per-element `createElement` through cash-dom | The single biggest create-time win; this is how Solid gets near-vanilla create numbers. |
| 6 | Modular packages: `@lipsjs/core`, `@lipsjs/router`, `@lipsjs/i18n`; metrics → devtools plugin | Monolithic bundle; i18n threaded through the render hot path | Size budget for the no-build audience; i18n becomes a plugin hook instead of per-element checks. |
| 7 | Split `component.ts` (3,359 lines) into `renderer/`, `scheduler/`, `evaluator/`, `lifecycle/` | God class with render logic in closures | Unit-testability is the prerequisite for the engine swap. |
| 8 | Drop cash-dom from core; direct DOM ops | jQuery-style wrapper in the hottest path | One less dependency, one less indirection, no innerHTML tag-case issues. |
| 9 | Honor `key` in list reconciliation; error boundaries; documented security model; namespaced handlers | Index-based list updates; console-swallowed errors; handlers written onto `this` | Correctness contract users can rely on. |

---

## Phase 0 — Stabilize the ground (weeks 1–2)

*No behavior changes.*

- [ ] CI: typecheck + build + Playwright smoke test on the demo apps, on every PR
- [ ] Fix `package.json` `test` script (currently a broken `Echo` — fails on macOS/Linux)
- [ ] Fix release workflow (`.github/workflows/release-package.yml` has no `runs-on`; `.npmrc` scope `@fabrice8` ≠ package scope `@lipsjs`)
- [ ] Publish pipeline → npmjs with a proper `exports` map: unminified dev build, minified prod build, types from the same compile
- [ ] CHANGELOG, issue templates, contributor guide skeleton
- [ ] Stand up **js-framework-benchmark** harness + memory baseline → recorded "before" numbers

**Exit criteria:** green CI badge · reproducible one-command release · baseline benchmark numbers committed.

## Phase 1 — Correctness debt (weeks 2–6)

- [ ] Convert `test/test.component.ts` (3,216 lines of manual scenarios) into Vitest specs — this doubles as the behavior spec that protects the Phase 2 engine swap
- [ ] Fix known landmines:
  - [ ] `destroy()` iterates a `Map` with `for…in` → child components never destroyed (`src/component.ts:2292`)
  - [ ] Keyed `<for>` reconciliation (`key` is parsed then discarded; updates are index-based → state bleed on reorder)
  - [ ] Handler names can clobber framework internals (`setHandler` assigns onto `this`)
  - [ ] `Events.off` removes all listeners for an event; add per-listener unsubscribe
  - [ ] Router: `decodeURIComponent` on query/params; path prefix collision check
  - [ ] Stylesheet `waitForStyles` observer leak; bounded `TEMPLATE_CACHE`; scoped DWS observation
- [ ] Error propagation: stop swallowing render errors in `console.error`; introduce component-level error boundary

**Exit criteria:** list reorder / teardown / leak suites green · no known-crash issues open.

## Phase 2 — The engine swap (weeks 6–12)

*Same public API, new internals. Old vs new behind a flag, validated against the Phase 1 spec suite.*

- [ ] Tokenizer/parser → AST → IR; template errors with line/column
- [ ] Expression compiler: one `Function` per unique expression, AST-derived dependency lists, per-expression cache
- [ ] Per-key signal state; delete Proxy layer, deep-clone snapshots, and the digest loop
- [ ] `historySignal()` opt-in wrapper; base `signal()` is value-only
- [ ] Clone-based template instantiation (decision #5)
- [ ] Benchmark gate in CI: no op regresses vs Phase 0 baseline; **target ≥2× update throughput**

**Exit criteria:** regex preprocessor and IUC deleted · spec suite green · benchmark gate green.

## Phase 3 — Shape the product (months 3–5)

- [ ] Package split: `@lipsjs/core` / `@lipsjs/router` / `@lipsjs/i18n`; metrics → devtools plugin
- [ ] cash-dom removed from core; size budget enforced in CI (core ≤ ~12 KB gz)
- [ ] Optional Vite plugin emitting precompiled IR → **CSP-safe mode** (no `unsafe-eval`)
- [ ] SSR/hydration spike on the same IR
- [ ] Publish styled-component/scoped-CSS docs and security model page (`@html`, "templates are code")

**Exit criteria:** `@lipsjs/core` standalone on npm · CSP demo app running with `unsafe-eval` disabled.

## Phase 4 — Earn adoption (months 5+)

- [ ] Docs relaunch: formal template-syntax grammar, security page, honest framework comparison, migration notes
- [ ] Interactive playground; revive the `.lips` single-file component format (`demos/jsml`)
- [ ] Published js-framework-benchmark results; starter templates
- [ ] Semver policy, release cadence, second maintainer (bus factor is currently 1)

---

## Measurement plan

All performance claims go through the js-framework-benchmark keyed suite + startup + memory metrics:

| Metric | Phase 0 (baseline) | Phase 2 target | Phase 3 target |
|---|---|---|---|
| create 1k rows | record | ≤ 1.4× vanilla | ≤ 1.2× vanilla |
| partial update (every 10th of 10k) | record | ≤ 1.2× vanilla | ≤ 1.15× vanilla |
| select row | record | ≤ 1.15× vanilla | ≤ 1.1× vanilla |
| swap rows | record | ≤ 1.3× vanilla | ≤ 1.2× vanilla |
| memory (10k rows) | record | −50 % vs baseline | −60 % vs baseline |
| core bundle (gz) | record (full bundle) | — | ≤ 12 KB |

Targets are engineering budgets, not marketing claims — publish whatever the harness actually reports.

> **Thesis validated (2026-07-23):** a ~200-line prototype of the Phase-2 architecture
> (`spike/ir-engine.js`, results in `spike/RESULTS.md`) ran create-1k-rows within 11 % of
> hand-written vanilla DOM, vs **~164× slower** for the current engine (update: ~230×,
> select-row: ~480×, +12.5 MB heap). The Phase 2 "≥2× update throughput" budget has
> roughly two orders of magnitude of measured headroom behind it.
