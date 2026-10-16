# RFC-006 — Lips on Lynx: a native host for the IR

**Status:** proposal · 2026-10-16 · minimum Lynx SDK decided: 4.0 (§9)
**Depends on:** RFC-001 (template IR), RFC-004 (StyleIR)
**Revisits:** RFC-003 §"Platform posture" — the native export target it deferred
**Tracked in:** [ROADMAP.md](../ROADMAP.md), Phase 5

---

## 1. Context

RFC-003 deferred a native target with one standing rule: *protect IR
neutrality*, and when a real export target demands it, add a structural node
tree beside `BlockIR.html` and a small host interface. This RFC is that
revisit. It picks the target, records what was verified about it, and lays out
the build order.

**Why Lynx.** Four hosts were weighed (React Native/Expo, Tauri/Capacitor
WebViews, NativeScript, a custom engine). Lynx is the only one whose
framework-facing layer matches how Lips already works:

- **A documented, mutable element API.** Frameworks create elements, change
  them in place and flush (`__CreateView`, `__AppendElement`,
  `__SetAttribute`, `__FlushElementTree`). React Native's Fabric instead clones
  every ancestor of a changed node through private, React-shaped APIs.
- **A real CSS engine.** Selectors, combinators, cascade and CSS variables,
  rather than JS style objects.
- **Built for more than one framework.** ReactLynx is first-party, Vue Lynx
  exists, and the API is published as `@lynx-js/type-element-api`.
- **Native recycling `<list>`, two-thread rendering, desktop via Clay.**

**What Lips adds over ReactLynx.** ReactLynx is Preact underneath and re-runs
components on every change; even its signals package re-renders the
subscribed component (`@lynx-js/react-signals` README). Lips updates only the
bindings a signal touches. The larger reason is strategic: a Lips template is
data. It can be generated, streamed, hot-swapped and edited inside a running
app with no build in the loop, which JSX cannot. The Lynx team is pursuing the
same idea for generated UI (`@lynx-js/genui/lynx-xml`, §3.7), which confirms
the direction.

## 2. Goals and non-goals

**Goals**

1. Precompiled Lips components render natively on Lynx (iOS, Android,
   HarmonyOS; macOS and Windows through Clay) with fine-grained updates.
2. One template source for the DOM and Lynx. What cannot map is a
   **compile-time diagnostic**, never a silently dropped rule.
3. Second milestone: templates delivered at runtime (the Modela export path).

**Non-goals**

- An app shell, native modules or release tooling. The host app owns those,
  exactly as with ReactLynx.
- Web-CSS parity. Lips compiles to the subset Lynx implements and says so.
- Depending on internal or deprecated engine APIs (§5).
- Replacing ReactLynx's ecosystem.

## 3. Verified ground

Checked on 2026-10-16 against primary sources. "Source" means read in the
engine or tooling code; "docs" means the official site source; "tested" means
executed here. Sources are pinned in §10.

### 3.1 Selectors and nesting — design change required

| Fact | Evidence |
|---|---|
| Attribute selectors parse but **never match**. `MatchSimple` has no attribute case, and `MatchOwnStyles` never reads the attribute bucket. | source; docs (unsupported-features) |
| `:is()`, `:where()`, `:has()`, `:first-child`, `:nth-child()` parse but never match. Pseudo-elements are unsupported. | source; docs |
| What matches: tag, class, id; descendant, `>`, `+`, `~`; `:not()`, `:active`, `:focus`, `:root`; `:hover` only on Clay (desktop). | source; docs |
| There is no native `&` nesting. The build step (`css-serializer`) flattens `.a { .b {} }` to `.a .b`, but **silently drops every rule that uses `&`**. | tested |
| Flat CSS with class scoping passes through the build step unchanged. | tested |

Consequence: Lips scopes by **class** on this target and **always flattens**
with `stylisPreprocessor` before Lynx sees the sheet. The strict-nesting
rewrite (`& button`, `:is(div) &`) is switched off for Lynx, because Stylis
resolves `&` and `:is()` would never match.

### 3.2 CSS variables — supported, with three constraints

| Fact | Evidence |
|---|---|
| `var()` is fully supported. Custom properties inherit to every descendant regardless of `enableCSSInheritance`: `GetCSSVariableValue` walks all ancestors. | source; docs |
| A custom property written as an inline style is honoured only with the page config `enableCSSInlineVariables: true` (default off); otherwise it is ignored. | source |
| `__AddInlineStyle` ignores custom properties. Only `__SetInlineStyles(el, {...})` handles them, and it **replaces** the element's whole inline style. | source |
| `calc()` works only on length properties (width, height, margin, padding, gap, font-size, …), not on `transform`, `border-radius`, `opacity` or colours. | docs |
| There is no `@property`. | docs (absent) |

Consequence: StyleIR's model (variables bound on the scope root) carries over.
The runtime keeps a per-element inline-style map and resends it whole. A
unit-suffixed binding compiles to `calc(var(--x) * 1px)` only on length
properties; elsewhere the bound variable carries the full value (`"12px"`).
`@property` registrations are not emitted for this target.

### 3.3 At-rules and other CSS limits

| Feature | Status |
|---|---|
| `@keyframes`, `@font-face`, `@import` | supported (`@font-face` and `@import` partially) |
| `@media` | supported from SDK 4.0 with `enableCSSRule: true` (docs). An older docs package says unsupported; the site and engine source agree it works. |
| `@supports`, `@layer` | evaluators exist in source behind `enableCSSRule`; docs say unsupported. **Unverified.** |
| `@charset`, `@namespace` | unsupported |
| `!important` | opt-in from engine 3.9 |
| `min()`, `max()`, `clamp()` | unsupported |
| Layout defaults | linear column; no block or inline flow; no margin collapsing; `display: flex`, `grid` (subset), `linear`, `relative` |

### 3.4 Text and inputs

- Visible text must sit in `<text>`, built from `__CreateText` plus
  `__CreateRawText` children. Raw text in a `view` does not render. Spans are
  nested `<text>`. Text does not wrap unless `white-space: normal` is set.
- `<input>` and `<textarea>` exist but are **uncontrolled**. There is no
  `value` prop: writes go through the `setValue` UI method, and reads come
  from the `input` event payload (`value`, `selectionStart`, `selectionEnd`).
- Built-in elements: `view`, `text`, `image`, `scroll-view`, `list`, `input`,
  `textarea`, `swiper`, `canvas`, `svg`, `markdown`, `overlay`,
  `refresh-view`, `viewpager`, `webview`, `audio`.

### 3.5 Element templates and cloning

- Element templates are declared in the public types (v0.0.10, pre-1.0) and
  under active development. An instance is created from a `templateKey` inside
  a **compiled bundle**, so runtime data cannot define one.
- `__CloneElement` carries an engine comment that it will be removed if
  release telemetry shows no usage. Treat it as deprecated.

### 3.6 JavaScript engines

- Main thread: PrimJS on every platform. Bundled main-thread code is
  precompiled bytecode (docs: about 4× faster to load).
- Background thread: PrimJS on Android, JavaScriptCore on iOS.
- PrimJS has `eval`/`new Function` only when built with its compiler
  (`NO_QUICKJS_COMPILER` unset). The build-free `.lynxml` path executes
  main-thread source, so its builds include the compiler. Whether user code
  can reach `eval` there is **unverified**. The design does not depend on it.

### 3.7 Runtime stylesheets and generated UI

- Stylesheets added at runtime come only from a compiled bundle section:
  `__LoadStyleSheet(section, bundleUrl)` then `__AdoptStyleSheet` (SDK 3.7+,
  compile options must match). Both are absent from the public types.
- The build-free `.lynxml` format carries a `<style>` block, but its official
  authoring guidance allows class selectors only, with no at-rules or
  variables.
- `@lynx-js/genui/lynx-xml` (Lynx team) generates zero-build `.lynxml` UI
  with an LLM writing directly against the element API. This validates
  templates-as-data on Lynx, and is the space RFC-003's Modela export enters.

## 4. Architecture

### 4.1 Layer 0 — the IR host seam (Lips core, prerequisite)

The DOM coupling RFC-003 anticipated is small and concentrated:

| Site | DOM dependency |
|---|---|
| `src/ir/runtime.ts:271`, `:614` | skeletons parsed through `<template>.innerHTML` and cloned |
| `:340` `stampScope` | scope stamped as a `rel` attribute |
| `:634` | comment nodes as control-flow anchors |
| `:699` | text binds insert DOM text nodes |
| `:744`, `:1675` | `addEventListener` |
| `:1664` | `document.createElement` for dynamic tags |
| `:1830` | focus restore via `document.activeElement` |
| `src/ir/facade.ts:183` | mount via `querySelector` |
| `src/stylesheet.ts` | `<style>` injection into `document.head` |

Changes:

1. The compiler emits a structural node tree (`BlockIR.nodes`) beside `html`.
   The DOM host keeps cloning `html`; other hosts walk `nodes`.
2. The runtime takes a `Host`: create element or text, insert before, remove,
   set attribute/property/classes/inline style, listen, an anchor primitive,
   and a stylesheet hook. Today's behaviour becomes the DOM host.
3. Scope stamping becomes a host decision: `rel` attribute on the DOM, a class
   on Lynx.
4. `@html` is a compile error for hosts without an HTML parser.

Exit: the full suite passes on the DOM host unchanged, and an in-memory test
host runs the IR runtime specs. This step stands on its own (test host, SSR)
even if the Lynx work stops.

**As built (2026-10-16).**

- **`src/ir/host.ts`: the `Host` interface and `domHost`.**
  - Covers creating, placing and walking nodes: `clone`, `fragment`,
    `element`, `text`, `marker`, `child`, `next`, `insert`, `remove`,
    `isElement`, `connected` and `precedes`.
  - Ranges are one call: `range( first, last )` walks a block's nodes and
    `insertAfter( ref, nodes )` moves them, with the loop inside the host.
    That keeps the hot loops where they were, and lets a native host send
    one move instead of one per node.
  - Covers mutating them: `setText`, `content`, `attr`, `styleVar` and
    `listen`.
  - The host decisions are `scope` (`rel` on the DOM), optional `html`
    and optional `keepFocus`.
  - The runtime holds no DOM reference. `RuntimeOptions.host` picks the
    host, and the DOM is the default.
- **The stylesheet hook stays where it was.** It is
  `RuntimeOptions.createStylesheet`, supplied by the facade, rather than a
  `Host` member. Change 2 above assumed it had to move. The facade
  (`facade.ts`, including `appendTo`'s `querySelector`) and `stylesheet.ts`
  are the DOM front end, so they stay DOM. A Lynx entry gets its own
  (L1, §4.7).
- **`compileTemplate( src, { target: 'tree' } )`.**
  - Adds `BlockIR.nodes`, a tree of `'text' | 0 (anchor) | [ tag, attrs?,
    children? ]`.
  - Paths are shared with `html`, and the compiler coalesces text in both
    forms the same way.
  - The tree target drops template comments, which mean nothing off the
    DOM.
  - `@html` is LIPS-C021.
  - `precompile` and `lipsPlugin` take the same option.
  - The default target's output is unchanged.
- **`src/ir/tree.ts` is the in-memory host.**
  - It is a sibling-linked tree with O(1) `next`/`insert`/`remove`: the
    shadow-tree shape a background-thread host needs (§4.2).
  - It records scope in a field rather than styling anything.
  - It is not in a published entry yet (§9, packaging).
- **How "runs the IR runtime specs" was met.** The existing runtime specs
  assert through DOM APIs (`querySelector`, `click()`), so they cannot run
  on another host as written. `tests/ir-host.spec.ts` instead renders every
  executor, events, lifecycle, styles, swap with salvage, and dispose
  through *both* hosts, and requires identical trees after every step. The
  check was proven able to fail by four deliberate tree-host bugs (dropped
  text updates, a wrong `precedes`, an `insert` that ignores its
  reference, an outer scope overwriting an inner one), each caught.
- **Cost.**
  - Size: +0.37 KB gzipped on `runtime` (14.99, inside 15 with 8 bytes
    left) and +0.29 KB on the compiler entries. `full` moved 26 → 26.5 KB;
    the note is in `scripts/size-check.mjs`.
  - Speed: side-by-side Chromium A/B at 10k rows, isolated timers, forced
    GC, four rounds of 30 alternating iterations. Median ratios against the
    previous runtime: create 1.00, replace 1.01, update 1.00, swap 0.99,
    remove 1.04, append 1.02, clear 0.94. A per-node host shape measured
    the same, so the range shape stays for Lynx's sake.
  - The same pass fixed a pre-existing O(n²) in keyed `<for>` (every
    change ran `ordered.includes` per row). With it, every list operation
    measures at or below the pre-seam runtime (two rounds: remove 0.91,
    clear 0.95, update 0.97, append 0.97, replace 0.98, swap 0.99), and
    create, which never runs that code, at 1.02.

### 4.2 Threads and the change protocol

- **Background thread:** the Lips runtime: signals, bindings, handlers,
  lifecycle and effects. It never calls the element API.
- **Main thread:** a small applier. It receives serializable batches (create,
  insert, remove, set attribute/classes/inline styles, listen) keyed by
  integer ids allocated on the background thread, applies them through the
  element API, and flushes once per batch.
- **Events:** a main-thread listener forwards a serialized event to the
  background thread, the handler runs, and changes flow back.
- **Later:** instant first frame (the main thread instantiates the
  precompiled IR with initial state before the background thread is ready),
  and `main-thread:` handlers for gestures that follow the finger.

This mirrors the split the official vanilla-Lynx guidance prescribes: element
API calls only on the main thread, serializable patches from the background.

**As built, L1 (2026-10-16).**

- **`src/lynx/protocol.ts`.** One flat array per flush: an opcode followed by
  its operands (`CREATE`, `TEXT`, `INSERT`, `REMOVE`, `ATTR`, `SET_TEXT`,
  `STYLES`, `LISTEN`, `UNLISTEN`, `RELEASE`). It holds primitives only, so
  the cross-thread copy is as cheap as a message gets. Ids are integers the
  background allocates; 1 is the page. The HTML-to-Lynx tag map (§4.3) and
  `click` → `tap` live here.
- **`src/lynx/background.ts`.** A `Host` over a shadow tree (the L0 tree
  host's linked list, plus ids).
  - Only **real** nodes cross: elements, and text under a `text` element.
    Markers, fragments and other text stay virtual, and insert positions
    skip them.
  - A text bind's first value rides in its `TEXT` op instead of a second
    `SET_TEXT`.
  - `class` and `style` merge with the scope class (`lips-<nsp>`) and the
    style variables.
  - Ops are flushed once per promise job.
- **`src/lynx/main.ts`.** The applier.
  - Routes `class` / `id` / `data-*` to `__SetClasses` / `__SetID` /
    `__AddDataset`, and everything else to `__SetAttribute`.
  - Binds `__AddEventListener` and forwards `{ type, detail }`.
  - Calls `__FlushElementTree()` once per batch.
- **One runtime change.** `Host.remove( node, gone )` tells a host the node
  is being destroyed, not moved. The Lynx host then releases the subtree's
  ids on both threads. The runtime passes it from `destroy`, a rebuilt
  block's dropped text binds, and unresolved elements' disposal: +5 bytes
  gzipped, and `runtime` stays inside 15 KB.
- **Found on the way.**
  - In the background runtime, `lynx` is a parameter of the bundle's
    module wrapper, not a property of `globalThis`. The bridge uses it as a
    free identifier.
  - `@lynx-js/testing-environment` (0.3.4, and 0.4.0 too) implements only
    the ReactLynx-era `__AddEvent`, not `__AddEventListener`. Its spec
    shims the pair.
  - Its `__SetAttribute` rejects `class`, `id`, `style`, `data-*`, `key`
    and `bind*`, which is why the applier routes them.
  - **Tier B only:** the native engine calls a global `renderPage` on the
    main thread and throws when it is missing; Lynx for Web never calls
    it. `connectMain` installs no-op `renderPage`, `updatePage` and
    `processData` unless the app defines its own.
  - **Tier B only:** the native background engine has no
    `queueMicrotask`. The core runtime used it to schedule `onUpdate`,
    outside the effect's error guard, so the throw could abort the effects
    after it. It now uses a promise job (runtime 4 bytes smaller), and the
    tier-A spec runs one test with `queueMicrotask` removed.
- **Tests, tier A.**
  - `tests/lynx-binding.spec.ts` (11 specs) runs both threads through the
    testing environment's real bridge. After every step it requires the
    main thread's element tree to equal the shadow tree's real nodes. Three
    deliberate host bugs were each caught.
  - `demos/lynx/e2e.mjs` builds the demo with Rspeedy and drives the
    **Lynx for Web** bundle in Chromium: first render from the background,
    taps round-tripping both threads, keyed insert and reverse. All 7
    checks pass.
- **Tests, tier B (2026-10-16).** `demos/lynx/native/run.sh` runs the demo's
  native bundle in the real Lynx 4.1 engine (`libLynx_clay`, Linux
  x86_64), headless.
  - It drives the engine through lynx-stack's `lynx-headless-rust-test-runner`
    at the pinned commit. The runtime and core script are checked against
    lynx-stack's pinned SHA-256s.
  - 10 checks pass: first render, the Lynx element mapping, no markers or
    stray text in the engine's DOM, taps round-tripping both threads (by
    native node id), keyed insert and reverse with row identity kept, and
    the native CSS engine matching the classes the binding sets
    (`background-color`, `font-size`).
  - It fails on any JS error the engine reports, not just unmet checks.
    The `queueMicrotask` bug passed every functional check and was caught
    only by that.
  - L1's exit is met at tiers A and B.
- **Known limits, owned by later steps.**
  - Text outside a text element is not rendered and not yet reported:
    L3 decides between a diagnostic and auto-wrap (§9.2).
  - Removing a `data-*` attribute writes `undefined`, because there is no
    removal call.
  - Event payloads carry `type` and `detail` only (`value` for inputs is
    L3).

### 4.3 Vocabulary

Templates stay HTML-shaped and map onto Lynx elements:

| Template | Lynx |
|---|---|
| `div`, `section`, `article`, `nav`, `header`, `footer`, `main`, `ul`, `li`, `button`, … | `view` |
| `span`, `p`, `h1`–`h6`, `label`, `b`, `strong`, `em`, `small`, `a` | `text` (nested `text` inside text) |
| `img` | `image` |
| `input`, `textarea` | `input`, `textarea` |
| explicit Lynx tags (`scroll-view`, `list`, `swiper`, …) | themselves |

Raw text outside a text-like element is a compile-time diagnostic. Whether to
auto-wrap the unambiguous case is open (§9).

### 4.4 Style pipeline for the Lynx target

1. Lips scanner (unchanged): interpolations lifted, at-rules hoisted.
2. Mandatory Stylis flattening. The `&`/`:is()` rewrite is off.
3. Class scope `.lips-<nsp>` instead of `[rel="<nsp>"]`.
4. **Lynx lint**, as Lips diagnostics with source locations:
   - attribute selectors and non-matching pseudo-classes;
   - pseudo-elements;
   - unsupported at-rules (`@media` only when `enableCSSRule` is set);
   - `min()`, `max()`, `clamp()`;
   - properties outside the supported set;
   - `calc()` on non-length properties.
5. Output into the bundle CSS through the build plugin (§4.7).

Reactive values bind as variables on the scope root through
`__SetInlineStyles`, with `enableCSSInlineVariables: true`, using the
full-value rule from §3.2.

**Runtime-delivered templates** cannot ship arbitrary CSS (§3.7). Version 1
restricts them to classes from precompiled sheets plus inline styles. A later
version may encode their CSS server-side into a CSS-only bundle and adopt it
with `__LoadStyleSheet`, which is internal (§8).

### 4.5 Events and inputs

- `on-*` maps to Lynx event names (`tap`, `input`, `confirm`, `focus`,
  `blur`, `scroll`, `layoutchange`, …) through `__AddEventListener`, never
  `__AddEvent`.
- A `value` binding on `input`/`textarea` writes through `setValue`
  (`__InvokeUIMethod`) and reads back from the `input` event. Two-way binding
  semantics are documented as uncontrolled-with-sync.

### 4.6 Expressions

Bundled apps compile template expressions to real functions at build time, so
nothing is evaluated from strings on device. Runtime-delivered templates use
the existing `mode: 'interpreted'`. Nothing depends on `eval`.

### 4.7 Build and packaging

- An Rspeedy plugin (`@lipsjs/lips/lynx-plugin`) compiles templates and
  `.lips` files into the main-thread and background entries, routes CSS
  through §4.4, and sets the page config this design needs
  (`enableCSSInlineVariables` and `enableCSSRule`; both exist on the
  SDK 4.0 floor, §9).
- A runtime entry (`@lipsjs/lips/lynx`) holds the background host and the
  main-thread applier, with its own size budget in `scripts/size-check.mjs`.

## 5. Engine APIs: allowed and refused

**Allowed** (public types and official guidance): page/view/text/raw-text/
image/scroll-view/list creation; `__AppendElement`, `__InsertElementBefore`,
`__RemoveElement`, `__ReplaceElements`; `__SetAttribute`, `__SetClasses`,
`__AddClass`, `__SetInlineStyles`, `__SetID`, `__SetDataset`;
`__AddEventListener` and `__RemoveEventListener`; `__InvokeUIMethod`;
`__GetElementUniqueID`, `__ElementIsEqual`; `__FlushElementTree`.

**Deferred** until they reach 1.0 or prove stable: element templates (§3.5),
as a build-time optimisation for precompiled blocks.

**Refused:**

- `__CreateIf`, `__CreateFor`, the style-object APIs and `__AddEvent`:
  official guidance says not to use them.
- The native signal APIs (`__CreateSignal`, `__CreateMemo`, …): engine-only,
  not in the public types.
- `__CloneElement`: marked for removal.

## 6. Where each test runs

| Tier | Where | What it proves |
|---|---|---|
| A | This repository's cloud container, today | Node tests against `@lynx-js/testing-environment` (element API on jsdom); real Rspeedy builds (the TASM encoder ships a Linux addon); end-to-end runs in Chromium through Lynx for Web (`@lynx-js/web-core`). The browser does the CSS here, so native CSS rules are not proven at this tier. |
| B | Cloud container with one allowed host | The real Lynx 4.1 engine, headless, via `lynx-headless-rust-test-runner` and its prebuilt Linux runtime: native CSS matching, variables, layout, computed styles, taps and screenshots. Needs `lynx-genui-storage.tos-cn-beijing.volces.com` in the environment's allowed domains. |
| C | A device or Mac | iOS JavaScriptCore behaviour, IME and keyboard, gestures, HarmonyOS, and performance on a mid-range Android phone. Lynx Explorer loading bundles from a dev server on the maintainer's machine. |

## 7. Build order

Each phase ends with an exit check. ROADMAP.md Phase 5 tracks them.

- **L0 — Host seam** (§4.1). Tier A. Lips core only.
- **L1 — Renderer spike:**
  - static and reactive text, attributes and classes;
  - `<if>` and `<for>`;
  - `tap` events.

  Exit: a counter and a keyed list render through the testing environment and
  Lynx for Web, and through the real engine at tier B.
- **L2 — Style pipeline** (§4.4). Exit: StyleIR specs assert computed styles
  in the real engine (tier B), and every §3 limit has a diagnostic.
- **L3 — Inputs, scroll, list, vocabulary diagnostics.**
- **L4 — Decision gate.** One real screen built in both ReactLynx and Lips.
  Measure, on a device (tier C):
  - first-frame time;
  - state-change-to-frame latency;
  - CPU per thread;
  - size of the updates sent between threads;
  - memory.

  Then push a changed template into the running app without a rebuild. Go or
  no-go is recorded here.
- **L5 — Runtime templates** (the Modela export path, §4.4).
- **L6 — Optimisations:** element templates for precompiled blocks, instant
  first frame, main-thread gesture handlers.

## 8. Risks

- **Lynx moves fast.** Pin the SDK, `lynx-stack` packages and the headless
  runtime, and test against the pinned set.
- **Docs disagree with the engine** (`@media` was the example). Trust tier-B
  tests over either.
- **Runtime CSS depends on internal APIs** (`__LoadStyleSheet`). Version 1
  avoids them.
- **No first-party support.** Engine features land for ReactLynx first. The
  element API is documented and typed, which keeps the binding far steadier
  than any React Native path.
- **Adoption compounds:** two niche technologies stacked. The L4 gate exists
  to stop early if the gain is not real.
- **Overlap with the Lynx team's own generated-UI work** (§3.7). That is both
  validation and competition for Modela.

## 9. Open decisions

1. ~~**Minimum Lynx SDK:** 4.0 or 3.7.~~ **Decided 2026-10-16: 4.0.**
   - `@media` needs it (§3.3), and responsive layout is not optional.
   - It is above the 3.7 floor for runtime stylesheets (§3.7), so L5 keeps
     that option.
   - The tier-B headless runtime is 4.1, so the floor is close to what the
     tests run against.
   - Cost: an app pinned below 4.0 cannot adopt Lips without upgrading.
2. **Raw text outside text elements:** always an error, or auto-wrap when the
   wrapper is unambiguous.
3. **Packaging:** subpath entries of `@lipsjs/lips`, or a separate
   `@lipsjs/lynx` package.

## 10. Sources

All read on 2026-10-16.

- `lynx-family/lynx` @ `bb1bb52`:
  - `core/renderer/css/ng/matcher/selector_matcher.cc`
  - `core/renderer/css/ng/style/rule_set.cc`
  - `core/renderer/dom/attribute_holder.cc`
  - `core/runtime/lepus/bindings/renderer_functions.cc` and
    `renderer_functions_def.h`
- `lynx-family/lynx-stack` @ `b651885`:
  - `packages/tools/css-serializer/src/parse.ts` (the build-time flattener
    tested in §3.1)
  - `packages/rspeedy/plugin-react/src/pluginReactLynx.ts`
  - `packages/genui/lynx-xml`
  - `packages/react-signals/README.md`
  - `packages/lynx/headless-rust-test-runner`
  - `packages/lynx/engine-bridge`
- `lynx-family/primjs` @ `3576d1b`: `src/interpreter/quickjs/source/quickjs.cc`
- `lynx-family/lynx-website`:
  - `docs/en/api/css/selectors.mdx`
  - `docs/en/api/css/media-query.mdx`
  - `docs/en/guide/styling/custom-theming.mdx`
  - `docs/en/guide/scripting-runtime/index.mdx`
- npm packages:
  - `@lynx-js/type-element-api@0.0.10`
  - `@lynx-js/lynx-api-docs@0.3.9`
  - `@lynx-js/skill-vanilla-lynx@0.2.0`
  - `@lynx-js/tasm@0.0.53` (ships `build/linux/Release/lepus.node`)
