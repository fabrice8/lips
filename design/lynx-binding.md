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
- `<input>` and `<textarea>` exist but are **uncontrolled**. Writes go
  through the `setValue` UI method, and reads come from the `input` event
  payload (`value`, `selectionStart`, `selectionEnd`). *L3, real engine:* a
  `value` attribute does set the first value; `setValue` sets every later
  one and fires `input` itself (§4.5, "As built, L3").
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
- Whether PrimJS has `Intl` is **unverified**. i18n does not depend on it:
  where it is missing Lips installs the least MessageFormat 2 needs (plain
  numbers and dates, every plural `other`; `design/i18n-context.md` §5.4).

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

### 3.8 Accessibility — Lynx has its own attributes, not ARIA

Checked on 2026-11-23 in the engine source and the official docs (§10,
"Accessibility"). No device run: what a screen reader says is tier C.

| Lynx attribute | iOS | Android | HarmonyOS |
|---|---|---|---|
| `accessibility-element` | `isAccessibilityElement`; default off on `view`, on for `text` and `image` | important-for-accessibility; the default comes from page config `enableAccessibilityElement` (default `true`) | yes |
| `accessibility-label` | `accessibilityLabel` | `contentDescription` | yes |
| `accessibility-traits` | a comma list of 14 words (`button`, `link`, `header`, `image`, `selected`, `disabled`, `search`, `adjustable`, `tabbar`, …), not trimmed | **one** of `none`, `image`, `button`, and only on the `enableA11y` path (below) | **one** of `text`, `image`, `button` |
| `accessibility-value` | `accessibilityValue` | `setStateDescription` (API 30+) | — |
| `accessibility-heading` | — (the `header` trait) | `setAccessibilityHeading` (API 28+) | — |
| `accessibility-role-description` | — | `enableA11y` path: `checkbox`, `switch`, `progressbar`, `image`, `button` set the class, so Android speaks it in the user's language; anything else is spoken as written | — |
| `accessibility-status` | prefixed to the label, `"status, label"` | `enableA11y` path: the same | — |
| `accessibility-elements-hidden` | `accessibilityElementsHidden` | `IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS` | yes |
| `accessibility-exclusive-focus` | only that subtree can be focused | the same | yes |
| `accessibility-elements` | reading order of child ids; the others become unfocusable | the same | — |
| `requestAccessibilityFocus` (UI method) | posts `LayoutChanged` with the view | moves accessibility focus | — |
| `lynx.accessibilityAnnounce({ content }, cb)` | `UIAccessibilityAnnouncementNotification` | API 28+: `setAccessibilityPaneTitle`, else `announceForAccessibility` | module exists |
| `focusable` | — | keyboard focus; Clay on every desktop | Clay |

- **Android has three accessibility paths**, picked by page config. By
  default (neither flag set) a node provider builds virtual nodes. It reads
  `accessibility-element`, `-label` (or the children's text) and `-elements`,
  and reports each node's class as its Lynx UI class, so **traits and role
  descriptions are ignored**. `enableA11y: true` selects the helper path,
  which reads all of the above. `enableNewAccessibility` is deprecated since
  3.5.
- **An iOS view that is an accessibility element hides its subviews**, and
  Lynx gives it no label from them. A promoted `view` needs one.
- **There is no live region**, only the imperative `accessibilityAnnounce`,
  and no distinction between polite and assertive.
- **There is no id-reference labelling** (`labelledby`), no
  checked/selected/expanded state API, and no list, table or grid
  semantics.
- Lynx for Web passes none of these attributes on to ARIA.
- Unknown attributes are ignored by `__SetAttribute`, so ARIA sent as written
  is lost without an error.

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
  - CI runs it (`.github/workflows/lynx-native.yml`) on changes to `src/`
    or `demos/lynx/`, on GitHub's Ubuntu 24.04 runners. The engine needs
    glibc 2.18 or newer and `libepoxy0`.
  - L1's exit is met at tiers A and B.
- **Known limits, owned by later steps.**
  - Text outside a text element is not rendered and not yet reported:
    L3 decides between a diagnostic and auto-wrap (§9.2). *Done in L3:
    auto-wrap where unambiguous, an error elsewhere.*
  - Removing a `data-*` attribute writes `undefined`, because there is no
    removal call.
  - Event payloads carry `type` and `detail` only (`value` for inputs is
    L3). *Done in L3: `e.target.value` beside `e.detail.value`.*

**As built, equal writes (2026-11-25).**

- **The cause.** The L4 emulator run (§7) found Lips sending 5.4× more
  per state change than ReactLynx. A replaced `<for>` array re-runs every
  kept row's binds: `set` for a new object, `touch()` for the same one,
  which deep-reactive mode needs. Nothing between the bind and the wire
  dropped a value equal to the last, so 100 rows' text crossed where 11
  changed.
- **As built.** The background host drops an equal write, the one place
  that sees them all: `setText` against the node's text, `attr` against
  a mirror of what it last wrote per element, `styleVar` against the
  element's custom properties. On a 20-row screen with bound text,
  `data-*`, `class` and a custom property per row, a step sends the 3
  texts that changed instead of every row's, and re-assigning the same
  array sends nothing (it sent 200 ops at 100 rows). The DOM host is
  unchanged: its cost was not measured.
- **Tests.** Tier A, 2 specs: a replaced and a re-assigned array, and a
  changed value, a removal and a custom property each sent once. Six
  deliberate breakages were each caught (each check removed, the mirror
  not kept, a removal sent twice, a changed attribute dropped).

### 4.3 Vocabulary

Templates stay HTML-shaped and map onto Lynx elements:

| Template | Lynx |
|---|---|
| `div`, `section`, `article`, `nav`, `header`, `footer`, `main`, `ul`, `li`, `button`, `blockquote`, `dl`, … | `view` |
| `span`, `p`, `h1`–`h6`, `label`, `b`, `strong`, `em`, `small`, `a`, `code`, `abbr`, … | `text` (nested `text` inside text) |
| `img` | `image` |
| `input`, `textarea` | `input`, `textarea` |
| explicit Lynx tags (`scroll-view`, `list`, `swiper`, …) | themselves |

Raw text outside a text-like element is wrapped in one `text` when the
element's content is all inline, and is a compile-time error otherwise
(§9.2, decided). An HTML tag with no Lynx element (`table`, `select`, `br`,
…) is an error. `compileLynxTemplate` does both (§4.5, "As built, L3").

**As built, inline SVG (2026-11-24, lips#34).**

- **What Lynx's `svg` is.** One native view, drawn from a markup string
  (`content`) or a URL (`src`), not from child elements. It reads 17 tags
  and about 40 attributes (lynxjs.org, `<svg>`). It is an XElement: the
  host app must integrate XElement for it to draw, as for `blur-view`.
- **The template pass** keeps an `<svg>` subtree whole. Every element
  inside, through control flow, is stamped `lips-svg="<spelling>"`. The
  parser lowercases tags, and Lynx needs `clipPath`, `linearGradient` and
  `radialGradient`, so the stamp carries the SVG spelling. Stamping is
  done at compile time because an `if` arm or a `for` row inside an svg is
  built apart from it, and `text` and `image` are Lynx elements too.
  `LIPS-L108` (warning) reports what Lynx's svg does not draw: a tag or
  attribute outside its subset, an event, a component.
- **The background host** makes stamped elements parts of the markup:
  shadow nodes with no id, never created on the main thread. Their text
  never becomes real either. An insert, removal, attribute or text change
  under an svg marks it, and the flush writes each marked svg's subtree
  into its `content`, escaped, as ONE `ATTR`, and only when the markup
  changed. The svg's own `class`, `style`, `id`, `data-*` and ARIA stay on
  its element; its other attributes go in the markup.
- **Size.** Tier B found that Lynx sizes an svg by its style alone: with
  only `width` and `height` attributes it laid out 368×0. So those two
  also go first in the element's inline style, as on the DOM, where they
  size the element. The template's own `style` overrides them; unlike the
  DOM, a class rule does not, because inline style wins on Lynx.
- **A colour from a theme.** A CSS variable does not reach inside the
  markup, so `fill="var(--accent)"` does not follow a theme. Bind the
  value itself (`fill=state.accent`), which rewrites the markup. The other
  route the issue named, an icon drawn as `mask-image` over a
  `background-color`, is not settled (below).
- **Tests.**
  - Tier A: `tests/lynx-template.spec.ts` gains 4 specs: stamping and
    spelling through control flow, `LIPS-L108` at the source, the DOM
    target untouched. `tests/lynx-binding.spec.ts` gains 6: one element
    with its markup in `content`, rewritten for a bound attribute, a `for`
    row, a removal and a text, escaping, one `ATTR` per flush and none for
    the same markup, sizing, `data-*`, no events on parts, release. Twelve
    deliberate breakages were each caught: markup sent once only, no
    stamp, no escaping, the subtree walked as HTML, no `L108` on
    attributes, text under an svg `text` made real, a removal or a text
    change not redrawn, parts listening, no size, size not resent,
    `data-*` in the markup.
  - Tier B: one check. The demo's icon reaches the engine as one `svg`
    with its markup in `content`, the bound `fill` follows a state
    change, and it lays out 24×24.
- **Not verified.**
  - Drawing. The headless runner does not integrate the svg XElement: the
    element and its `content` are there, and its pixels stay empty with
    or without `xmlns`. What it draws is tier C.
  - `mask-image` with an SVG. A `linear-gradient` mask is applied in the
    real engine (checked by pixels). An SVG mask was not, but neither did
    an `<img>` with the same data URI draw: the runner renders no
    `url()` image. So it is undecided, and needs a device.

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

**As built, L2 (2026-10-16).**

- **`src/lynx/style.ts`: `compileLynxStyle( source, { nsp, preprocess })`.**
  It returns the usual StyleIR: `css` for the bundle, `binds` for the
  background.
  - **Flat, class-scoped.** The preprocessor is a required argument, and
    the scope wrap is `.lips-<nsp>`. The `& `/`:is()` rewrite now runs
    only when a sheet ships nested, on any target. A preprocessor resolves
    `div &` itself, and `:is()` never matches on Lynx.
  - **Full values everywhere.** The RFC planned `calc()` on lengths and a
    full value elsewhere. Every bind writes its full value instead, so
    there is no table of length properties to keep right.
    `padding: {x}px` becomes `var(--card-0-px)`, bound with its unit, and
    the runtime writes `12px`. One expression used with two units is two
    variables. There are no `@property` registrations.
  - **Lint**, reported on the source with locations:

    | Code | Severity | What (§) |
    |---|---|---|
    | LIPS-L001 | error | attribute selector (§3.1) |
    | LIPS-L002 | error | pseudo-element, `::x` or legacy `:before` (§3.1) |
    | LIPS-L003 | error | pseudo-class other than `:not` `:active` `:focus` `:root` (§3.1) |
    | LIPS-L004 | warning | `:hover`, desktop only (§3.1) |
    | LIPS-L005 | error | HTML type selector: `div` renders as `view` (§4.3) |
    | LIPS-L006 | error | unsupported at-rule: `@container`, `@property`, `@charset`, … (§3.2, §3.3) |
    | LIPS-L007 | warning | `@supports`, `@layer`: untested (§3.3) |
    | LIPS-L008 | warning | not a Lynx property (the `@lynx-js/types` 4.2.1 list) |
    | LIPS-L009 | error | `min()`, `max()`, `clamp()` (§3.3) |
    | LIPS-L010 | error | `calc()` off a length property (§3.2) |
    | LIPS-L011 | warning | `!important` (§3.3) |
    | LIPS-L012 | error | `line-clamp`, `-webkit-line-clamp`: Lynx cuts text with the `text-maxline` attribute (lips#42) |

    Every CSS limit in §3.1–§3.3 has one. Layout defaults (§3.3) cannot be
    seen in a sheet.
  - **`LYNX_PAGE_CONFIG`**: `enableCSSInlineVariables`, `enableCSSRule`
    and `enableCSSInheritance`, all `true`.
- **As built, `line-clamp` (2026-11-24, lips#42).** Lynx cuts a text to N
  lines with an attribute, `text-maxline="N"` on the `<text>`, with
  `text-overflow: ellipsis`, and has no `line-clamp` property. A sheet
  using one got only the generic L008, and the text was never cut.
  - `LIPS-L012` (error) fires on `line-clamp` and `-webkit-line-clamp`,
    in any case, in place of L008. Its hint names `text-maxline`, with
    the literal count when there is one (`text-maxline="3"`), `N` for a
    bound one. An error, like L009 and L010: the rule would do nothing
    on Lynx, and the fix is known.
  - Mapping a literal `line-clamp: N` onto the elements a rule scopes
    was not built. A rule's selector does not say which elements it
    reaches at run time, so it would be right only where it is
    unambiguous, and the issue preferred the lint as the cheaper route.
  - Cost: +105 bytes gzipped on `lynx` (17.79 → 17.89; budget 18.05) and
    on the plugin.
  - Tier A: 1 spec in `tests/lynx-style.spec.ts`: both spellings with
    their locations, the hint with a literal and with a bind, no L008
    beside it, quiet `text-overflow` and `overflow`, and a longer name
    that only contains it. Nine deliberate breakages were each caught:
    no code of its own, `-webkit-` missed, L008 as well, any name
    containing it, case-sensitive, the fix not named, the count not
    carried, a warning instead of an error, `text-overflow` flagged.
  - Not verified: that `text-maxline` cuts the text is Lynx's documented
    behaviour, not checked at tier B.
- **The core cost.** The style compiler gained a `scope` option and a
  `lint` hook. Its statements now start at their first character, so every
  diagnostic, not just Lynx's, points at the right column. That costs 69
  bytes on the compiler-bearing bundles. The runtime writes a bind's unit,
  for 6 bytes. Compiling a 4,000-rule sheet is ~20% faster than before,
  with identical output.
- **Build route: `demos/lynx/lips-styles.ts`.** This is the CSS half of
  §4.7's plugin, kept with the demo until packaging is decided. *Now
  published as `@lipsjs/lips/lynx-plugin` (§4.7, "As built, packaging").*
  - A `*.lips.css` file is compiled ahead of Lynx's CSS pipeline. Its file
    name is the scope.
  - A `?raw` import of it gives the background its IR.
  - `beforeEncode` sets the page config.
  - Any error diagnostic fails the build.
- **Found on the way (tier B, real engine).**
  - The three flags are **page config** (`sourceContent.config`). As
    compiler options they do nothing.
  - `__SetInlineStyles` with a **string** carries custom properties in 4.1,
    not just the object form (§3.2). The engine logs `illegal css key:239`
    once per inline variable and applies it anyway.
  - `opacity: calc(…)` stays an unevaluated string, so §3.2 holds.
    `calc(var(--n) * 1px)` on `width` works.
  - `var()` in a shorthand renders (`border-radius`). The computed-style
    map reports the shorthand, not the longhands.
  - Without `enableCSSInheritance`, a text inside a coloured container is
    black. With it, `color` and `font-size` inherit as on the web. The
    computed-style map does not show inherited `color`; the frame does.
- **Found on the way (build).**
  - css-loader requests an `@import` past every configured loader, so a
    Lips sheet `@import`ed from `style.css` reached Lynx uncompiled. Error
    recovery dropped its scoped rules without a word. The sheet is
    imported from `main-thread.ts` instead.
  - Rspeedy loads its config with Node's own loader. That needs file
    extensions, which Lips's sources do not use, so the plugin loads them
    with `jiti`. The demo also declares `typescript`, which that loader
    imports. It had been resolving from the repo root, which CI does not
    install.
- **Tests.**
  - Tier A: `tests/lynx-style.spec.ts` (18 specs) covers the output shape,
    full values and every lint code, with locations and with no false
    alarms. It also checks that the demo's sheet compiles clean.
  - Tier A: `tests/lynx-binding.spec.ts` checks the scope class and the
    full-value binds on the main thread. The web e2e (`demos/lynx/e2e.mjs`)
    adds three style checks: 10/10.
  - Tier B: `run.sh` adds four checks on the demo's sheet, read from the
    engine's computed styles. 14/14 pass.
    - The scope class reaches the root.
    - Scoped rules match, and `@media` applies.
    - Text properties inherit.
    - The binds apply (accent colour, padding in px, radius in px, width
      in %), and a state change rewrites all four.
  - Two mutations were each caught at tier B: dropping
    `enableCSSInlineVariables` failed the bind checks, and renaming the
    scope class failed the root-class check.
  - L2's exit is met.

### 4.5 Events and inputs

- `on-*` maps to Lynx event names (`tap`, `input`, `confirm`, `focus`,
  `blur`, `scroll`, `layoutchange`, …) through `__AddEventListener`, never
  `__AddEvent`.
- A `value` binding on `input`/`textarea` writes through `setValue`
  (`__InvokeUIMethod`) and reads back from the `input` event. Two-way binding
  semantics are documented as uncontrolled-with-sync.

**As built, L3 (2026-10-19).**

- **What the real engine does** (tier B, probed through Element PAPI alone
  before any Lips code):
  - **Inputs.** A `value` attribute sets the first value. `setValue` sets
    any later one and fires `input` with `{ value, selectionStart,
    selectionEnd, isComposing }`, as typing does. `getValue` and `focus()`
    work, and a hit-tested touch focuses the input. Lynx for Web's
    `setValue` updates the field but fires no `input`.
  - **UI methods before the element's first flush** throw a main-thread
    `TypeError` and never call back.
  - **`scroll-view`** scrolls only with `scroll-y` set to `true` or
    `"true"`: an empty string reads as false. A user drag fires `scroll`
    (with `scrollTop`, `deltaY`, `isDragging`) and then `scrollend`.
  - **`list`** is virtualized. It asks `componentAtIndex` for the cells
    in view only (5 of 40 at 100px), and for more as it scrolls. It reports
    cells leaving view through `enqueueComponent` but keeps them in the
    tree. It applies positional `removeAction`s (old positions) and
    `insertAction`s (new positions). **An insert without `item-key`
    renders nothing**; `type` is optional, and the cell needs no
    `item-key` attribute.
  - Surrounding whitespace in text collapses as in HTML: `"\n  Save\n"`
    lays out on one 16px line, like `"Save"`.
  - Key events do not type: text entry goes through an IME interface the
    runtime does not document. Typing stays tier C, and tier A types for
    real in Chromium.
- **Protocol: `INVOKE id, method, params, call`.** The applier runs UI
  methods after the batch's flush, never before it. A `call` other than 0
  asks for the result: the main thread sends `{ call, code, data }` back
  on the event channel, and the background resolves what waits for it.
- **Inputs.** The background host sends `value` as the attribute in the
  batch that creates the input, and as `setValue` after that. A value equal
  to what the input last reported is not sent, so state that mirrors the
  input never writes back over the user's next keystroke. An event whose
  detail has a `value` also carries `e.target.value`, so DOM-shaped handlers
  work unchanged.
- **Attributes.** An empty attribute goes to Lynx as `true`, HTML's
  presence semantics, except `value` and `placeholder`. `<scroll-view
  scroll-y>` scrolls.
- **Lists.** The applier creates `list` with `__CreateList`. Its cells are
  built eagerly: they are ordinary elements the background renders anyway.
  An INSERT or REMOVE under a list only updates the list's order. Once per
  batch, the applier tells the list what changed in one `update-list-info`.
  A reorder keeps the longest increasing run in place and moves the rest,
  so a reversal moves all but one cell. Each insert carries `item-key`, the
  cell's id. `componentAtIndex` appends the cell at that position and
  flushes it with the list's operation id. Removed cells leave the list
  element once the list has been told.
- **`compileLynxTemplate( src )`** (`src/lynx/template.ts`) is
  `compileTemplate( src, { target: 'tree' })` plus a pass over the parsed
  template:

  | Code | Severity | What |
  |---|---|---|
  | — | — | inline content of a non-text element (text, binds, text-like tags, control flow around them) wrapped in one `text` |
  | LIPS-L101 | error | HTML tag with no Lynx element, with what to use |
  | LIPS-L102 | error | text beside block content: one text or several is ambiguous |
  | LIPS-L103 | warning | text at a template's top level renders only inside a text element |
  | LIPS-L104 | error | a `list` child that is not a `list-item` |

  An `i18n` marker is copied to the wrapper, which holds the text it
  translates. Component content is left alone, since its placement is the
  component's. `@text` on a non-text element gets a text of its own at
  runtime. Macro bodies are inlined after the pass, so it does not see
  them.
- **The core cost.** `compileTemplate` gained a `transform` hook, run on the
  parsed template before it compiles: +10 bytes on the full bundle (26.52 of
  26.55 KB) and on `precompile` (13.87 of 14). `runtime` is unchanged.
  Everything else is in `src/lynx/`.
- **Tests.**
  - Tier A: `tests/lynx-template.spec.ts` (13 specs) covers wrapping, every
    code with its location, and the demo's template compiling clean.
    `tests/lynx-binding.spec.ts` gains 8 L3 specs: list update info, cells
    built only when asked, reorders and removals, input value via attribute
    then `setValue` after the flush, the echo guard, empty attributes,
    `@text`, and a wrapped button label. Six deliberate breakages (no
    `item-key`, no echo guard, UI methods before the flush, no stable run,
    empty attributes kept, removed cells left attached) were each caught.
  - Lynx for Web e2e: six L3 checks (16/16), including real typing in
    Chromium.
  - Tier B: six L3 checks (20/20) on the demo. The wrapped label renders.
    The list builds items 1–5 of 40, asks again for 40–36 after a reorder,
    and for more on a drag. `setValue` reaches the native input and its
    `input` event comes back. A bare `scroll-y` scrolls under a drag, and
    `scroll` reaches the background. Breaking `item-key`, the empty-
    attribute rule or the auto-wrap each failed them.
  - The runner has no public drag or scroll, so `run.sh` applies
    `runner.patch`, six lines that expose its native view. The harness's
    `probe` mode gains `box=`, `touch=` and `drag=` steps.
- **Not done.** List cell layout hints (`full-span`, sticky, estimated
  sizes) and recycling are not passed on. UI methods from app code, once
  not done for want of element references, are built: "As built, element
  references" below. *Cell hints are built: "As built, cell hints" below.
  Recycling is not.*

**As built, cell hints (2026-11-24, lips#43).**

- **What Lynx reads, and where** (engine source, `lynx-family/lynx` at
  4.1.0 and at head): `core/list/decoupled_adapter_helper.cc`, the list
  the 4.1 runtime uses (its log says `enable_native_list=true,
  enable_decoupled_list=true`), reads `full-span`, `sticky-top`,
  `sticky-bottom`, `estimated-height-px` and `estimated-main-axis-size-px`
  from each `update-list-info` insert action, and again from an update
  action, by item key. It reads them only as JSON: a flag counts only if
  `IsBool()`, a size only if `IsNumber()`. ReactLynx's own list sends the
  same fields (`platformInfo.ts`). Lynx for Web reads them as attributes
  of the `list-item`, and sticks a cell with CSS only in a list whose
  `sticky` is true.
- **The applier** keeps each cell's hints, converted from the attribute
  text Lips sends: a flag is set when present (HTML's rule) unless written
  `"false"`, a size is a number or left out. They go into the cell's insert
  action. A hint that changes on a cell the list already has, and did not
  move, is an update action by its position with `flush: false`, so the
  cell is not rebuilt; a value sent again unchanged tells the list
  nothing. The attributes are still set on the cell, for Lynx for Web.
  The list's own `sticky` is an ordinary attribute: an empty one goes as
  `true` (L3).
- **Recycling is a later step.** The applier still builds cells eagerly
  and ignores `enqueueComponent`. Reusing cells needs the background to
  rebind a cell to another row, and is to be measured at L4.
- **Found on the way: list props that Lynx reads as numbers or `false`.**
  `span-count`, `sticky-offset` and `experimental-*` are read only as JSON
  numbers or booleans too (`ListContainerImpl::ResolveAttribute`), and a
  Lips attribute is text, so `span-count="2"` is ignored. Cell hints are
  converted here; the list's own props are not yet. Recorded as a
  follow-up, not part of lips#43. *Built in lips#47: "As built, list
  props" below.*
- **Cost.** +233 bytes gzipped on `lynx-main` (2.21 → 2.44; budget
  2.3 → 2.5). A single converter table and a shared action object
  measured 12 bytes larger, so the plainer form stays.
- **Tests.**
  - Tier A, 5 specs in `tests/lynx-binding.spec.ts`, both threads: a
    `list-item full-span sticky-top` and bound sizes reach the insert
    action as booleans and numbers; a cell with none carries none, and
    `"false"` is false; a changed hint on a staying cell is one update by
    its position with `flush: false`, told once; a reorder carries each
    position's current hints whichever cell stays. Thirteen deliberate
    breakages were each caught: hints left out of the insert (twice, two
    code shapes), hints as attribute text, `"false"` read as set (twice),
    sizes not numbers, a size read as a flag, a changed hint not told, an
    update that rebuilds the cell, an unchanged hint told again, an update
    by its old position, hints not set on the cell, a hinted cell never
    cleared.
  - Lynx for Web e2e (21/21): the demo's list has a `full-span sticky-top`
    header. After the list scrolls 200px, the header's top is still the
    list's top, and the first item has moved up. Without `sticky-top` the
    header scrolls away and the check fails.
  - Tier B (29/29): the header is the list's first cell in the real
    engine, with `full-span` and `sticky-top`, in a list whose `sticky` is
    `true`, and the virtualization checks hold around it.
- **Not verified: a sticky header in the native engine.** The issue asked
  for it at tier B, and it could not be shown there. In the headless 4.1
  runtime (macOS arm64), with the fields above in the insert action (read
  in the built main-thread script) and `sticky` set, the header scrolls
  away, in its element box and in the frame's pixels, after a 40px and a
  200px drag. The same runtime also lays out `list-type="flow"` in one
  column. Tried and ruled out: `sticky-offset`, `list-type`,
  `custom-list-name="list-container"`, `experimental-recycle-sticky-item`
  (which also could not arrive as `false`). lynx-stack has no headless
  sticky test to compare with.
- **Device check: not sticky on either platform either** (Lynx Explorer
  4.1.0, iOS Simulator iPhone 17 / iOS 26.2 and Android emulator API
  36.1; kept apart from tier B). Dragged on the device, the demo's header
  scrolls away with its cells, at 26 pt as at 80 pt, also with
  `span-count` and `sticky-offset` sent as numbers and `list-type="single"`
  (a temporary applier change, not kept). **A bundle with no Lips in it**
  (raw Element PAPI: `__CreateList`, `sticky` true, `sticky-offset` 0,
  `span-count` 1, and an `update-list-info` whose header action carries
  `full-span: true` and `sticky-top: true`, at index 0 or 5) **does not
  stick it on iOS or Android either**. So Lips sends what the engine
  documents, and the documented Element PAPI route does not produce a
  sticky cell in Lynx 4.1. Whatever ReactLynx's sticky lists rely on
  beyond it was not found. Recorded as open, with the raw-PAPI probe as
  the reproduction to take upstream.



**As built, list props (2026-11-25, lips#47).**

- **What Lynx reads.** `ListContainerImpl::ResolveAttribute` (Lynx 4.1,
  `core/list/decoupled_list_container_impl.cc`) takes `span-count`,
  `sticky-offset` and the other counts only if `IsNumber()`, and `sticky`
  and the `experimental-*` flags only if `IsBool()`; Clay's list reads
  them as typed values too. Text is dropped without an error, so
  `<list span-count="2">` was one column and `sticky="false"` was nothing.
- **The applier converts a `list`'s attribute text by the prop's name**,
  as it converts cell hints: a flag is set when present unless `"false"`,
  a number is a number, text that is not one goes as written, and a
  removed prop is still removed. Other elements are unchanged, and Lynx
  for Web gets the same text as before.
- **The names are two patterns**, not a table: the numbers end in
  `-count`, `-offset`, `-index`, `-throttle`, `-level` or `-strategy`, or
  are `layout-id`; the flags are `sticky`, `bounces`, `scroll-bar-enable`
  and `enable-*`, `need-*`, `needs-*`, `should-*`, `harmony-*` and
  `experimental-*` (but `-strategy`), read first. They cover every prop
  `@lynx-js/types` 4.2.1 types `number` or `boolean` on `list` and the
  typed ones the engine reads beyond them, 28 names, and no string prop.
  A table of those names measured 0.25 KB larger.
- **Cost.** +0.15 KB gzipped on `lynx-main` (2.44 → 2.59; budget 2.5 →
  2.65).
- **Tests.** Tier A, 2 specs in `tests/lynx-binding.spec.ts`: what the
  applier hands `__SetAttribute` for a list (numbers, flags, `"false"`, a
  string prop, text that is not a number, a bound change, a removal) and
  for the same names on a `list-item` and a `view`; and every one of the
  28 typed names, with 12 string props (and `exposure-id`) left as text.
  The second spec found that `enable-dynamic-span-count` ends in
  `-count`, so flags are read first. Fourteen deliberate breakages were
  each caught: no conversion, a removal converted, every element
  converted, a non-number dropped, numbers or flags left as text, every
  other prop a flag, numbers read first, `-strategy` read as a flag, each
  pattern too wide, a number or a flag name missing, and `"false"` read
  as set.
- **Not verified.** That a two-column list lays out in two columns
  natively (the headless runtime lays out `flow` in one column, and the
  sticky question in "As built, cell hints" is still open).

**As built, event data (2026-11-24, lips#35).**

- **What the engine hands a listener.** Read in the engine source
  (`LepusClosureEventListener::ConvertEventToLepusValue`): a plain callback
  gets the event's own data, with `target` and `currentTarget` as `{ id,
  uid, dataset }`, plus `ref`, the engine event itself. Touch fields
  (`touches`, `changedTouches`) sit on the event, not in `detail`. Android
  sends key events as custom events, with their fields in `detail`.
- **What crosses** is a pick, per kind, made on the main thread:
  - every event: `type`, `detail`, and `target` and `currentTarget` as
    `{ id, dataset }`;
  - a key event: `key`, `repeat`, `altKey`, `ctrlKey`, `metaKey` and
    `shiftKey`, from the event or from its `detail`;
  - a touch event: `touches` and `changedTouches`, each point as
    `{ identifier, x, y, pageX, pageY, clientX, clientY }`.
  It is plain data and never carries `ref`. Forwarding the event whole
  would not clone, and would tie the wire to one engine's event shape.
- **The background** gets a DOM-shaped event: `e.key`, `e.shiftKey`,
  `e.touches[0].clientX`, `e.target.dataset`. What an input reports joins
  its target, beside the dataset: `e.target.value`, as in L3.
- **Tests.**
  - Tier A: the spec's listener shim now hands over what the engine does
    (the event's data, its targets and `ref`). 5 specs: key and modifiers,
    key fields in `detail`, touch points, both datasets, the input value
    beside the dataset, and a wire that clones with no `ref`. Five
    deliberate breakages were each caught, today's `{ type, detail }`
    among them.
  - Tier B: a real hit-tested touch on the swatch reaches the demo's
    handler, which reads `e.touches[0].clientX` and
    `e.currentTarget.dataset.k`. Forwarding `{ type, detail }` only fails
    the check (and the handler throws).
- **Not verified.** Key events at tier B: the runner has no keyboard, and
  the engine's key events do not type (L3). They are checked at tier A,
  and on a device with a hardware keyboard (tier C).

**As built, propagation (2026-11-24, lips#36).**

- **The grammar had room.** The parser reads an attribute name up to its
  `(`, so `on-click.stop( fn )` already parsed as the event `click.stop`.
  Nothing read the suffix: the DOM listened for an event literally named
  `click.stop`. No new syntax, then. A modifier rides in the event name,
  and `Host.listen` gives it one meaning on every host:
  - `.stop`: the event goes no further up once this handler has it;
  - `.capture`: the handler has it on the way down, before its target;
  - `.outside`: the handler runs for the event anywhere except in this
    element, before anything on the way can stop it.
  They combine (`.capture.stop`). The compiler refuses a modifier the
  hosts do not know (`LIPS-C022`, error), which they would drop without a
  word, and warns on one on a component, whose events do not propagate.
- **DOM host.** `.stop` calls `stopPropagation()` before the handler.
  `.capture` passes the capture flag. `.outside` is a capturing listener on
  the page's `document` that skips targets inside the element. It is the
  page's document, not the element's: a node cloned from a skeleton
  belongs to the `<template>`'s inert document until it is placed.
- **Lynx.** Lynx decides propagation where a listener is declared. The
  background spells the binding `tap`, `tap.stop`, `tap.capture` or
  `tap.capture.stop`, and the applier declares it through
  `__AddEventListener`'s `bind_type` (bubble 1, capture 2, capture-catch
  3, bubble-catch 4), with `closure_type` CORE (2), a main-thread function,
  as `main-thread:bind` binds one. That is what the applier's listeners
  are, and it is the form both engines read `bind_type` for: native
  `FiberAddEventListener` and Lynx for Web's `eventTypeOf`. Found on the
  way, in the engine source and then at tier B:
  - a plain callback's options carry no catch on native: only `capture`
    and global are read;
  - `__StopPropagation( e.ref )` from inside the listener exists, and the
    current engine source honours it, but Lynx 4.1's touch path does not:
    a tap stopped that way still reached the row in the real engine.
  `.outside` is a capturing listener on the PAGE, and its handler runs
  only when the event's target is not inside the element. The target is
  known by id: the applier maps Lynx's element ids (`target.uid`) to Lips's
  for every element and raw text, and sends the target's as `t`. Raw text
  too, because Lynx for Web hit-tests to it (an e2e check found this).
  UNLISTEN unbinds with the options it bound with.
- **Tests.**
  - Tier A: each case runs the same template on the DOM host and on Lynx:
    `.stop` keeps an inner tap from the row, `.capture` runs first,
    `.capture.stop` keeps it from the target, `.outside` skips taps inside
    (raw text included) and runs for one a `.stop` hides, and goes with its
    element. Plus UNLISTEN for each kind, and `LIPS-C022`. The listener
    shim reads options as native does (`bind_type` for a CORE closure,
    only `capture` for a plain one). Eighteen deliberate breakages were each
    caught, on both hosts and in the compiler.
  - Lynx for Web e2e (18/18): the demo's `fill` button stops its tap from
    the row while `shuffle`'s reaches it, and the row counts taps outside
    it. Dropping the catch from `bind_type` fails it. The e2e is also what
    found the raw-text target.
  - Tier B (25/25): the same two checks with real hit-tested touches. The
    plain-callback form with `__StopPropagation` failed `.stop` there,
    which is how the 4.1 behaviour was found.
- **Not verified.** `global-bind` is not used. Whether a Lynx `catch`
  also stops the other listeners on the same element at its target is
  the engine's, not Lips's: the DOM does not stop them.

**As built, element references (2026-11-24, lips#37).**

- **The primitive.** `@ref="name"` puts the element on the template's own
  `self.refs` while it lives, under the name it has now (`@ref=state.x`,
  `@ref="row-{i}"` work). It needed no compiler change: an `@` name already
  compiled to a prop bind. The runtime registers the node and takes it off
  when the node is destroyed or renamed. It does the same on the path a
  tag no component claims renders by, which is how Lynx's own elements
  render (`scroll-view`, `list`, `list-item`). Without that, a ref on a
  scroll-view reached `setAttribute('@ref')`.
- **The ref is the host's node.** On the DOM it is the element, so
  `focus`, `scrollTo`, `scrollIntoView` and `animate` are the platform's.
  The Lynx background host gives its nodes the same methods, by the DOM's
  names and arguments, so the core carries no method table. Each is a UI
  method, sent as `INVOKE` and run after the batch's flush, as `setValue`
  is:
  - `focus()`: `focus` on an `input` or `textarea`,
    `requestAccessibilityFocus` elsewhere (§9.9). `blur()`: `blur`.
  - `scrollTo( x, y )` or `scrollTo({ top, left, behavior })`: a
    scroll-view's `scrollTo({ offset, smooth })`, along its one axis.
  - `scrollIntoView( bool | { behavior, block, inline } )`: `scrollIntoView(
    { scrollIntoViewOptions })`, with every option written out, because
    Lynx asks for them explicitly.
  - `animate( keyframes, options | duration )`: `__ElementAnimate( [ START,
    id, keyframes, options ] )`, as ReactLynx's own `Animation` calls it,
    with options in the DOM's names (Lynx's `animate` reads them so). It
    returns `{ id, play, pause, cancel, finish }`.
- **`Host.keepFocus` on Lynx** refocuses, after a swap, the element last
  focused: by a ref's `focus()`, or by a `focus` event a template listens
  for, until its `blur`. That is all the background can know. An input
  focused by touch, with no `focus` listener, is not known.
- **Untrusted templates.** `self.refs` holds the same nodes as
  `self.node`, so it is refused the same way (`LIPS-U005`, at the source).
  A control shows a trusted template reaching `window` through a ref.
- **Tests.**
  - Tier A, 7 specs: focus mapping and after-the-flush order, blur,
    `scrollTo`, `scrollIntoView` and `animate` with their arguments,
    `keepFocus` through a ref and through focus events, and a ref that
    follows its element on both hosts. On the DOM, the ref is the element.
    `tests/untrusted.spec.ts` adds the `self.refs` route with a control
    and a near miss. Thirteen deliberate breakages were each caught.
  - Lynx for Web e2e (19/19) and tier B (27/27): a ref's `focus()`
    focuses the input, and its own `focus` event comes back. On tier B, a
    ref's `scrollTo({ top: 60 })` scrolls the native scroll view. Mapping
    every `focus()` to `requestAccessibilityFocus` fails tier B.
- **Not verified.** That `requestAccessibilityFocus` moves the screen
  reader, and that `animate` plays, are tier C. `keepFocus` is
  hot-swap only and has no tier B check.

**As built, a ref that measures (2026-11-25).**

- **The need.** A popover, a menu or a tooltip places itself from where
  its trigger is (RFC-008 §7). On Lynx a ref's methods ran and nothing
  came back: the applier passed Lynx's callback a no-op.
- **What Lynx has.** `__InvokeUIMethod( el, 'boundingClientRect', {}, cb )`
  calls back `{ code, data: { id, dataset, left, top, right, bottom,
  width, height } }`. The numbers are in dp/pt, the units of Lynx's CSS
  pixels, relative to the LynxView by default, as the DOM's are to the
  viewport. Android answers once layout is done (`LynxBaseUI.
  boundingClientRect` waits for `uiOwnerDidPerformLayout`). `code` 0 is
  success (`LynxUIMethodConstants`).
- **The name is the DOM's.** `getBoundingClientRect()` on the background
  host's node returns a promise of `{ x, y, width, height, top, right,
  bottom, left }`, or `null`. On the DOM the ref is the element, whose
  method returns the box itself; `await` reads both the same, so
  `await this.refs.anchor.getBoundingClientRect()` is one line on both
  hosts. No new method on the DOM side, and the core carries no table.
- **Null, not a throw.** For a node that is no Lynx element (an svg's
  part: there is nothing to ask), and for any answer other than success
  with data. A part that places itself falls back to a default place; an
  error would only make every caller wrap it.
- **A layout-only box has nothing to measure.** Lynx gives a node with
  only layout styles, no attribute and no event no native view
  (`Element::CanBeLayoutOnly`), and answers it `NO_UI_FOR_NODE` (6). "Any
  attribute will cause has_layout_only_props_ = false"
  (`MarkHasLayoutOnlyPropsIfNecessary`), and a node that stops being
  layout-only gets its view at the next flush (`TransitionToNativeView`).
  So the first measure sets `lips-rect` in the same batch, before the
  flush the call runs after. It costs one native view per measured box,
  and only measured boxes pay it; it is sent once (equal writes are not
  sent again).
- **Each call its own.** Calls are numbered; an answer resolves its own
  call and is dropped. A call Lynx never answers leaves one entry behind.
- **Tests.**
  - Tier A, 4 specs: the box mapped to the DOM's shape, after the flush,
    two calls in flight each answered by their own; `lips-rect` set once;
    `null` for code 6 and for success with no data; `null` at once for an
    svg's part, with nothing asked; on the DOM, the platform's own. Nine
    deliberate breakages were each caught (the applier never answering,
    answering the wrong call, call ids reused, the old INVOKE arity, no
    `lips-rect`, the box mapped wrong, an error code read as success, the
    reply not delivered, an svg part asked).
  - Tier B and Lynx for Web e2e: the demo measures a box with only a width
    and a height, so a layout-only one, and shows `Rect: 120×30`.
- **Not verified.** Android and iOS devices (tier C). `relativeTo` and
  `androidEnableTransformProps` are not passed: a transformed box on
  Android measures untransformed.

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
  *As built: one entry per thread, `./lynx/main` and `./lynx/background`;
  `./lynx` was already the build-time pass (below).*

**As built, packaging (2026-11-24, lips#38).**

- **§9.3 decided: subpath entries of `@lipsjs/lips`.** Nothing forced a
  second package. The background host is a `Host` for the core runtime
  and the template pass is the core compiler with a transform, so a
  separate `@lipsjs/lynx` would pin a matching core version in every app
  and release in lockstep anyway. Entries keep one version, one
  changelog and the size ratchet that already covers them.
- **The entries.**

  | Import | Holds | Runs | gz |
  |---|---|---|---|
  | `@lipsjs/lips/lynx` | `compileLynxTemplate`, `lynxVocabulary`, `compileLynxStyle`, `LYNX_PAGE_CONFIG` | build, or the background for templates as data | 17.79 |
  | `@lipsjs/lips/lynx/main` | `connectMain`, `createApplier` | main thread | 2.21 |
  | `@lipsjs/lips/lynx/background` | `connectBackground`, `createBackgroundHost`, `WORDS` | background thread | 4.74 |
  | `@lipsjs/lips/lynx-plugin` | `pluginLips`, `buildSheet` | Node, in the build (`lynx-plugin.mjs`) | — |

  The background renders with `renderIR` from `@lipsjs/lips/runtime`:
  the host holds no IR runtime, so it is bundled once.
- **One runtime entry per thread, not one for both.** Each thread loads
  its own bundle, and the main thread's is on the first frame. An entry
  holding both would make every app rely on its bundler shaking the
  other half out of a prebuilt file.
- **The plugin** is `demos/lynx/lips-styles.ts` moved into `src/lynx/plugin.ts`,
  with two changes:
  - **It imports no Lynx build package.** It finds the template plugin on
    the compiler, where the Lynx build plugin registered it, and sets the
    page config through that class's hooks. The hooks are kept per copy
    of `@lynx-js/template-webpack-plugin`, so an import could bind a copy
    the build never runs, and Lips would need a peer dependency. Without
    a Lynx build plugin it throws, rather than building a bundle with no
    page config.
  - **It adds Lips's `dist/` to what the app compiles** (Rsbuild
    `source.include`). Found at tier B: the published entries are built
    for current engines, the background engine refuses `||=` (`SyntaxError:
    unexpected token in expression: '='`), and an app's build leaves
    `node_modules` as it is. When the demo imported `src/`, the app's own
    target had lowered Lips with the demo's code. Now it lowers the
    published files the same way.
- **The demo imports only published names.** `demos/lynx/pack.sh` builds
  the repository, packs it with `npm pack` (only `files`: `dist/`), and
  installs the tarball without saving it. `run.sh`, `sim.sh` and `e2e.mjs`
  run it first, so every tier builds what an app would install. CI's
  three Lynx jobs install bun for it. `jiti` left the demo: Rspeedy loads
  the plugin as plain JS.
- **Found on the way: `run.sh` passed a bundle that never ran.** A script
  that does not parse is logged as `evaluateJavaScript failed`, not as an
  app error, so the first run printed "no JS errors". It exited non-zero,
  since the first render timed out, but did not say why. It now counts
  that line as an engine error and prints the harness's own error.
- **Tests.**
  - Tier A, `tests/lynx-package.spec.ts` (6 specs): the demo's imports are
    published entries and nothing outside its folder; every export is a
    file the build writes, declared from a source that exists; the
    plugin's sheets, `?raw` IR, failing errors with their location, Lips
    in `source.include` (POSIX and Windows paths), and the page config
    through the registered template plugin, or a throw without one. Ten
    deliberate breakages were each caught: the demo importing `src/` (two
    ways), Lips left out of `source.include`, the page config not set, an
    error not failing the build, no template plugin skipped silently,
    sheets not flattened, an export the build does not write, declarations
    from a source that does not exist, and `?raw` shipping the CSS.
  - Tier B, the whole suite (27/27) on the packed entries, macOS arm64.
    With Lips left out of `source.include`, the bundle does not load and
    `run.sh` fails with the engine's SyntaxError.
- **Not done.** The plugin compiles sheets only. Templates are compiled
  at run time (templates as data, as the demo does) or ahead of time with
  `precompile` from `@lipsjs/lips/precompile`; a loader for `.lips` files
  waits for an app that needs one.

### 4.8 Accessibility

One template source keeps its screen-reader semantics on Lynx. ARIA is the
source language. The background host reads it and sends Lynx's own
attributes (§3.8). It is not passed on as written, because Lynx would drop
it without an error.

**Where it runs.** Mostly in the background host, because the values are
bound and several ARIA attributes become one Lynx attribute. Each element
with ARIA keeps a record. At each flush where text, structure or ARIA
changed, every record is derived again, and only what differs from what
was sent goes out as `ATTR` ops. The protocol and the applier are
unchanged. The vocabulary pass reports what has no Lynx equivalent.

| Template | Lynx | Notes |
|---|---|---|
| `role`, and the roles of `button`, `a`, `h1`–`h6` | `accessibility-traits`, `-element`, and `-heading` for headings | One trait word per element: Android and HarmonyOS read the whole string as one word, and `button,selected` would read as none. |
| `checkbox`, `switch`, `menuitemcheckbox`, `progressbar` | `-role-description` set to Android's class name | Android speaks the class in the user's language. |
| `radio`, `tab`, `menuitemradio` | `-role-description` from a word | Android only (§3.8). |
| `none`, `presentation`, `alt=""` | `accessibility-element: false` | |
| `aria-label`, `alt` | `accessibility-label` | |
| `aria-labelledby`, `<label for>` | `accessibility-label`: the text of those ids | Resolved in the background, at run time, and kept current. The background keeps an id map; ids resolve in the same host. |
| `aria-describedby` | appended to the label, after `", "` | Lynx has no description or hint (§9.7). |
| button, link and heading roles on a `view`, with no label | `accessibility-label`: the content's text | iOS would read nothing otherwise (§3.8). A part's own `aria-label` or `alt` stands in for its text. `aria-hidden` parts are left out. |
| `aria-checked`, `-pressed`, `-selected`, `-expanded`, `-current`, `-disabled`, `-invalid`, `-required`, `-valuetext`, `-valuenow` | `accessibility-value`, as words joined by `", "` | `"false"` reads `not checked` and `collapsed` where ARIA has a word for it, and nothing elsewhere. `"mixed"` reads `mixed`. Empty is ARIA's "not set"; a bound boolean arrives as `"true"`/`"false"` (§9.6, decided). |
| `aria-roledescription` | `accessibility-role-description` | |
| `aria-hidden="true"` | `accessibility-elements-hidden` | The whole subtree, as in ARIA. `accessibility-element: false` would leave the children reachable. |
| `aria-modal="true"` | `accessibility-exclusive-focus` | |
| `aria-live`, `role=status`, `log`, `alert` | `lynx.accessibilityAnnounce` with the region's whole text | A region announces a change of its text. An alert also announces its arrival, but not when present at first render. `aria-live="off"` is silent. |
| `tabindex` | `focusable`: true at 0 or more, false below | This is keyboard focus (Android, Clay). Screen-reader order is the tree's. |

**Words.** States, and the roles that have no Android class, are spoken
words. They are the same on every platform. `WORDS` holds the English
defaults, and `connectBackground( words )` replaces them to translate
(§9.5).

**Diagnostics** (vocabulary pass, literal values only; a bound value Lynx
cannot read is ignored at run time):

| Code | Severity | What |
|---|---|---|
| LIPS-L105 | warning | a `role` with no Lynx equivalent (`tablist`, `listbox`, `table`, `row`, `grid`, `dialog`, …): the content stays readable, the grouping is not announced |
| LIPS-L106 | warning | an `aria-*` attribute with no Lynx equivalent (`aria-controls`, `aria-level`, `aria-setsize`, `aria-relevant`, `aria-atomic="false"`, …) |
| LIPS-L107 | warning | a positive `tabindex`: Lynx has no focus order |

A component's attributes are its props, so they are not checked. A role
list takes its first token, as ARIA does with the first role it knows.

**As built (2026-11-23).**

- `src/lynx/a11y.ts` holds the tables (`ROLES`, `LIVE`, `IMPLICIT`, `WORDS`,
  `A11Y`) and `lynxA11y`, the derivation. `src/lynx/background.ts`:
  - keeps the records and the id and `for` maps, and derives once per
    flush;
  - takes `{ announce, words }`; `connectBackground` wires `announce` to
    `lynx.accessibilityAnnounce`, which is absent on Lynx for Web and is
    skipped there.
- `src/lynx/template.ts`: LIPS-L105 to L107.
- **The core cost is nothing.** `src/ir` is untouched, and no budgeted
  bundle holds `src/lynx/`.
- **Found on the way.**
  - A change that is only ARIA emits no op of its own, so it must
    schedule the flush itself.
  - A descendant's `aria-hidden` or `aria-label` changes its ancestors'
    names, so any ARIA change derives every record again.
  - "After the first render" cannot be read from the batch counter: a
    first render of only `<if>` anchors sends nothing.
- **Tests.**
  - Tier A, `tests/lynx-binding.spec.ts` (8 specs, both threads where
    the main thread is the point):
    - buttons, links and headings;
    - a tab with roving tabindex;
    - checkbox states in words;
    - `labelledby`, `describedby` and `<label for>` in either order,
      following bound text;
    - hidden, modal, decorative and presentational;
    - status and alert announcements;
    - translated words.
  - Tier A, `tests/lynx-template.spec.ts` (2 specs): every code, with its
    location and with no false alarms.
  - Eleven deliberate breakages were each caught:
    - no name from content;
    - a text change not read again;
    - an ARIA change not scheduled;
    - alerts never announcing their arrival;
    - alerts announcing at first render;
    - hidden content named;
    - `<label for>` written after its input;
    - no word for `"false"`;
    - the whole role list taken as one role;
    - `aria-atomic="true"` warned;
    - ARIA passed on as written.
  - Tier B: `run.sh` adds one check. The demo's `<button>` reaches the
    real engine's element with `accessibility-traits="button"` and
    `accessibility-label="+1"`. 21/21 pass on Lynx 4.1 Clay (macOS arm64),
    with no JS errors. With the tag's implied role switched off, the check
    fails.
  - What VoiceOver and TalkBack say, and announcements, are tier C.
- **Not done.**
  - Focus moves: built with element references (§4.5, "As built, element
    references"; §9.9).
  - HTML's `disabled` on a `button` is not mapped. Lynx does not block
    the tap either. *Built in lips#41, below.*

**As built, disabled buttons (2026-11-24, lips#41).**

- **What HTML does.** A disabled control gets no click: none is
  dispatched, so neither its handlers nor its ancestors' run. Other
  events (a touch) still reach it. Lynx has no disabled `view`, and taps
  a `view` whatever its attributes.
- **The background host reads `disabled` on a `<button>`** (the tag, whose
  implied role is button) as it reads ARIA, and never sends it:
  - **Taps.** `receive` drops a `tap` whose target, or failing that its
    listening element, is inside a disabled button. Every listener, the
    button's own, one above it and a `.outside` one, gets none. The
    engine still forwards it: the main thread does not know the state,
    and the protocol stays as it was. Other events pass.
  - **The state** goes out as `aria-disabled` does, in
    `accessibility-value` (`disabled`, in `WORDS`). `disabled` wins over
    `aria-disabled="false"`, as in HTML.
  - Enabled again, both come back at the next flush.
  - `disabled` elsewhere (on an `input`, which Lynx reads) is sent as
    before.
- **Cost.** +63 bytes gzipped on `lynx-background` (4.74 → 4.80). No core
  change.
- **Tests.**
  - Tier A, 4 specs, both threads: a tap on the button, on its label and
    on its raw text reaches none of three handlers, while another button
    in the same row works and a touch still reaches the disabled one; the
    state, and `disabled` over `aria-disabled="false"`; enabled and
    disabled again; a present attribute, and an input's own `disabled`.
    Nine deliberate breakages were each caught: the tap forwarded
    regardless, only the button's own listener checked, a tap inside it
    not checked, `disabled` sent as an attribute, the state not sent,
    `aria-disabled="false"` winning, `disabled` taken from every element,
    enabling not restoring, and every event dropped, not only taps.
  - Tier B: the demo's `#off` button, wired to the counter, gets a
    hit-tested touch and a tap; the count does not move and the engine's
    element reads `accessibility-value="disabled"` with no `disabled`
    attribute. Forwarding the tap regardless fails it.
  - **Device check** (Lynx Explorer 4.1.0, the demo from the dev server;
    kept apart from tier B): on the iOS Simulator (iPhone 17, iOS 26.2)
    and on the Android emulator (API 36.1, arm64), two taps on `#off`
    left `Count: 0` and `Outside: 0`, and one on `+1` gave `Count: 1` and
    `Outside: 1`. So the engines' own taps are dropped for the button's
    handler and for the page-level `.outside` one alike.
- **Not verified.** What a screen reader says for it is tier C.

**As built, Android's accessibility path (2026-11-25, lips#44).**

- **`LYNX_PAGE_CONFIG` sets `enableA11y: true`**, so `pluginLips` encodes
  it into every bundle (§9.4 decided). An app whose own page config sets
  `enableA11y` keeps its value: the plugin writes the CSS flags over the
  app's, since the pipeline needs them, but not this one.
- **Device check** (Android emulator, API 36.1 arm64, Lynx Explorer
  4.1.0, TalkBack 16.0; kept apart from tier B). The demo built twice
  from one source, with the flag forced on and off, each loaded from a
  local server; TalkBack on, then `uiautomator dump` (without a running
  accessibility service the dump has none of Lynx's virtual nodes):

  | | Flag off (default path) | Flag on (helper path) |
  |---|---|---|
  | A `<button>` (`#inc`, `#off`, …) | `com.lynx.tasm.behavior.ui.LynxFlattenUI` | `android.widget.Button` |
  | Its label's `text` | `com.lynx.tasm.behavior.ui.text.FlattenUIText` | `android.view.View` |
  | A `p` | `…text.FlattenUIText` | `android.view.View` |
  | Name (`content-desc`) | `+1`, `off`, … | the same |
  | The input | `android.widget.EditText` | the same |

  TalkBack takes the spoken role from the class: `android.widget.Button`
  is read with "button", and Lynx's own classes with none. So the flag is
  what makes a button a button on Android.
- **Not verified on the device.**
  - The spoken words themselves: the image's Google TTS engine crashes
    (native fault in `libgoogle_speech_sbg_tts_jni.so`), and without root
    TalkBack's focus cannot be moved by injected input, which activates
    instead of exploring. The class is the input TalkBack speaks from.
  - Role descriptions (`accessibility-role-description`) and the
    `disabled` value: `uiautomator` does not show them, and the demo has
    no checkbox or switch.
  - Both paths expose a button and its label's text as two nodes, so
    TalkBack stops twice per button. Lips could hide the label from the
    tree under a named button; not done here.
- **Tests.**
  - Tier A: `tests/lynx-style.spec.ts` (the config) and
    `tests/lynx-package.spec.ts` (the plugin writes it into the encoded
    config, and keeps an app's own value but not an app's CSS flags).
    Five deliberate breakages were each caught: the flag `false`, the
    flag left out, the plugin dropping it, the app's value overwritten,
    and every app value kept.
  - Tier B: `run.sh` reads the encoded bundle and finds
    `"enableA11y":true` in it (the off build has none).

## 5. Engine APIs: allowed and refused

**Allowed** (public types and official guidance): page/view/text/raw-text/
image/scroll-view/list creation; `__AppendElement`, `__InsertElementBefore`,
`__RemoveElement`, `__ReplaceElements`; `__SetAttribute`, `__SetClasses`,
`__AddClass`, `__SetInlineStyles`, `__SetID`, `__SetDataset`;
`__AddEventListener` and `__RemoveEventListener`; `__InvokeUIMethod`;
`__ElementAnimate` (as Lynx's own `Animation` calls it);
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
- **L3 — Inputs, scroll, list, vocabulary diagnostics.** Exit: an input,
  a scroll view and a virtualized list work in the real engine at tier B,
  and text the engine would drop is wrapped or reported.
- **L4 — Decision gate.** One real screen built in both ReactLynx and Lips.
  Measure, on a device (tier C):
  - first-frame time;
  - state-change-to-frame latency;
  - CPU per thread;
  - size of the updates sent between threads;
  - memory.

  Then push a changed template into the running app without a rebuild. Go or
  no-go is recorded here.

  **Emulator half (2026-11-25, lips#39; relative only, no go/no-go).**
  `demos/lynx-gate`: the same screen in Lips and in ReactLynx 0.129.4, a
  counter and 100 keyed rows, 20 state changes 400 ms apart, each
  bumping the counter and relabelling every tenth row. Lynx Explorer
  4.1.0 on the Android emulator (API 36.1, arm64, on an Apple Silicon
  Mac). Three runs each; the byte counts were the same in every run:

  | | Lips | ReactLynx |
  |---|---|---|
  | First render crossing the threads (JSON bytes) | 9,348 | 43 |
  | One state change (JSON bytes, median) | 1,525 | 284 |
  | Step start → main-thread flush (median, three runs) | 3 · 26 · 11 ms | 3 · 15 · 9 ms |
  | Background (`Lynx_JS`) CPU over the 20 steps | 2 · 11 · 7 ticks | 2 · 11 · 6 ticks |
  | PSS after the run | 86–99 MB | 79–90 MB |
  | Bundle | 103.7 KB | 96.4 KB |

  - **What crosses.** ReactLynx renders its first screen on the main
    thread, so only a 43-byte marker crosses; Lips builds it on the
    background thread and sends every element (L6's instant first frame
    is the answer to that). **Per state change Lips sends 5.4× more**,
    and the cause is found: the rows are new objects, so every row's
    text binding runs again, and the background host sends `SET_TEXT`
    for all 100 rows, 89 of them unchanged. ReactLynx's diff sends the
    11 that changed. Skipping text equal to what was last sent would
    bring Lips to about the same size; a follow-up, not done here.
  - **Latency and CPU are the same within the emulator's noise.** The
    medians move by 3× between runs of the same build, the CPU over
    the steps is a handful of 10 ms ticks for both, and the main-thread
    (TASM) script never reaches one tick.
  - **Memory overlaps.** Lips's range sits about 7 MB higher; one PSS
    reading per run on an emulator cannot separate that from noise.
  - **The template push holds.** After the run, Lips fetches a changed
    template (177 bytes) from the dev server, compiles it on the device
    and swaps it into the live instance (`inst.swap`): the screen shows
    the new text with the state kept (`Pushed · Count: 20`), no
    rebuild, no reload. ReactLynx compiles JSX at build time, so the
    same change needs a rebuild and a hot reload.
  - **Not measured:** first-frame time (the two apps do different work
    before it, and the emulator's numbers would not transfer), and
    anything absolute. The go/no-go needs a named mid-range phone, with
    the same screens and `measure.sh`.
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
2. ~~**Raw text outside text elements:** always an error, or auto-wrap when the
   wrapper is unambiguous.~~ **Decided 2026-10-16: auto-wrap the
   unambiguous case.**
   - Unambiguous: all of the element's content is inline (text, binds,
     text-like tags, control flow around them), so one `text` holds it as
     the browser would lay it out.
   - Anything else is an error (LIPS-L102), because one text or several
     would lay out differently.
3. ~~**Packaging:** subpath entries of `@lipsjs/lips`, or a separate
   `@lipsjs/lynx` package.~~ **Decided 2026-11-24: subpath entries**
   (lips#38, §4.7 "As built, packaging").
   - Nothing forced a separate package: the hosts are hosts for the core
     runtime, and the template pass is the core compiler, so a second
     package would release in lockstep with a pinned core anyway.
   - `./lynx` (build-time pass), `./lynx/main`, `./lynx/background` (one
     runtime entry per thread, each with its budget) and `./lynx-plugin`.
   - Cost: an app on Lynx installs the DOM entries too. They are files in
     the package, not code in its bundles.
4. ~~**Android's accessibility path (§3.8, §4.8).** Should `LYNX_PAGE_CONFIG`
   set `enableA11y: true`?~~ **Decided 2026-11-25: set it** (lips#44, §4.8
   "As built, Android's accessibility path").
   - Without it, Android reads labels, hidden subtrees, values and headings,
     but no traits or role descriptions: a button is not called a button.
   - With it, Android switches to the helper path for the whole page. An
     app that wants the default path sets `enableA11y: false` in its own
     page config.
5. **States: words, or iOS's own traits.**
   - As built: words in `accessibility-value`, the same on every
     platform, translated through `connectBackground( words )`.
   - The alternative is the `selected` and `disabled` traits on iOS, which
     iOS speaks in the user's language. That needs a `SystemInfo.platform`
     branch, and words would still be needed on Android.
   - Also open: whether `WORDS` should come from the app's i18n catalog
     (`design/i18n-context.md`) instead of an argument.
6. ~~**Boolean binds on `aria-*` (core runtime, affects the DOM too).**~~
   **Decided 2026-11-24: written out** (lips#40).
   - `applyAttr` wrote `true` as `""` (presence) and `false` as removed.
     ARIA reads `aria-checked=""` as unset, so `aria-selected=state.on`
     never read as selected, on the DOM or on Lynx.
   - Now a bound boolean on a name starting `aria-` is `String( v )`:
     `"true"` or `"false"`. `null` and `undefined` still remove it. Every
     other attribute keeps HTML's presence. Spreads follow the same rule.
   - **It changes DOM output**: `aria-selected={false}` was no attribute and
     is now `aria-selected="false"`, which ARIA reads as "not selected",
     where it read "not set" before. An app that wrote the strings itself
     (`on ? 'true' : 'false'`) sees no change.
   - The Lynx host needed nothing: it already followed ARIA, so a bound
     `true` now reads as the state's word where it read as nothing.
   - Cost: +14 bytes gzipped on `runtime`, +10 on `full`.
   - Tier A: two DOM specs (`tests/ir-runtime.spec.ts`: bound attributes,
     and spreads) and the Lynx checkbox spec. Seven deliberate breakages
     were each caught: the presence rule back, `true` or `false` alone left
     as presence, `null` written as `"null"`, the rule on the wrong prefix,
     on too wide a prefix (`a`, which `autoplay` caught), and a spread that
     skips it. `aria` without the dash survived, and is equivalent: no
     attribute starts `aria` but `aria-*`.
7. **`aria-describedby`.** As built, it is appended to the label. The
   alternatives are an L106 warning and drop, or HarmonyOS's untyped
   `accessibility-description`.
8. **Warning volume.** L105 and L106 fire once per occurrence, so a tab set
   gives one `aria-controls` warning per tab. Keep that, or add one summary
   per template or a way to opt out.
9. **Focus moves.** Built (lips#37): a ref's `focus()` is `focus` on an
   input or textarea and `requestAccessibilityFocus` elsewhere, and
   `Host.keepFocus` refocuses the same way (§4.5, "As built, element
   references").

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
- Accessibility (§3.8), read on 2026-11-23:
  - `lynx-family/lynx` @ `02e1c8d`:
    - `platform/darwin/ios/lynx/ui/LynxUI.m`, `LynxUI+Accessibility.m`,
      `LynxUIView.m`, `text/LynxUIText.m`
    - `platform/darwin/common/lynx/base/LynxConverter+UI.m`
      (`toAccessibilityTraits`)
    - `platform/darwin/ios/lynx/module/LynxAccessibilityModule.mm`,
      `LynxTemplateRenderHelper.mm`
    - `platform/android/lynx_android/src/main/java/com/lynx/tasm/behavior/`:
      `PropsConstants.java`, `ui/LynxBaseUI.java`, `ui/LynxUI.java`,
      `ui/view/UIView.java`, and in `ui/accessibility/`:
      `LynxAccessibilityHelper.java`, `CustomAccessibilityDelegateCompat.java`,
      `LynxNodeProvider.java`, `LynxAccessibilityWrapper.java`
    - `platform/android/lynx_android/src/main/java/com/lynx/jsbridge/LynxAccessibilityModule.java`,
      `com/lynx/tasm/LynxHostEnvironment.java`
    - `platform/harmony/lynx_harmony/src/main/cpp/ui/ui_base.cc`
    - `core/template_bundle/template_codec/binary_decoder/lynx_config.yml`
      (page config defaults)
    - `js_libraries/lynx-core/src/lynx/lynx.ts` (`accessibilityAnnounce`)
  - `lynx-family/lynx-website` @ `619cc8e`:
    `docs/en/guide/inclusion/accessibility.mdx`,
    `docs/en/api/elements/built-in/view.mdx`,
    `docs/en/api/lynx-api/lynx/lynx-accessibility-announce.mdx`
  - `@lynx-js/types@4.2.1`: `types/common/props.d.ts`,
    `element/methods.d.ts`, `events.d.ts`
- npm packages:
  - `@lynx-js/type-element-api@0.0.10`
  - `@lynx-js/lynx-api-docs@0.3.9`
  - `@lynx-js/skill-vanilla-lynx@0.2.0`
  - `@lynx-js/tasm@0.0.53` (ships `build/linux/Release/lepus.node`)
