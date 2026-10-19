# Changelog

All notable changes to `@lipsjs/lips` are documented here.
Format: [Keep a Changelog](https://keepachangelog.com) · Versioning: [SemVer](https://semver.org).

## [Unreleased]

### Added — Lynx inputs, scroll, lists and vocabulary (RFC-006 L3)

- **`compileLynxTemplate( src )`** (`src/lynx/template.ts`): templates
  compiled for Lynx, with the HTML-shaped vocabulary adapted.
  - Text renders only inside a text element, so inline content in a
    `div`, `button`, `li` or Lynx container is wrapped in one `text`:
    `<button>Save {state.n}</button>` just works.
  - What would render nothing is a diagnostic: `LIPS-L101` (an HTML tag
    with no Lynx element, such as `table` or `br`), `LIPS-L102` (text
    beside block content), `LIPS-L103` (text at a template's top level)
    and `LIPS-L104` (a `list` child that is not a `list-item`).
  - More HTML tags map onto `view` and `text` (`blockquote`, `dl`, `abbr`,
    `kbd`, …).
- **Inputs.** A `value` bind on `input`/`textarea` writes the attribute
  first and `setValue` after. A value the input itself reported is never
  written back, so typing is not raced. Handlers read `e.target.value`, as
  on the DOM, or `e.detail.value`.
- **Native lists.** `<list>` with `<list-item>` cells goes through Lynx's
  `__CreateList`: cells are handed over as the list scrolls them into view,
  and reorders move only the cells that left their run.
- **Empty attributes are true**, as in HTML: `<scroll-view scroll-y>`
  scrolls. Lynx reads an empty string as false.
- **The protocol gains `INVOKE`** for UI methods, which the main thread
  runs after its flush.
- **`compileTemplate` takes a `transform` hook**, run on the parsed
  template before it compiles. This is how a host adapts the vocabulary.
- **`demos/lynx`** gains an input, a scroll view and a 40-row list. Tier B
  (20/20) proves them in the real engine. The runner gets a six-line patch
  for drags, and the `probe` mode gets `box=`, `touch=` and `drag=` steps.

### Added — Lynx style pipeline (RFC-006 L2)

- **`src/lynx/style.ts`: component stylesheets for Lynx.**
  `compileLynxStyle( source, { nsp, preprocess })` compiles a Lips sheet
  into CSS for the bundle, plus the binds the background writes.
  - **Flat and scoped by class** (`.lips-<nsp>`). Lynx has no CSS
    nesting, and attribute selectors never match there.
  - **Full-value binds.** `padding: {x}px` binds a variable that carries
    the unit, and the runtime writes `12px`. Lynx's `calc()` covers only
    lengths.
  - **Lint.** Eleven `LIPS-L` diagnostics for what parses but does
    nothing on Lynx: attribute selectors, pseudo-elements, pseudo-classes
    that never match, HTML type selectors, unsupported at-rules,
    `min()`/`max()`/`clamp()`, `calc()` off lengths, `!important`, and
    properties Lynx does not have.
  - **`LYNX_PAGE_CONFIG`.** Turns on inline variables, `@media` and CSS
    inheritance.
- **The style compiler takes `scope` and `lint` options**, so a target can
  scope its own way and report what it cannot do. Style diagnostics now
  point at a statement's first character, not the whitespace before it.
- **A style bind can carry a unit** (`StyleBindIR.u`), which the runtime
  appends when it writes the value.
- **`demos/lynx`.** It now has a Lips sheet with four reactive binds, and
  `lips-styles.ts` compiles it into the bundle. `e2e.mjs` and
  `native/run.sh` check its styles. The real engine passes 14/14, reading
  computed styles before and after a state change.
- **`native/run.sh probe`.** Load a bundle, tap, and print computed styles,
  the DOM, or a screenshot.

### Changed

- The `& `/`:is()` selector rewrite runs only when a sheet ships nested. A
  preprocessor resolves `div &` itself. With Stylis, `div &` now compiles
  to `div [rel="c"]` instead of `:is(div) [rel="c"]`. It is the same
  selector, with the same specificity, and every other output is
  unchanged.
- `scripts/size-check.mjs` prints two decimals. The full budget is 26.55
  (+69 bytes for the hooks above). `runtime` holds at 15.

### Added — Lynx renderer spike (RFC-006 L1)

- **`src/lynx/`: Lips rendering natively on Lynx, over two threads.**
  - The runtime runs on the background thread against a shadow-tree host
    that records changes as a flat op stream.
  - A small main-thread applier applies the ops through Element PAPI and
    forwards events back.
  - Templates stay HTML-shaped: `div`/`button` render as `view`,
    `p`/`span` as `text`, and `click` handlers receive `tap`.
- **`Host.remove( node, gone )`.** The runtime now says when a node is
  destroyed rather than moved, so a host can free what it holds. The DOM
  ignores it.
- **`demos/lynx`.** One template built with Rspeedy into a Lynx for Web
  bundle and a native bundle. `e2e.mjs` drives the web one in Chromium.
  `native/run.sh` runs the native one in the real Lynx 4.1 engine,
  headless. It fetches every input pinned and checksum-verified, and fails
  on any JS error the engine reports.

### Added — tooling

- **`bench/ab.mjs`: is a change faster or slower?** It runs two or more
  builds of the engine through the same keyed-list ops in one headless
  Chromium page. A build is a path or a git ref.
  - The page is cross-origin isolated, so timers resolve to ~5 µs.
  - GC runs before every op, and the builds take turns in a rotating
    order.
  - Listing the baseline twice gives the noise floor, about ±5% per op at
    10k rows.
- **CI runs the real-engine check.** `.github/workflows/lynx-native.yml`
  runs `demos/lynx/native/run.sh` on changes to `src/` or `demos/lynx/`.

### Fixed — found by running the real Lynx engine

- The runtime scheduled `onUpdate` with `queueMicrotask`, which Lynx's
  native background engine does not have. The call sat outside the
  effect's error guard, so the throw could abort the effects after it. It
  now uses a promise job, which every engine has.
- `connectMain` installs no-op `renderPage`, `updatePage` and `processData`
  unless the app defines its own. The native engine calls `renderPage` and
  threw without it.
- Nothing in `src/lynx/` is in a published entry yet (RFC-006 §9,
  packaging). Net effect on the DOM bundles: `runtime` 14.99 → 14.993 KB
  gzipped (+5 bytes for the `gone` flag, −4 for the promise job).

### Added — the host seam (RFC-006 L0)

- The IR runtime no longer touches the DOM directly. Every node operation
  goes through a `Host` (`src/ir/host.ts`): creating, placing, walking and
  mutating nodes, plus two decisions that differ by host: how a stylesheet
  scope marks an element, and whether markup can be parsed. The DOM is the
  default host and behaves exactly as before.

  ```js
  renderIR( ir, setup, { host: myHost })
  ```

- `compileTemplate( src, { target: 'tree' } )` (also `precompile` and
  `lipsPlugin`) adds `BlockIR.nodes`, the skeleton as a structural tree, for
  hosts with no HTML parser. Its paths are the same ones `html` uses. The
  tree target drops template comments, and `@html` becomes **LIPS-C021**,
  because there is nothing to parse the markup with. The default target's
  output is unchanged byte for byte.

- `src/ir/tree.ts` is an in-memory host over plain objects, and the base a
  native binding builds on. `tests/ir-host.spec.ts` renders every construct
  through both hosts and requires identical trees after every step. It
  covers all executors, events, lifecycle, styles, swap with salvage, and
  dispose. The in-memory host is not in any published entry yet; where it
  ships is RFC-006's open packaging decision.

- Size: the seam costs ~0.37 KB gzipped on `runtime` (14.62 → 14.99, inside
  15) and the tree target ~0.29 KB on the compiler-bearing entries. `full`
  carries both, 25.79 → 26.44, and its budget moves 26 → 26.5 (see
  `scripts/size-check.mjs`).

- Speed: measured side by side in Chromium at 10k rows, with isolated
  timers and a forced GC before each op, four rounds of 30 alternating
  iterations. The seam alone is within ±2% of the previous runtime on every
  op except `remove` (+2–4%). The host takes whole ranges (`range`,
  `insertAfter`), so a range walk or move is one call with the loop inside.

### Performance — keyed `<for>` no longer goes quadratic

- Every change to a keyed list ran `ordered.includes( item )` for each old
  row, which is O(n²): at 10k rows, 50 million comparisons to remove one
  row. Kept rows now carry a pass stamp, so the test is O(1).
- Measured with the same harness against the runtime before the seam (two
  rounds of 30 iterations, mean ratio): remove 0.91, clear 0.95, update
  0.97, append 0.97, replace 0.98, swap 0.99. So with the seam in, every
  list operation is as fast as before it or faster. `create` (1.02) never
  runs this code.

### Changed — Stylis is opt-in, and the full bundle is 1.2 KB smaller

- The scope wrap `[rel="card"] { … }` **is** CSS nesting, which every engine
  with native nesting resolves — Chrome/Edge 112+, Safari 16.5+, Firefox 117+.
  So by default the preprocessor was flattening something the engine already
  understands. It is now opt-in:

  ```js
  import { stylisPreprocessor } from '@lipsjs/lips/stylis'
  const lips = new Lips({ stylePreprocessor: stylisPreprocessor })

  // build time — precompile() and the plugin take it per call too
  precompile( template, { name: 'card', preprocess: stylisPreprocessor })
  lipsPlugin({ preprocess: stylisPreprocessor })
  ```

  Wire it if you support engines older than native nesting, which drop a
  nested sheet **whole**, or to keep Stylis-only syntax such as `&-suffix`
  concatenation. It flattens; it does **not** vendor-prefix — the full build
  never did (`src/stylis.ts` shows how to add Stylis's `prefixer` if you want
  it).

- The preprocessor is handed over as a **value**, never wired by importing a
  module for its side effect. `@lipsjs/lips`, `@lipsjs/lips/precompile` and
  `@lipsjs/lips/stylis` are separate bundles, each with its own copy of the
  style compiler, so a global set from one is invisible to the others.

- `full` drops 27.0 → 25.8 KB gzipped and its budget is ratcheted **down**
  28 → 26. `precompile` goes 12.5 → 13.5 for the scanner work below; its
  budget moves 13 → 14.

### Changed — the native path emits what the browser accepts

The compiler now does the jobs Stylis did implicitly, in its one scanner:

- **At-rules that cannot nest are hoisted** out of the scope wrap: CSS
  nesting only admits at-rules whose body is a rule list, so a `@keyframes`
  left inside `[rel="x"] { … }` is dropped and the animation silently does
  nothing. Hoisted: `@keyframes`, `@font-face`, `@property`, `@counter-style`,
  `@font-feature-values`, `@font-palette-values`, `@page`, `@view-transition`,
  `@position-try`, `@color-profile`, `@function`. One found inside
  `@media`/`@supports` carries its condition out with it, so a
  reduced-motion `@keyframes` override stays conditional; a group left empty
  by hoisting is dropped (never an `@layer`, which still declares order). `@media`, `@supports`, `@container`, `@layer`,
  `@scope` and `@starting-style` stay inside the wrap, where they must be to
  remain scoped.
- **`@import`, `@charset` and `@namespace` open the sheet** — ahead of the
  generated `@property` registrations and outside any `styleLayer` block,
  the only places a browser honours them.
- **Identifier-led nested selectors get `&`**: `button { … }` becomes
  `& button { … }`, and `div & { … }` becomes `:is(div) & { … }` — the same
  selectors. Strict-nesting engines (Chrome 112–119, Safari 16.5–17.1) read a
  nested line starting with an identifier as a declaration and drop it.
- **Output is compact**: comments dropped, whitespace folded, escapes
  respected. Stylis used to minify; without it every banner and indent
  shipped in each `<style>` and each precompiled module. `//` line comments
  — Stylis syntax, not CSS — are stripped at the start of a statement
  rather than glued onto the next selector; inside a value they are left
  alone (`--api: https://x` is a value).
- Hoisting runs **whatever the preprocessor**, so one of your own (a
  minifier, say) is never handed a `@keyframes` stuck inside a style rule.
  It gets the comments, so directives such as `/*rtl:ignore*/` reach it.

### Added — `LIPS-S007` / `LIPS-S008` style diagnostics

- `LIPS-S007` (warning): an unmatched `}` is dropped — it used to close the
  scope wrap early and leak every rule after it out unscoped — and an
  unclosed `{` is closed at the end of the sheet.
- `LIPS-S008` (warning): `&-suffix` / `&__elem` concatenation on the native
  path. CSS nesting reads `-suffix` as a type selector, so the rule silently
  matches nothing. (`&div` is valid native nesting and is not flagged.)

### Fixed — a build script importing only `./precompile` lost every stylesheet

- `precompile()` never wired a preprocessor, so `compileStyle` took the
  no-preprocessor branch, warned, and returned an **empty** StyleIR. Every
  component stylesheet silently vanished from a real build pipeline. The
  existing spec only passed because a sibling import of `src/lips` had set
  the module-global.

  The no-preprocessor path now emits the scoped sheet instead of nothing, so
  precompiled styles survive on their own.

### Added — a `<context>` layer owns what it declares

- `this.setContext(key, …)` from inside a `<context>` subtree now writes to
  the **nearest layer that declares the key**, not to the global store. Two
  sibling canvases can both own `selection` without colliding. A key no
  layer declares still falls through, so a tree with no providers behaves
  exactly as before.

  The resolution walks the prototype chain the layers already form, so
  ownership needs no registry and is torn down with the block — no
  unregister step, nothing left behind.

  Literal and expression declarations now differ in a way that falls out of
  what you already write: `<context sel="node-a">` is seeded once and a
  local write sticks (the subtree's own state), while `<context
  sel=state.sel>` is re-synced by an effect and a local write holds only
  until the source next changes (a parent driving it).

### Fixed — `onContext` sees scoped context

- The declared-context subscription watched the host's global store, so a
  `<context>` override never fired `onContext` while bindings reading the
  same key updated normally — the one place where declared and rendered
  context disagreed. It now tracks the effective context with its own
  effect, so both notify through the same path.

- The `watchContext` runtime option this replaced has been removed rather
  than left as dead plumbing.

### Added — `watchContext` replaces the `context` template field

- The field that lists which context fields fire `onContext` is now spelled
  `watchContext`. It never declared what a component reads — bindings that
  read `context.x` are tracked individually regardless — and the old name
  said the opposite. `context` still works and means the same thing.

### Added — lazy dictionaries

- A loader resolves one language root on demand instead of bundling every
  language up front:

  ```js
  lips.i18n.setLoader( id => import(`./languages/${id}.json`).then( m => m.default ) )
  ```

- `setLanguage()` switches first and resolves second: the language changes
  immediately, showing source wording — real text, not a blank — and the
  strings settle when the dictionary lands.

- Dictionaries now carry a revision that translated binds track alongside
  the language. Without it a late-arriving dictionary would not re-render,
  because the language never changed — only what it resolves to. This also
  makes a plain `setDictionary()` at runtime re-translate what is already on
  screen, which it previously did not.

- `i18n.has(lang)` reports whether a root is registered. Each root is
  attempted once; a rejected load is remembered so a missing file does not
  re-fetch on every switch.

### Fixed — a quoted handler is reported instead of silently ignored

- `on-click="() => …"` wires no listener. Only the instruction form
  `on-click( … )` does — the parser produces an event attribute for that
  spelling alone — so the quoted version was an ordinary attribute whose
  source text was emitted into the DOM and never ran.

  It now reports **LIPS-C020** and the dead attribute is dropped rather than
  rendered. Same class as the `@text="…"` and `style={…}` fall-throughs
  fixed alongside it; found the same way, by a demo where the feature simply
  did not happen.

### Fixed — an `onAttach` that renders no longer breaks the attach queue

- `flushAttach()` walked `PENDING_ATTACH` by index while `entry.fn()` was free
  to mutate it. An `onAttach` that RENDERS — which is exactly what
  `<router>` does when it navigates on attach — both appends entries and
  re-enters the flush, so the index went stale two ways:

  - it outlived a shrunken array → `Cannot read properties of undefined
    (reading 'node')`, thrown out of `lips.root()`
  - entries appended mid-pass sat below the descending index → their
    `onAttach` silently never fired

  It now drains by entry identity over a snapshot and repeats while a pass
  settles anything. Attach order is unchanged: parents still attach before
  the children rendered inside them.

  Both symptoms need several sibling components plus one that renders from
  `onAttach`, which is why a router-shaped app hit it and the unit tests
  did not.

### Fixed — an interpolated `@`-prop is a prop bind again

- `@text="Row {i + 1}"` set a literal `@text` ATTRIBUTE on the element
  instead of writing the prop, so nothing rendered. The `interp` case
  handled `@format` and then fell through to the attribute branch, never
  testing for `@`. Interpolated `@text` / `@html` now compile to a prop
  bind over the concatenation, matching the `literal` and `expr` forms.

### Changed — `style=` on an element names the object-literal mistake

- An object literal in an element's `style=` now reports `LIPS-C019` with the
  CSS-text form spelled out, instead of `LIPS-E003 Unexpected token ':'` from
  the expression compiler.

  `style=` carries CSS **text**, and `{…}` inside an attribute value is an
  interpolation slot — so both `style="{ margin: '3rem' }"` and
  `style={{ margin: '3rem' }}` were dead code: the first died on the `:` and
  the second stringified to `[object Object]`. Neither ever reached the DOM.
  Two demo templates had been carrying the first form.

  Elements only. On a component `style` is an input like any other, and an
  object is a fine value for it. The forms that work are untouched:
  `style="width: {state.w}px"`, `style="{state.on ? 'color: red' : ''}"`,
  `style=state.css`. Reactive styles that need pseudo-classes, media queries
  or keyframes belong in the component stylesheet (RFC-004).

### Added — `static` as the object-literal spelling of `_static`

- A template object may now use `static: { … }` instead of `_static: { … }`,
  matching how it is read everywhere else (`this.static` in a handler,
  `static.x` in a template and in a stylesheet).

  `_static` exists because `static` is reserved in strict mode, so
  `export const static = …` is a SyntaxError and the named-export form needs
  the underscore. An object literal has no such restriction. Both spellings are
  supported and mean the same field; `static` wins if both are given.

### Changed — per-object signals (reactivity core)

- **A nested write now notifies only the bindings that read that key.** Each
  nested object in a deep store carries its own per-key channels, instead of
  every nested write force-notifying the top-level key. The keyed `<for>`
  subscribes to `length` and the key field, so `rows[3].x = v` no longer wakes
  the list at all.

  Nested write cost, per write, by list length:

  | rows | before | after |
  |---|---|---|
  | 150 | 0.75 ms | 0.01 ms |
  | 300 | 1.21 ms | 0.01 ms |
  | 450 | 1.73 ms | 0.01 ms |

  An animation loop over a reactive list goes from O(N²) to O(N) per frame —
  `bench/particles.html` runs 150 particles at 120 fps, up from 1.3.

- **One proxy per object across stores.** A parent's `state.rows` and a child's
  `input.rows` are the same array; they now resolve to the same proxy with the
  same channels, so a write through either is seen by both. Previously each
  store held a private proxy — the same latent bug that was already fixed for
  `Map`/`Set`.

- **Collections hand out wrapped values.** `entries()`, `values()`, `forEach`
  and iteration now wrap what they yield, as `get()` already did. Required by
  the above: an unwrapped object out of a `Map` is one nothing can track.

- **`batch()` deduplicates by effect, not by signal.** One effect commonly
  subscribes to many channels, so per-signal queueing still ran it once per
  channel.

### Added — bidirectional component bus

- **`component.emit(…)` now also reaches listeners registered inside the
  component** with `this.on(…)`. Outward (`this.emit('saved')` →
  `component.on('saved')`) has always worked; inward did not exist, so the only
  way to drive a component from outside was to mutate its state — which
  conflates a command with data, and leaves commands that shouldn't persist
  (focus, reset, replay) with no home.

  ```js
  editor.emit('reset')            // reaches this.on('reset', …) inside
  editor.on('saved', doc => …)    // and the component answers on the same bus
  ```

  Inbound events reach `this.on(…)` listeners, **not** handler methods by name,
  so what a component accepts stays an explicit contract. Arguments are passed
  raw inward and deep-cleaned outward, matching what an internal `this.emit`
  already did — reactive proxies still never escape a component.

  This is the supported way to drive a component imperatively; `self` (the
  internal execution context) remains unexposed.

### Added — application-readiness (RFC-002)
Derived from a read of the Modela editor codebase; each item mirrors a
pattern a real application already relies on. See
`design/modela-integration.md`.

- **Reactive `Map` / `Set` state**: deep-reactive stores wrap collections —
  `set`/`delete`/`clear`/`add` notify, values read out of a collection are
  wrapped in turn (recursive `Map` trees stay reactive at depth). Collection
  proxies are **identity-stable across stores**, so a parent's
  `state.items.set(…)` reaches a child rendering the same Map as
  `input.list`; re-assigning an unchanged collection reference still
  notifies, because collections mutate in place.
- **`<for>` iterates `Set`** as `[ value, index ]`.
- **Spread arguments on macros**: `<option key=k ...each/>`. Call-site
  assignments apply in source order, so spreads and explicit attributes
  override each other left to right; every key is exposed through
  `arguments`; keys dropped from a spread are removed on update.
- **`self.node`** — live element nodes of a component, the handle external
  controls (drag/resize/sort) bind to.
- **Component event bus**: `on` / `once` / `off` / `emit` on every component
  self, firing `component:mount`, `component:attached`, `component:detached`,
  `component:destroy`. Attachment is tracked whether or not `onAttach` is
  defined. Root components emit to both the runtime bus and the facade's
  `Events`.
- **`onInput` receives the input object** for root and nested components.
- Mutually recursive components (`<layerlist>` ↔ `<layeritem>`) verified by
  spec.

### Added — instance salvage across `swap()` (RFC-002)
- **Component instances survive a skeleton rebuild.** A revision that changes
  a block's static markup releases the components inside it, offers them to
  the fresh render, and re-homes whichever the new template still wants:
  same state, same DOM nodes, same handlers, no lifecycle hook fired. Only
  parent-side wiring (input expressions, event instructions) is rebuilt,
  against the new call site. Components the revision dropped are destroyed
  normally.
- The same applies when only a component's **own call site** changes — the
  instance is kept and re-wired instead of remounted; inputs the revision
  removed are cleared from it.
- **Identity rule**: a `key` input decides which live instance a call site
  claims; without one, position among same-name components decides (the rule
  keyless JSX lists follow).
- **`SwapReport.salvaged`** lists the components carried through the swap.
- Focus is restored after a swap, so a revision landing mid-typing doesn't
  steal the caret.

### Fixed
- A `swap()` that rebuilt the root block dropped the scoped stylesheet: the
  rebuilt element roots were created without the `rel` marker the injected
  `[rel="<nsp>"] { … }` sheet selects on, so the component silently lost its
  styles on the first revision.

### Changed
- Spread on `<let>`/`<const>` now reports `LIPS-C013` with a fix hint instead
  of being silently dropped — scope names must be known at compile time for
  compiled expressions to resolve them.
- Size budgets raised once, deliberately: full 22→23 KB, runtime 13→14 KB gz
  (the above adds ~0.9 KB to the runtime). Rationale recorded in
  `scripts/size-check.mjs`.

---

## [0.2.0] — 2026-07-24

The engine rewrite plus the Phase 0/1 foundation work that made it verifiable.

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
- **Precompilation & CSP-safe mode**: `precompile( template )` produces
  IR ahead of time (macros inlined, template source dropped);
  `lipsPlugin()` is a Vite/Rollup transform for `.lips` single-file
  components that embeds the IR and fails the build on template errors
  with `file:line:col`. Paired with `mode: 'interpreted'`, a precompiled
  app never constructs a `Function` and runs under `script-src` without
  `unsafe-eval`.
- **Subpath entries** with a CI-enforced size budget:
  `@lipsjs/lips` (full, 21 KB gzip), `@lipsjs/lips/runtime`
  (precompiled-only — parser, compiler, Stylis, and built-in
  components all tree-shaken out, **12.1 KB gzip**),
  `@lipsjs/lips/precompile` (build-time, 9.2 KB gzip),
  `@lipsjs/lips/dev` (unminified). Stylis and the built-in `<router>`
  are injected by the full entry rather than imported by the core, so
  the runtime bundle drops them entirely. `bun run size` fails the
  build on a budget breach (`scripts/size-check.mjs`).
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

### Fixed
- **Scoped component stylesheets** now apply in the IR engine, for root
  AND nested registered components. The runtime stamps `rel="<name>"` on
  component roots so the injected `[rel="<name>"] { … }` sheet matches;
  sheets are reference-counted across instances and cleared on destroy.
  (The IR engine had regressed this from 0.1.x — it injected the
  `<style>` but stamped no `rel`, and nested components injected nothing
  at all.)

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
- `<for>` reconciliation uses a pointer walk, not LIS — swap-heavy
  workloads have headroom
- `appendTo()` silently renders `[object Object]` when passed a raw DOM
  element (legacy engine)

## [0.1.2] — 2025-05-16

Last release before this changelog was introduced.
