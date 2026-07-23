# Changelog

All notable changes to `@lipsjs/lips` are documented here.
Format: [Keep a Changelog](https://keepachangelog.com) · Versioning: [SemVer](https://semver.org).

## [Unreleased]

### Added
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
- Removed the bogus `tsc` npm package from devDependencies (it shadowed the
  real TypeScript compiler binary)

### Known issues (tracked for Phase 1 — see ROADMAP.md)
- Dynamic re-renders (`<{state.page}/>` swaps, dynamic tags) accumulate
  PCC/SCI entries until parent destroy — no intermediate instance disposal
  when swapped-out content will never return
- `<for>` over `Map`/plain-object inputs is still index-based — should
  default to keyed reconciliation by the natural entry key
- `<for>` cannot render inside `<table>`/`<tbody>` (innerHTML parsing hoists
  unknown elements out of table context)
- `appendTo()` silently renders `[object Object]` when passed a raw DOM element

## [0.1.2] — 2025-05-16

Last release before this changelog was introduced.
