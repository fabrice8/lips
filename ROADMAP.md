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

> **Status 2026-07-23:** CI green on PR #3 · npm publishing via OIDC Trusted Publishing
> (no token secret) · jsfb-style keyed harness in `bench/` with committed 1k baseline
> (official js-framework-benchmark submission deferred until the Phase 2 engine lands).
> Still open: Playwright smoke on demo apps · issue templates / contributing guide.

## Phase 1 — Correctness debt (weeks 2–6) — ✅ core complete (2026-07-23)

- [~] Convert `test/test.component.ts` (3,216 lines of manual scenarios) into Vitest specs — 64-spec suite covers signals, utils, rendering, events, control flow, keyed lists, router, teardown; full demo-scenario conversion continues alongside Phase 2
- [x] Fix known landmines:
  - [x] `destroy()` iterates a `Map` with `for…in` → child components never destroyed; + SCI tracking for syntax components; + idempotent destroy
  - [x] Keyed `<for>` reconciliation (`by=` attribute — key path or function; DOM ranges move, state travels with keys)
  - [x] Handler names can clobber framework internals → reserved-name guard throws at definition
  - [x] `Events.off` per-listener unsubscribe; emit null-crash + in-place mutation fixed
  - [x] Router: `URLSearchParams` query parsing + percent-decoded path params
  - [x] Stylesheet `waitForStyles` observer leak; bounded LRU `TEMPLATE_CACHE`
  - [x] Bonus (spike-discovered): null/template dynamic-tag crash + dead dtag tracking; immediate disposal of swapped-out dynamic content
  - [ ] Scoped DWS observation — deferred to Phase 2 (lifecycle rework)
- [x] Error propagation: `onError` lifecycle boundary + `component:error` event; console remains fallback

**Exit criteria met:** list reorder / teardown / leak suites green (64 pass) · no known-crash issues open.

## Phase 2 — The engine swap (weeks 6–12)

*Same public API, new internals. Old vs new behind a flag, validated against the Phase 1 spec suite.*

> **Design doc:** [design/template-ir.md](design/template-ir.md) (RFC-001) — IR format,
> expression subsystem with dual execution, diagnostics contract, hot-swap, migration gates.

- [x] Template parser (`src/ir/parser.ts`, 2026-07-23): recursive-descent, owns the syntax (no innerHTML/regex), error-recovering with line/col diagnostics, `.lips` SFC splitting, `<for>`-in-`<table>` proven — 32 specs
- [x] IR compiler (`src/ir/compiler.ts`, 2026-07-23): AST → serializable TemplateIR — static skeletons with coalescing-aware integer paths, bind table (text/attr/prop/event/spread), block nodes (if-chains, keyed for, switch, async arms, let/const scope, log, comp/dynamic with inputs+events+spreads+contents), deduped expression table with compile-time validation re-anchored to template line/col; JSON round-trip + determinism proven — 31 specs
- [x] IR runtime (`src/ir/runtime.ts` + `src/ir/signal.ts`, 2026-07-23): skeleton clone + bind walk over precomputed paths, per-key signals (no history/proxy/digest), block executors (if/switch/for/async/let/log/comp/dynamic), keyed reconciler with natural entry keys, dual execution modes, component defs with reactive input flow — 26 specs. **Benchmarked**: create ~87×, update ~147×, select ~209×, replace ~253× faster than current engine at 1k rows; ~1.6× vanilla create; 13 KB gzip (`bench/baseline/2026-07-23-1k-ir-runtime.json`)
- [x] Hot-swap API (`src/ir/swap.ts` + runtime, 2026-07-23): `instance.swap( newIR )` diffs by expression source — identical subtrees kept wholesale, bind-only changes rewired onto the same nodes (text nodes reused), changed child blocks re-executed at their anchors, skeleton changes rebuilt in place; `SwapReport` lists touched regions for canvas highlighting; state survives by construction — 11 specs incl. the Modela stepper scenario
- [x] Engine flag + parity gate (2026-07-23): `new Lips({ engine: 'ir' })` returns the IR facade (`src/ir/facade.ts`) — old public API (register/render/appendTo/destroy, deep-reactive state, lifecycle onCreate/onInput/onMount/onDestroy, reserved-handler guard, stylesheets, events emitter) over the IR engine. `tests/engine-parity.spec.ts` runs 14 shared behavior specs against BOTH engines — 28/28 green. Deep-reactive opt-in landed (`reactive(obj, true)` + signal `touch`)
- [x] **All parity blockers closed + default flipped (2026-07-23)**: slots, component events, full lifecycle, reactive context, macros, i18n, router, dynamic template objects. Parity suite runs 26 shared behaviors against both engines (52 specs) plus 6 IR-only specs for behaviors the legacy engine gets wrong. `new Lips()` = IR engine; `{ engine: 'runtime' }` is the deprecation escape hatch. Suite: 292 pass
- [ ] Deprecation release, then delete the legacy engine (`tps.ts`, `iuc/`, `dws.ts`, `component.ts`)
- [ ] Deferred refinements: component-instance salvage across skeleton rebuilds, LIS reconciler
- [x] Expression subsystem (`src/ir/expression.ts`, 2026-07-23): own tokenizer + Pratt parser with positioned diagnostics (never throws), AST-derived precise deps, compiled executor (one cached `Function` per source+scope, no `with`) **and** sandboxed AST interpreter (CSP mode) — 31 parity specs
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
