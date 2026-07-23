# Changelog

All notable changes to `@lipsjs/lips` are documented here.
Format: [Keep a Changelog](https://keepachangelog.com) · Versioning: [SemVer](https://semver.org).

## [Unreleased]

Everything below lands in one release: the engine rewrite plus the
Phase 0/1 foundation work that made it verifiable.

### Changed — BREAKING
- **The IR engine is the only engine.** `new Lips()` runs the Phase 2
  engine (parser → IR → clone+bind runtime, per-key signals). The legacy
  digest engine has been removed — there is no `engine` option.
- **cash-dom is no longer a dependency.** `stylis` is the only runtime
  dependency; `stylesheet.ts` runs on native DOM.
- Removed with the legacy engine: `src/component.ts`, `src/tps.ts`,
  `src/iuc/`, `src/dws.ts`, `src/uqs.ts`, `src/metrics.ts`, the old
  `src/signal.ts`/`src/utils.ts`/`src/constants.ts`, `src/syntax/`, and
  the manual `test/` harness — 7,453 lines.
- Nullish interpolation renders `''` instead of the literal `"undefined"`
  (RFC-001 decision #4).
- Undeclared macro arguments are `undefined` rather than `false`: same
  falsy/attribute-removing behavior, but they render as `''` in text.

### Added
- **IR engine** (`src/ir/`): own tokenizer + template parser with
  positioned diagnostics that never throw, expression parser with
  AST-derived dependencies, IR compiler emitting a serializable
  `TemplateIR`, and a runtime that clones skeletons and binds per-key
  signals. Dual execution modes — compiled `Function` (trusted) and a
  sandboxed AST interpreter (CSP-safe), proven to render identical DOM.
- Engine surface at parity: slots (`input.renderer`), component events
  (`self.emit` → parent `on-*`), full lifecycle (create/input/mount/
  render/update/attach/detach/error/destroy), reactive context
  (`watchContext`/`useContext`, field-filtered `onContext`), macros
  (compile-time inlining), i18n (`i18n` attribute, `@format`,
  `setLanguage`/`useTranslator`), `<router>`, dynamic template objects.
- **`instance.swap( newIR )`** — state-preserving hot-swap with a
  `SwapReport`: identical subtrees kept, bind-only changes rewired onto
  the same nodes, changed blocks re-executed at their anchors.
- `.lips` single-file components accepted by the parser (`parseSFC`).
- **Keyed `<for>`** via `by=` (property path or key function) on both
  engines: DOM ranges move instead of being rewritten, so node identity
  and nested component state survive reorders.
- `onError` lifecycle boundary + `component:error` event.
- `Events.off( event, fn )` removes a single listener.
- Test suite: Vitest + jsdom, **292 specs**, including a parity gate that
  asserts 26 behaviors against both engines.
- CI (typecheck + build + tests on every push/PR); npm publishing via
  OIDC Trusted Publishing; unminified `./dev` bundle; `typecheck` script.
- `ROADMAP.md`, `design/template-ir.md` (RFC-001), `spike/` and `bench/`
  with committed baselines.

### Performance (1,000 rows, `bench/baseline/2026-07-23-1k-ir-runtime.json`)
| op | legacy | IR | gain |
|---|---|---|---|
| create | 485.5 ms | 5.6 ms | ~87× |
| replace all | 2071.6 ms | 8.2 ms | ~253× |
| partial update | 102.6 ms | 0.7 ms | ~147× |
| select row | 104.3 ms | 0.5 ms | ~209× |

Bundle: 13.0 KB gzip including parser and compiler (legacy: 95.6 KB min).

### Fixed by the new engine (the legacy engine gets these wrong)
- Inline arrow event instructions (`on-click( () => state.count++ )`) now
  mutate state — the legacy evaluator passed a non-reactive
  `state.toJSON()` copy, so the write landed on a throwaway object
- Spread attributes remove keys that disappear from the object
- `<async>` loading/then/catch arms render
- `onAttach`/`onDetach` fire by ownership, not a document-wide
  MutationObserver
- `onContext` fires only for the fields a component declared
- `<for>` renders inside `<table>`/`<tbody>` (the parser owns the syntax,
  so the HTML parser can no longer hoist it out of table context)

### Fixed in both engines
- `destroy()` never destroyed nested children (`for…in` over a `Map`);
  syntax-component instances leaked on every teardown; `destroy()` is now
  idempotent
- Dynamic tags crashed on `null` and template-object verbs bypassed
  dependency tracking, so router page swaps never re-rendered
- Handler names that would clobber the component API now throw
- `Events.emit` crashed on null/undefined params and mutated emitted
  objects in place
- Router: `URLSearchParams` query parsing and percent-decoded path params
- Stylesheet `waitForStyles` leaked a document-wide MutationObserver on
  every stylesheet (its condition could never satisfy)
- Template preprocess cache is LRU-bounded (500 entries)
- `injectParams` threw when a plural format lacked a `*` fallback
- `package.json` `test` script was a broken `Echo` placeholder; the
  release workflow was invalid (no `runs-on`) and targeted the wrong
  registry; the bogus `tsc` package shadowed the real compiler;
  `src/dws.ts` used the Node-only `NodeJS.Timeout` type

### Known issues (tracked in ROADMAP.md)
- Components inside a region rebuilt by `swap()` remount (internal state
  resets); instance salvage across skeleton rebuilds is a follow-up
- `<for>` reconciliation uses a pointer walk, not LIS — swap-heavy
  workloads have headroom
- `appendTo()` silently renders `[object Object]` when passed a raw DOM
  element (legacy engine)

## [0.1.2] — 2025-05-16

Last release before this changelog was introduced.
