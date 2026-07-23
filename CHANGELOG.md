# Changelog

All notable changes to `@lipsjs/lips` are documented here.
Format: [Keep a Changelog](https://keepachangelog.com) · Versioning: [SemVer](https://semver.org).

## [Unreleased]

### Changed — BREAKING
- **The IR engine is now the default.** `new Lips()` runs the Phase 2
  engine (parser → IR → clone+bind runtime, per-key signals). The legacy
  digest engine remains available for one deprecation release via
  `new Lips({ engine: 'runtime' })`.
- Nullish interpolation renders `''` instead of the literal `"undefined"`
  (RFC-001 decision #4).
- Undeclared macro arguments are `undefined` rather than `false`: same
  falsy/attribute-removing behavior, but they render as `''` in text.

### Fixed by the new engine (legacy engine gets these wrong)
- Inline arrow event instructions (`on-click( () => state.count++ )`) now
  mutate state — the legacy evaluator passed a non-reactive `state.toJSON()`
  copy, so the write landed on a throwaway object
- Spread attributes remove keys that disappear from the object (legacy left
  stale attributes behind)
- `<async>` loading/then/catch arms render
- `onAttach`/`onDetach` fire by ownership instead of a document-wide
  MutationObserver
- `onContext` fires only for the fields a component declared
- `injectParams` no longer throws when a plural format lacks a `*` fallback
  (affects both engines)

### Added
- Full IR engine surface: slots (`input.renderer`), component events
  (`self.emit` → parent `on-*`), complete lifecycle (create/input/mount/
  render/update/attach/detach/error/destroy), reactive context with
  `watchContext`/`useContext`, macros (compile-time inlining), i18n
  (`i18n` attribute, `@format`, `setLanguage`/`useTranslator`), `<router>`,
  and dynamic template objects
- `instance.swap( newIR )` hot-swap with `SwapReport`
- Parity suite: 26 behaviors asserted against BOTH engines, plus 6
  IR-only specs covering the legacy bugs above


### Added
- **`onError` lifecycle boundary**: render and dependency-update failures route
  to a component's `onError( error )` handler when defined (console fallback
  otherwise), plus a `component:error` event
- `Events.off( event, fn )` removes a single listener; `off( event )` keeps
  clearing all
- **Keyed `<for>` reconciliation**: `<for [item, i] in=state.items by="id">`
  matches items by key (property path or key function via `by=fn`), moving
  existing DOM ranges instead of rewriting them in place — node identity and
  nested component state survive reorders, prepends and mid-list removals.
  Undefined/duplicate keys warn and fall back to index reconciliation.
- Real test suite: Vitest + jsdom — 40 specs covering signals, utils
  (`isDiff`/`isEqual`/`deepClone`/`deepAssign`), rendering, reactive updates,
  events, `<if>`/`<for>`, nested components, teardown (`tests/`)
- CI workflow: typecheck + build + tests on every push/PR (`.github/workflows/ci.yml`)
- Unminified development bundle (`dist/lips.js`) exposed as the `./dev` export
- `typecheck` script (real `tsc --noEmit`)
- Technical roadmap (`ROADMAP.md`) and engine-architecture spike with results
  (`spike/` — IR prototype vs current engine benchmark)

### Fixed
- `package.json` `test` script was a broken `Echo` placeholder that failed on
  macOS/Linux — now runs the Vitest suite
- Release workflow was invalid (missing `runs-on`) and targeted GitHub Packages
  with a mismatched owner scope — now publishes to npmjs on release
  (requires `NPM_TOKEN` secret)
- `src/dws.ts` referenced Node-only `NodeJS.Timeout` type in browser code
- `destroy()` now destroys nested child components recursively — it iterated
  the PCC `Map` with `for…in` (which yields nothing), leaving every child's
  effects, IUC registrations and watchers alive
- Syntax-component instances (`<if>`, `<for>`, `<switch>`, …) are now tracked
  in a dedicated SCI registry and disposed with their parent — they are
  excluded from the PCC cache by design and previously leaked on every
  parent teardown
- `destroy()` is idempotent — repeated calls are safe no-ops
- **Dynamic tags no longer crash on null** and template-object verbs now
  re-render on change: `<{state.page}/>` starting at `null` called
  `renderer.mesh` on null (swallowed crash), and template-valued dynamic tags
  bypassed dependency tracking entirely — router page swaps never re-rendered
- **Swapped-out dynamic content is disposed immediately**: dynamic children now
  render scoped under the dynamic element's path, and swaps destroy the
  replaced component instances instead of accumulating them until parent
  destroy
- Handler names that would clobber the component API (`render`, `destroy`,
  `node`, `emit`, `state`, …) now throw at definition instead of silently
  replacing framework internals
- `Events.emit` no longer crashes on null/undefined params and no longer
  mutates emitted plain objects in place (clones while unwrapping proxies;
  class instances pass through by identity)
- Router: query strings parse via `URLSearchParams` (percent-decoding, `+`,
  values containing `=`) and path params are percent-decoded
- Stylesheet `waitForStyles` observer always disconnects (resolve, timeout, or
  error) — its `getComputedStyle().cssText` condition could never satisfy, so
  every stylesheet leaked a document-wide MutationObserver; a throwing observer
  callback could also abort the host's shared mutation-notification pass
- Template preprocess cache is LRU-bounded (500 entries) — unbounded growth
  bites hardest under runtime template generation
- Removed the bogus `tsc` npm package from devDependencies (it shadowed the
  real TypeScript compiler binary)

### Known issues (tracked — see ROADMAP.md)
- Text interpolation renders nullish values literally (`{input.query.q}` →
  `"undefined"`) — most frameworks render an empty string
- `__hasSamePathParent__` matches by raw string prefix, so sibling paths like
  `…/2` and `…/25` can collide in partial-update targeting (disposal uses a
  strict separator-aware check; Phase 2 revisits path encoding)
- Keyed `<for>` full-replace grows slower across consecutive replaces
  (1.5s → 2.7s over 3 runs at 1k rows, `bench/baseline/2026-07-23-1k.json`) —
  the drop-all/add-all path appears to accumulate dependency-tracking garbage
- `<for>` over `Map`/plain-object inputs is still index-based — should
  default to keyed reconciliation by the natural entry key
- `<for>` cannot render inside `<table>`/`<tbody>` (innerHTML parsing hoists
  unknown elements out of table context)
- `appendTo()` silently renders `[object Object]` when passed a raw DOM element

## [0.1.2] — 2025-05-16

Last release before this changelog was introduced.
