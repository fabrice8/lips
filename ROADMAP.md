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
  execution mode on one IR: eval-compiled (trusted, fast) / interpreter (CSP-safe). Untrusted
  templates need more than an interpreter — see RFC-007 (Phase 3).

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
- [x] **Legacy engine deleted (2026-07-23)**: `component.ts`, `tps.ts`, `iuc/`, `dws.ts`, `uqs.ts`, `metrics.ts`, the old `signal.ts`/`utils.ts`/`constants.ts`, `syntax/` and the legacy manual harness — 7.4k lines. cash-dom dropped entirely (RFC decision #8); `stylesheet.ts` rewritten on native DOM. Bundle 95.6 KB min → **63 KB min / 21 KB gzip**
- [x] **Instance salvage across `swap()` (2026-08-03)**: components inside a rebuilt region are released, offered to the fresh render and re-homed — same state, same nodes, same handlers, no lifecycle fired; only parent-side wiring is rebuilt against the new call site. `key` decides identity, position decides without one. Covers call-site-only changes too. `SwapReport.salvaged` reports what carried over; focus is restored. Also fixed a pre-existing bug where a rebuild dropped the root's scoped stylesheet — 11 swap specs + 5 browser checks
- [ ] Deferred refinements: LIS reconciler
- [x] Expression subsystem (`src/ir/expression.ts`, 2026-07-23): own tokenizer + Pratt parser with positioned diagnostics (never throws), AST-derived precise deps, compiled executor (one cached `Function` per source+scope, no `with`) **and** an AST interpreter (CSP mode — CSP-safe, not a sandbox; see RFC-007) — 31 parity specs
- [ ] Per-key signal state; delete Proxy layer, deep-clone snapshots, and the digest loop
- [ ] `historySignal()` opt-in wrapper; base `signal()` is value-only
- [ ] Clone-based template instantiation (decision #5)
- [ ] Benchmark gate in CI: no op regresses vs Phase 0 baseline; **target ≥2× update throughput**

**Exit criteria:** regex preprocessor and IUC deleted · spec suite green · benchmark gate green.

## Phase 3 — Shape the product (months 3–5)

- [x] **Subpath entries (2026-07-23)**: `.` (full, 20.7 KB gz) · `./runtime` (precompiled-only, compiler tree-shaken out, **14.5 KB gz**) · `./precompile` (build-time, 9.1 KB gz) · `./dev`. The compiler is injected rather than imported, so the runtime entry drops the parser+compiler entirely and throws an actionable error if handed source templates
- [x] cash-dom removed entirely (stylesheet.ts on native DOM); stylis is the only runtime dependency
- [x] **Size budget enforced in CI (2026-07-24)**: `scripts/size-check.mjs` gzips each entry against a budget, wired into CI. Stylis and the built-in `<router>` are injected by the full entry, not imported by the core, so `./runtime` tree-shakes both — **14.5 → 12.1 KB gz** (at target). Dynamic-`import()` for Stylis was rejected: it fragments the single-file no-build bundle for 1.8 KB. Remaining lever toward a smaller leaf: split router/i18n into their own entries
- [x] **Precompilation + CSP-safe mode (2026-07-23)**: `precompile()` turns authoring templates into IR ahead of time (macros inlined, source dropped); `lipsPlugin()` compiles `.lips` SFCs to modules with embedded IR and fails the build on template errors with file:line:col. With `mode: 'interpreted'` a precompiled app **never constructs a Function** — proven by spec with a non-vacuous control
- [ ] SSR/hydration spike on the same IR
- [ ] Publish styled-component/scoped-CSS docs and security model page (`@html`, "templates are code")
- [x] **Untrusted templates (2026-11-18)** — the security model the page will publish: [design/untrusted-templates.md](design/untrusted-templates.md) (RFC-007). `new Lips({ untrusted: untrusted() })` from the opt-in `./untrusted` entry holds a template you did not write to one replaceable policy — compile-time refusals as positioned diagnostics, a guarded evaluator, a page-boundary host — and the routes it found are specs, each with a control (`tests/untrusted.spec.ts`). Each mode now claims only what it guarantees: compiled and interpreted are for trusted templates

**Exit criteria:** `@lipsjs/core` standalone on npm · CSP demo app running with `unsafe-eval` disabled.

## Phase 4 — Earn adoption (months 5+)

- [ ] Docs relaunch: formal template-syntax grammar, security page, honest framework comparison, migration notes
- [ ] Interactive playground; revive the `.lips` single-file component format (`demos/jsml`)
- [ ] **Editor tooling** — the template highlighted and typed, a component written apart typed with no annotation, Lips's diagnostics as the author types: a grammar, a generator of the TypeScript behind each component, on Volar (language server, TypeScript plugin, `lips-check`). Design doc: [design/editor-tooling.md](design/editor-tooling.md) (RFC-009), proposed
- [ ] Published js-framework-benchmark results; starter templates
- [ ] Semver policy, release cadence, second maintainer (bus factor is currently 1)
- [ ] **Parts** — headless components at `@lipsjs/lips/parts`, for the DOM and Lynx from one template each: layer, popover and menu, dialog, toasts, a region that folds, icons, blurred backdrop, combobox, virtual list and grid on the web, date picker. Design doc: [design/parts.md](design/parts.md) (RFC-008). What they stand on was tried on the iOS Simulator and an Android emulator first (2026-11-25, §3): a grid line from a custom property, `blur-view`, right-to-left hold; an SVG mask draws nothing, so icons are inline `svg`. A reference that measures and typed Lynx attributes built first (§7, lips#48, lips#50); popover and menu built (§5, "As built"); the layer taken out, then every other part built (2026-11-25, lips#57, lips#58 and the pass after): what is open is the device run (`backdrop-filter` beside `blur-view`, the L4 gate), rows of different heights, and a typed date

## Phase 5 — Native target: Lips on Lynx

*The native export target RFC-003 deferred. Same templates, a second host. Each step ends in an exit check; L4 is a go/no-go gate. Minimum Lynx SDK: 4.0.*

> **Design doc:** [design/lynx-binding.md](design/lynx-binding.md) (RFC-006) — verified ground
> (what Lynx's CSS engine and element API actually do), architecture, test tiers, risks.

- [x] **L0 — Host seam** in Lips core: `BlockIR.nodes` beside `html`, a `Host` interface, today's behaviour as the DOM host, scope stamping and `@html` made host decisions. Exit: full suite green on the DOM host; an in-memory test host runs the IR runtime specs
  > **2026-10-16:** `src/ir/host.ts` (interface + DOM host), `src/ir/tree.ts` (in-memory host), `compileTemplate( src, { target: 'tree' } )`. The 507 existing specs pass unchanged on the DOM host; `tests/ir-host.spec.ts` renders every executor through both hosts and requires identical trees after each step (RFC-006 §4.1, "As built").
- [x] **L1 — Renderer spike**: background-thread runtime, main-thread applier over the element API, text/attribute/class binds, `<if>`/`<for>`, `tap`. Exit: counter + keyed list render in `@lynx-js/testing-environment`, Lynx for Web, and the real engine headless
  > **2026-10-16:** `src/lynx/` (protocol, background host, main-thread applier). Tier A: `tests/lynx-binding.spec.ts`, and `demos/lynx` on Lynx for Web in Chromium. Tier B: `demos/lynx/native/run.sh` on the real Lynx 4.1 engine headless — 10 checks, zero engine-reported JS errors. Tier B surfaced two fixes the web run could not (RFC-006 §4.2, "As built, L1"). Tier B runs in CI since 2026-10-16 (`.github/workflows/lynx-native.yml`).
- [x] **L2 — Style pipeline**: mandatory flattening, class scope, Lynx lint diagnostics, variables via `__SetInlineStyles`, full-value binds where `calc()` is unsupported. Exit: StyleIR specs assert computed styles in the real engine
  > **2026-10-16:** `src/lynx/style.ts` (`compileLynxStyle`, eleven `LIPS-L` diagnostics, `LYNX_PAGE_CONFIG`) and a demo build route (`demos/lynx/lips-styles.ts`). Every bind writes its full value, so no `calc()` at all. Tier B reads the demo sheet's computed styles in the real engine: scoped rules, `@media`, inheritance, and four binds before and after a state change, 14/14. Full bundle +69 bytes (budget 26.5 → 26.55). RFC-006 §4.4, "As built, L2".
- [x] **L3 — Inputs, scroll, list, vocabulary diagnostics** (`setValue` write path, raw-text rule)
  > **2026-10-19:** `INVOKE` op for UI methods, run after the flush (before it the engine throws). Inputs take `value` as the attribute first and `setValue` after, never echoing what the input reported. `list` goes through `__CreateList` and `update-list-info`, built eagerly, with the cells Lynx asks for as they scroll into view. `compileLynxTemplate` wraps inline text in one `text` and reports `LIPS-L101`–`L104` (§9.2 decided: auto-wrap the unambiguous case). Tier B 20/20: an input, a bare `scroll-y` and a virtualized list in the real engine. RFC-006 §4.5, "As built, L3".
- [ ] **Accessibility** (ARIA → Lynx's own attributes), proposed for review
  > **2026-11-23:** Lynx's accessibility attributes were verified in the engine source. The background host maps `role`, labels (`aria-labelledby` and `<label for>` resolved at run time), states as words, `aria-hidden`, `aria-modal` and `tabindex`. Live regions announce through `lynx.accessibilityAnnounce`. `LIPS-L105`–`L107` report what Lynx cannot read. Open: words or iOS traits (Android's `enableA11y` decided in #44) (boolean `aria-*` binds decided in #40). RFC-006 §3.8, §4.8 and §9.4–§9.9.
- [x] **Binding gaps found by a first real UI**: inline SVG, event data, propagation, element references (lips#34–#37)
  > **2026-11-24, inline SVG (#34):** an `<svg>` is kept whole and its subtree written into its `content`, rewritten once per flush when bound attributes, control flow or text inside it change. `LIPS-L108` reports what Lynx's svg does not draw. Tier B: one element with its markup, sized 24×24; drawing is tier C (the headless runner does not integrate the XElement). RFC-006 §4.3, "As built, inline SVG".
  > **2026-11-24, event data (#35):** an event crosses as a serializable pick per kind: key and modifiers, touch points, and `target`/`currentTarget` with their `dataset`. Handlers read `e.key`, `e.touches[0].clientX` and `e.target.dataset` as on the DOM. Tier B: a real touch's `clientX` and its target's dataset reach the handler. RFC-006 §4.5, "As built, event data".
  > **2026-11-24, propagation (#36):** `on-click.stop`, `.capture` and `.outside`. The grammar already parsed them, so they are modifiers in the event name, given one meaning by `Host.listen`. The DOM host calls `stopPropagation()`, passes the capture flag, or listens on the document. Lynx declares `bind_type` on a main-thread closure, and `.outside` is a page-level capture listener that knows its target by id. `LIPS-C022` refuses an unknown modifier. Tier A on both hosts, Lynx for Web e2e and tier B: a stopped tap does not reach the row, and an outside tap is seen. RFC-006 §4.5, "As built, propagation".
  > **2026-11-24, element references (#37):** `@ref="name"` puts an element on `self.refs` while it lives. On the DOM a ref is the element. On Lynx it answers `focus`, `blur`, `scrollTo`, `scrollIntoView` and `animate` as UI methods after the flush. `focus()` is `requestAccessibilityFocus` off inputs, and `Host.keepFocus` is mapped. Tier B: a ref focuses the native input and scrolls the native scroll view. RFC-006 §4.5, "As built, element references"; §9.9 built.
- [x] **Binding gaps, second batch**: the runtime published, boolean ARIA binds, disabled buttons, line-clamp, list cell hints (lips#38, #40–#43). Not here: the L4 device gate (#39) and Android's `enableA11y` (#44), which need a device
  > **2026-11-24, the runtime published (#38):** §9.3 decided, subpath entries. `@lipsjs/lips/lynx/main` (2.21 KB gz) and `@lipsjs/lips/lynx/background` (4.74), one per thread with a budget each, and `@lipsjs/lips/lynx-plugin` for Rspeedy, which finds the build's template plugin instead of importing one and has the app lower Lips's files (the background engine refuses `||=`, found at tier B). The demo installs the packed package and imports nothing from `src/`; tier B 27/27 against it. RFC-006 §4.7, "As built, packaging".
  > **2026-11-24, boolean ARIA binds (#40):** §9.6 decided. A boolean bound on `aria-*` is written `"true"`/`"false"`, not presence, on every host; `null`/`undefined` still remove it. It changes DOM output (`false` was no attribute). +14 bytes on `runtime`. RFC-006 §9.6.
  > **2026-11-24, disabled buttons (#41):** the background host reads `disabled` on a `<button>` instead of sending it, drops every tap inside it (its own handler's, ancestors', `.outside`), and sends the state as `aria-disabled` is. +63 bytes on `lynx-background`. Tier B, and on the iOS Simulator and Android emulator: a real tap on a disabled button does not count. RFC-006 §4.8, "As built, disabled buttons".
  > **2026-11-24, line-clamp (#42):** `LIPS-L012` (error) on `line-clamp` and `-webkit-line-clamp`, naming `text-maxline="N"` as the fix, instead of the generic L008. +105 bytes on `lynx` (budget 17.95 → 18.05). RFC-006 §4.4, "As built, `line-clamp`".
  > **2026-11-24, list cell hints (#43):** `full-span`, `sticky-top`/`-bottom` and estimated sizes on a `list-item` go into its `update-list-info` insert action as JSON booleans and numbers (Lynx ignores text there), and into an update with `flush: false` when they change. +233 bytes on `lynx-main` (budget 2.3 → 2.5). Lynx for Web e2e: a sticky header stays while the list scrolls. Native sticky is not shown: not at tier B, and not on the iOS Simulator or Android emulator either, where a raw-PAPI bundle with no Lips in it does not stick its header either (open, upstream question). Recycling is a later step. RFC-006 §4.5, "As built, cell hints".
- [ ] **Binding gaps, third batch**: a list's own props as JSON (lips#47), Android's `enableA11y` (#44), the emulator half of L4 (#39)
  > **2026-11-25, Android's `enableA11y` (#44):** §9.4 decided: `LYNX_PAGE_CONFIG` sets it, page-wide, overridable by the app. Device check, apart from tier B (Android emulator API 36.1, Lynx Explorer 4.1.0, TalkBack on): a `<button>` reaches TalkBack as `android.widget.Button` with it and as `LynxFlattenUI` without it; names are the same. Spoken words not captured (the image's TTS engine crashes). RFC-006 §4.8, "As built, Android's accessibility path".
  > **2026-11-25, L4 on the emulator (#39, stays open):** `demos/lynx-gate`, one screen in Lips and in ReactLynx, with `measure.sh`. Relative, Android emulator: Lips sent 5.4× more per state change (it re-sent unchanged text; since fixed, equal writes are not sent) and its first render crosses the threads where ReactLynx's does not; latency, CPU and memory are within the emulator's noise; a changed template is fetched and swapped into the running app with no rebuild. The go/no-go needs a mid-range phone. RFC-006 §7, L4.
  > **2026-11-25, list props (#47):** a `list`'s numeric and boolean props (`span-count`, `sticky-offset`, `sticky`, `experimental-*`, 28 typed names) go to Lynx as numbers and booleans, matched by two name patterns a spec checks against every typed name; Lynx dropped their text. +0.15 KB on `lynx-main` (budget 2.5 → 2.65). RFC-006 §4.5, "As built, list props".
- [ ] **L4 — Decision gate**: one real screen in ReactLynx and in Lips; first frame, update latency, per-thread CPU, update size, memory on a mid-range Android device; then a template pushed into the running app without a rebuild. Go/no-go recorded in RFC-006
  > **2026-11-25, pass criteria set before the phone run** (RFC-006 §7, L4): each measure against ReactLynx on the same phone, median of five runs. Latency and per-thread CPU within 1.5× (or 5 ms / 20 ms above), bytes per change within 1.5×, first frame within 100 ms, ≥ 99% of fling frames within 16.7 ms and none over 33 ms, memory within 15 MB, the template push working, no errors. Go when every row passes; a row is never waived after the run.
- [ ] **L5 — Runtime templates** (Modela export path)
- [ ] **L6 — Optimisations**: element templates for precompiled blocks, instant first frame, main-thread gesture handlers

**Exit criteria:** L4 recorded as go · `@lipsjs/lips/lynx` entry within its size budget · tier-B real-engine suite in CI.

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
