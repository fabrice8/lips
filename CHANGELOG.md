# Changelog

All notable changes to `@lipsjs/lips` are documented here.
Format: [Keep a Changelog](https://keepachangelog.com) · Versioning: [SemVer](https://semver.org).

## [Unreleased]

### Added
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
- Removed the bogus `tsc` npm package from devDependencies (it shadowed the
  real TypeScript compiler binary)

### Known issues (tracked for Phase 1 — see ROADMAP.md)
- `destroy()` never destroys nested child components (`for…in` over a `Map`)
- `<for>` has no keyed reconciliation — list updates are index-based
- `<for>` cannot render inside `<table>`/`<tbody>` (innerHTML parsing hoists
  unknown elements out of table context)
- `appendTo()` silently renders `[object Object]` when passed a raw DOM element

## [0.1.2] — 2025-05-16

Last release before this changelog was introduced.
