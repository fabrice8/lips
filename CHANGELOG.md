# Changelog

All notable changes to `@lipsjs/lips` are documented here.
Format: [Keep a Changelog](https://keepachangelog.com) · Versioning: [SemVer](https://semver.org).

## [Unreleased]

### Added — parts in a build that ships no compiler (RFC-008 §4)

- **`precompilePlugins( plugins )`** (`@lipsjs/lips/precompile`): `use()`'s
  counterpart for an app that runs `@lipsjs/lips/runtime` alone, under a
  content security policy with no `unsafe-eval`. It compiles each
  component of each plugin, and of what it requires, as `use()` installs
  them, into plain JSON by component name, which a build writes beside its
  own templates' IR. Refused as `use()` refuses: another plugin of the
  same name, a component name something else holds.
- **`precompiled`** (a Lips option): that JSON, given to the page's Lips.
  `use()` registers each component of a plugin with the IR made for its
  name; a component with none is registered as it is. The walk is the one
  `lynxComponents()` uses, now shared (`src/plugins.ts`).

### Added — the combobox as a form's field

- `popover-combobox` takes `id` (the field's own, for a `<label for>` and
  for the app to focus it), `labelledby` (the app's label, for the field
  and its list, in place of `label`), `describedby`, `required` and
  `invalid`, each said with its ARIA attribute.

### Changed

- Text typed in a combobox and left by Escape or Tab goes back to the
  chosen option's label (empty where none is chosen). It used to stay in
  the field, as though chosen.

## [0.5.0] — 2026-11-25

Every part RFC-008 plans, at `@lipsjs/lips/parts`: the layer taken out of
the popover, dialog, toasts, icons, a blurred backdrop, combobox, a region
that folds, virtual list and grid, and date picker, each a plugin for the
DOM and Lynx. A component may carry `lynx` source where its markup differs
by host, and `lynxComponents()` compiles plugins for Lynx as `lips.use()`
installs them. Fixed on the way: setting an input's value on Lynx misread
the rest of its batch, and `this.refs` was missing where a template named
no `@ref`. Nothing breaks.

### Added — dialog, toasts, icons and a blurred backdrop (RFC-008)

Four more parts at `@lipsjs/lips/parts`, each a plugin, one template for
the DOM and Lynx:

- **`layer`**: what floats, taken out of the popover now that a dialog
  shares it. `page-layer` is one fixed element over the page, a backdrop
  that takes a tap outside whole, Escape, and `live` once it is laid out,
  for what sits in it to measure. `center` centres what it holds.
- **`backdrop-blur`**: what is behind it, blurred: `backdrop-filter` on
  the web, Lynx's `blur-view` on Lynx, each host drawing what it knows.
  A layer takes one with `blur` (px), `effect` (iOS's material) and
  `backdrop` (its class).
- **`dialog`**: `popover-dialog` and `dialog-title`, on the popover's
  controller (its `open`, its id, its trigger). A centred panel,
  `role="dialog"` or the app's, `aria-modal`, labelled by its title or
  `label`, focused, and `placed` for the app to move focus on. On the
  web the rest of the page is `inert` and Tab goes round inside; on Lynx
  `aria-modal` keeps a screen reader inside. However it closes (Escape,
  the backdrop, the app's own `open`), the page is given back and focus
  goes back to the trigger.
- **`toast`**: `toast-region`, a live region always drawn (`status`, or
  `alert`), over the app's queue of `{ id, text, action?, duration? }`.
  A toast asks to go (`dismiss`) after its time, held while the pointer
  or the focus is on it; one with an action never leaves by itself (WCAG
  2.2.1) and says `act`.
- **`icons( set )`**: an icon set as data (paths, box, a stroke width for
  a line icon), drawn as inline svg with its colour bound into the
  markup. Hidden from a screen reader unless labelled; labelled, it names
  the button it is in, on both hosts. One set per Lips.

### Added — combobox, and a region that reveals and folds (RFC-008)

- **`combobox`**: `popover-combobox`, a text field that is a popover's
  trigger, over options as data `{ id, label, disabled? }`. What is typed
  is its own: it finds the options that `match` (`contains` by default)
  and says `query`, for an app that finds them itself; `value` is the
  app's, and a choice comes back as `change`. Focus stays in the field,
  which names the active option (`aria-activedescendant`); arrows open
  and move past disabled options, Enter chooses, Escape and Tab close.
  On Lynx the person types and taps, and each option is a button.
- **`reveal`**: `reveal-region`, the content a popover's trigger shows in
  the page's flow, not in a layer. Folded, it renders nothing, or with
  `keep` stays rendered and hidden, so what was typed in it stays.

### Added — virtual list and grid, and date picker (RFC-008)

- **`virtualList`**: `virtual-list`, a long list of rows of one size, of
  which only what is in view and an overscan is drawn on the web, each
  row placed where it falls; `columns` puts that many items in a row. As
  a `grid` or `table` of one column, it says how many rows it has and
  each row which it is. On Lynx it is Lynx's own `list`, which recycles
  its cells, `size` the estimate and `columns` the `span-count`.
- **`datePicker`**: `date-grid`, a month as a grid of ISO days, and
  `popover-date`, the grid in a popover's layer. The grid keeps focus and
  names the active day; arrows, Home and End, Page Up and Down (with
  Shift, a year) and Enter as WAI-ARIA's date picker. `min`, `max` and a
  `disabled` policy refuse days. Names of months and days, the title, a
  day's full name and the week's first day come from `Intl` in the
  reader's language where it formats dates, else from the app's `words`,
  else English. On Lynx each day is a button.

### Added — a component's markup for Lynx, and plugins compiled for Lynx

- A component may carry `lynx` source beside `default`, for a part whose
  markup differs by host (the virtual list is Lynx's `list` there). Left
  out, `default` serves both.
- `lynxComponents( plugins )` (`./lynx`) compiles plugins for Lynx, and
  what they require, as `lips.use()` installs them on the web, choosing
  `lynx` source where there is one; for `renderIR`'s `components`. It
  refuses what `use()` refuses, and what Lynx cannot take: `install()`,
  a `stylesheet`, precompiled `ir`.

### Fixed — `this.refs` is there from the start

A component whose template named no `@ref` had no `refs`, so a handler
reading `this.refs.x`, as the types promise it can, threw. Every
component has `refs` now.

### Fixed — Lynx: setting an input's value misread the rest of its batch

An input's value set after its first render is sent as `setValue`, a UI
method, and was sent one value short of what an invoke is. Every op after
it in the same batch was read one place off: a branch closed beside it
removed the wrong elements, or none. It goes through the same path as
every other UI method now.

### Fixed — a Lynx spec answered a UI method by the next spec's rule

The Lynx specs' engine stand-in read the answer to a UI method when it
answered, not when it was asked, so a measure still on its way when one
spec ended was answered by the next spec's rule, or by none.

## [0.4.0] — 2026-11-25

Headless parts (`@lipsjs/lips/parts`: popover and menu) and plugins
(`lips.use`); a component's types inferred where it is written; the IR
engine held to what the docs say, after an audit of every surface and the
parity fixes the parts needed; and the Lynx binding's gaps closed, but for
the L4 run on a phone (lips#39). Breaking before 1.0, hence the minor
version:

- a member chain, in both execution modes, ends at `?.` and throws on `.`
  of nothing, as in JS: interpreted mode read `state.u.name` as `undefined`
  when `u` was null;
- a boolean bound on `aria-*` is written out;
- `LYNX_PAGE_CONFIG` turns on Android's `enableA11y`;
- the component types are renamed and inferred (`Metavars` and its
  kin are gone), and the `context` template field, replaced by
  `watchContext` in 0.3.0, is removed.

### Changed — a component's types are inferred (breaking)

Typing a component took four positional type arguments, `Metavars<Input,
State, Static, Context>`, written apart from the values they described;
`render()` could not read them back, and `this` in a handler read any
sibling, real or not, as `any`. At runtime only the removed `context`
field changes.

- **`register`, `render` and `root` infer a component written in the
  call**: `state` and `static` from their values, each handler from
  itself, and `this` in every handler from all three, with no annotation
  and no wrapper. A sibling handler it does not have, a state key, or a
  handler named after a member of the component (`emit`, `state`…, which
  `register()` refuses) is a type error. Such an object's `state` was
  `any`; it is now what its values say, so code that writes a key the
  component never declared stops compiling.
- **The handle is typed**: `render()` and `root()` return the component's
  `state`, and `render()` reads `input` from what it is handed.
- **A component written apart** is typed where it is written, since its
  handlers' `this` is fixed there: by `Handlers<Shape<{ … }>>` on its
  handler, or by wrapping it in `component( … )`, which infers it as the
  calls do (`component<{ input: Props }>()({ … })` names what no value
  shows). `component()` and `precompile()` return a `TypedComponent`,
  whose shape `render()` reads back, `input` included.
- **`SharedContext`** is the app's context, typed once by augmenting it,
  for every component and for `new Lips()`. `setContext( key, value )`
  checks the value against the key.
- **Names that say what each type is**, the old ones removed:

  | Was | Now |
  |---|---|
  | `Template<MT>` | `Component<S>`, what `register` and `render` take |
  | `Component<MT>`, the rendered handle | `Rendered<S>` |
  | `Metavars<I, S, St, C>` | `Shape<{ input, state, static, context }>`, by name |
  | `Handler<MT>` | `Handlers<S>` |
  | `ComponentSelf<MT>` | `Self<S, Methods>` |
  | `LifecycleEvents<MT>`, `LifeCycleEventTypes` | `Hooks`, `HookName` |
  | `PrecompiledTemplate` | `PrecompiledComponent<S>` |
  | — | `TypedComponent<S>`, a component whose shape is known |

  `Component` now names the definition: an annotation that meant the
  handle fails to compile, rather than meaning something else silently.
- **The `context` template field is removed.** `watchContext` replaced it
  (it never declared what a component reads); the runtime no longer reads
  the old name, and the `.lips` plugin no longer exports it.

### Fixed — an audit of every surface against what the docs say

Each item below was a documented behaviour Lips did not have, found by a
test that states the claim. Each fix ships with its test and a mutation that
test catches.

- **One error boundary over everything a template evaluates.** Only text and
  attribute binds were inside it: a throw in an `<if>` condition, a `<for>`
  source, a `<switch>` head, an awaited value, a dynamic tag, a component
  input, a macro argument, a `<let>`, a `<context>` key or a `<log>` took
  the whole render down. Now each reaches the component's `onError` (or the
  console), and the rest renders; a branch that threw shows once what it
  reads is there.
- **A handler that throws, or whose promise rejects, reaches `onError`**,
  as the docs said; it reached the host's event loop. A child's event runs
  the parent's handler inside the parent's boundary.
- **`onUpdate` and `onRender` follow every change the template shows**: a
  branch shown, a row added, a case switched, an input passed down. They
  ran only when a text or attribute bind re-ran (the legacy engine ran them
  on any update).
- **What an awaited expression throws is the `<catch>` arm's error**, as
  `await` has it.
- **`input` and `static` are always objects**, as the legacy engine had
  them: a root rendered with no input crashed on `{input.title ?? '…'}`,
  and a handler could not keep `this.static.x` without a declared `static`.
- **`onInput` runs again when a spread brings a key the input did not
  have.** A top-level reactive store now has a key-set channel, as nested
  objects do, so `Object.keys( store )` follows keys added and deleted.
- **`value=`, `checked=` and `selected=` write the element's property**, not
  only the attribute: once the reader typed, `state.query = ''` changed
  nothing on screen, and `<select value=…>` / `<textarea value=…>` took no
  value at all. A `value` bind runs after its block's children, so a
  `<select>` has the options a `<for>` renders. **DOM output**: the property
  follows the bind.
- **`@text`, `@html` and `@format` on a tag no component claims** (Lynx's
  `scroll-view`, any custom tag) write its content; the attribute name threw.
- **A bare handler name is the component's handler**: `on-click(open)` ran
  `window.open` in compiled mode and the handler in interpreted mode.
  `open`, `close`, `print`, `focus`, `scroll`, `stop`… all hit it. A name a
  template variable holds is still that variable.
- **The two execution modes mean what JS means.** Compiled mode
  parenthesized each link of a member chain, so `state.u?.p.name` threw when
  `u` was null; interpreted mode read `state.u.name` as `undefined` where JS
  throws. Both now end a chain at `?.` and throw on `.` of nothing.
- **A template placed by value with no `name` has a scope of its own.** Every
  such template shared `dynamic`: two live at once shared one `<style>`, and
  the second one's CSS never injected.
- **`register()` refuses a reserved handler name**, as documented; it threw
  at the first render.
- **`<router global>`**: the first navigation replaces the entry the page
  loaded on (it pushed a duplicate, which left Back on the same page), and a
  destroyed router removes its `popstate` listener and its `window.navigate`.
- **Character references**: every numeric one decodes (`&#169;`, `&#x2014;`);
  only six named ones did, and `&#169;` reached the page as text. A named
  reference outside HTML's five and `&nbsp;` is now LIPS-P013 and stays as
  written.
- **`<for>` attributes are values**: `in="{state.items}"` (a lone slot) is
  the value, as on a component. It was dropped, and the loop rendered a
  range of one, a single row reading `0`. Any other quoted form of `in`,
  `from`, `to` or `by` is LIPS-C004.
- **The `.lips` plugin inlines `const macros`** (a macro there never
  expanded) and exports `const watchContext`.
- **Types**: a component has `name`; `precompile()` returns the component
  it was given (`static`, `watchContext`, `name` included), typed.

### Added — what a template wrote and nothing said

- `LIPS-C023`: an `on-*` on a macro call site (there is no element for the
  listener). `LIPS-C024`: content inside a macro call (a macro has no place
  for it). Both were dropped without a word.
- `LIPS-P013` (warning): a named character reference Lips does not decode.
- `tests/diagnostics.spec.ts` triggers every template diagnostic by the
  smallest source that makes it, and fails when a code in `src/` has no
  test (21 had none).
- [`docs/reference.md`](docs/reference.md): every part of Lips, when to use
  it and when not, with an example `tests/reference.spec.ts` runs.
- `tests/demo-render.spec.ts` renders `demos/app` and clicks through every
  page. It found the reactivity page's "Re-seed both to 5" re-seeding one
  counter. `demos/app` gains `/parts`: a menu from `lips.use()`, `@ref`, a
  field state resets, `.stop`, `onError`.

### Fixed — what the IR engine had dropped from the legacy one

- **Each instance has its own `state` and `static`.** Both were the
  template's own objects, shared by every instance and written by each:
  two instances pushing into a declared list pushed into one array, the
  template's. Each instance now starts from a deep copy of what its
  template declares (plain objects, arrays, `Map`, `Set`, `Date`, `RegExp`,
  typed arrays; a getter stays a getter). A class instance, a function or a
  promise is kept as given, not copied.
- **`onInput` runs again each time an input changes**, once a turn however
  many changed, with the input, as it did before the IR engine (it ran at
  creation only). A component's own state is not its input.
- **Slot content takes context and language where it is placed.** Its
  expressions still close over where it was written (the parent's state,
  handlers and scope); its `context` and `self.lang` are the place's, as a
  component's are. A component that provides context around what it places
  now reaches the content it was given (RFC-005 §4.4).
- **`onAttach` runs for a component a branch renders after mount**: an
  `<if>` turning true, a row added, a slot under one. Such a branch builds
  its nodes off the tree and places them after, so none of its components
  found itself live when created, and `onAttach` never ran.
- **A slot argument is read where the slot reads it**, so the content
  follows it (`<{input.renderer} active=( state.active === i )/>`); it was
  read once, when the slot was placed.

### Added — the registry refuses what can never render, and plugins

- `register()` refuses a name the compiler reads as an HTML or SVG element
  or a syntax tag (`menu`, `dialog`, `nav`, `if`, …), in any case: the
  compiler resolves those tags before it looks at the registry, so the
  component never rendered, and what failed instead was whatever its markup
  read. The tag tables moved to `src/ir/tags.ts`, so a build with no
  compiler (`./runtime`) refuses them too.
- `lips.use( plugin, options? )` installs a plugin: what it `requires`
  first, then its `components`, then its `install( lips, options )`. Once
  per Lips; another plugin of the same name, and a component name
  something else holds, are refused. Chainable. `Plugin` is exported.

### Added — `@lipsjs/lips/parts`: popover and menu (RFC-008, lips#51)

- Headless parts, each a plugin: `lips.use( menu )` installs the menu and
  the popover it is built on. One template for the DOM and for Lynx; the
  look is the app's, through the classes it gives.
- `popover`: controlled (`open` in, `change` out), its pieces sharing
  `context.popover`, or `of=` for any controller of the same shape. Its
  content is a fixed layer over the page with a backdrop, placed under or
  over its trigger (`place`, or the app's own as `place=`), right-to-left
  included; Escape and a tap outside close it and give focus back.
- `menu`: WAI-ARIA's menu button over items as data. Arrows, Home and End,
  typeahead, past disabled items; Enter, Space or a tap selects and closes.
  `move` and `typed` are exported.

### Added — a ref that measures, and equal writes not sent, on Lynx (lips#50)

- `await this.refs.x.getBoundingClientRect()` reads the same on both
  hosts: on Lynx a promise of the DOM's box shape, `null` for what is not
  a Lynx element or a failed answer. A measured layout-only box is given a
  native view (`lips-rect`), since Lynx answers none for it.
- The background host drops a write equal to the last one: text, an
  attribute, a custom property. A re-run `<for>` row sends nothing that did
  not change.
- Lynx's boolean attributes are sent as booleans, since HarmonyOS reads any
  text as true.

### Changed — list props as JSON, and Android's `enableA11y` on (lips#47, lips#44)

- A `list`'s own props (`span-count`, `sticky-offset`, `sticky`, the
  `experimental-*` flags) reach Lynx as the numbers and booleans it reads;
  as text it dropped them, so `span-count="2"` gave one column.
- `LYNX_PAGE_CONFIG` sets `enableA11y: true`, Android's helper
  accessibility path, measured with TalkBack. An app's own page config that
  sets it keeps its value.

### Added — inline SVG on Lynx (lips#34)

- An `<svg>` in a template renders on Lynx. Lynx draws an svg as one view
  from a markup string, so the template pass keeps the subtree whole and
  the background host writes it into the svg's `content`. A bound
  attribute, control flow or text inside rewrites it, once per flush.
  `width` and `height` size the element, as on the DOM.
- `LIPS-L108` (warning): a tag, attribute, event or component inside an
  svg that Lynx's svg does not draw.
- `svg` is an XElement: the host app must integrate XElement for it to
  draw.

### Added — event data on Lynx (lips#35)

- A Lynx event reaches its handler DOM-shaped: `e.key`, `e.repeat` and the
  modifiers on key events; `e.touches` and `e.changedTouches`, with their
  positions, on touch events; `e.target` and `e.currentTarget`, with their
  `dataset`, on every event. Before, only `type` and `detail` crossed, so a
  handler could not tell ArrowDown from Enter, or follow a swipe.

### Added — event modifiers: `.stop`, `.capture`, `.outside` (lips#36)

- `on-click.stop( fn )` keeps the event from the elements above,
  `on-click.capture( fn )` has it on the way down, and
  `on-click.outside( fn )` runs for a tap anywhere but inside the element
  (a menu or popover closing). They combine (`.capture.stop`), and mean the
  same on the DOM and on Lynx, where handlers run on another thread and
  `e.stopPropagation()` cannot work.
- `LIPS-C022`: an unknown modifier is an error; a modifier on a component's
  event is a warning, since a component's events do not propagate.
- `Host.listen` receives the event name with its modifiers. A custom host
  must read them.

### Added — element references: `@ref` (lips#37)

- `<input @ref="search">` puts the element on `this.refs.search` while it
  lives. On the DOM it is the element. On Lynx it answers `focus()`,
  `blur()`, `scrollTo()`, `scrollIntoView()` and `animate()` as the DOM
  element would, through Lynx's UI methods after the flush. `focus()` is
  accessibility focus on an element that is not an input. `Host.keepFocus`
  works on Lynx too.
- Untrusted templates cannot read `self.refs` (`LIPS-U005`), as they cannot
  read `self.node`.

### Added — the Lynx runtime, published (lips#38)

- `@lipsjs/lips/lynx/main` (`connectMain`, the main-thread applier) and
  `@lipsjs/lips/lynx/background` (`connectBackground`, the background
  host): one entry per thread, each with its size budget (2.21 and 4.74 KB
  gzipped). The background renders with `renderIR` from
  `@lipsjs/lips/runtime`. Before, no app outside this repository could
  render on Lynx.
- `@lipsjs/lips/lynx-plugin` (`pluginLips`), the Rspeedy plugin: compiles
  `*.lips.css` sheets (an error fails the build), sets the page config, and
  adds Lips's files to what the app compiles, because Lynx's background
  engine does not parse `||=`. It needs a Lynx build plugin before it and
  imports none itself.
- Packaging is decided as subpath entries of `@lipsjs/lips`, not a
  separate package (RFC-006 §9.3).
- The Lynx demo builds from the packed package only (`demos/lynx/pack.sh`),
  and tier B runs against it.

### Changed — a boolean bound on `aria-*` is written out (lips#40)

- `aria-selected=state.on` now writes `"true"` or `"false"`, as ARIA reads
  them. Before, `true` was written as `""` and `false` removed the
  attribute, and ARIA reads both as "not set", so the element never read
  as selected. **DOM output changes**: a bound `false` on `aria-*` is now
  present as `"false"`. `null` and `undefined` still remove it, and every
  other attribute keeps HTML's presence rule. Spreads follow the same
  rule. RFC-006 §9.6.

### Added — `disabled` on a button, on Lynx (lips#41)

- A disabled `<button>` runs no tap handler, its own or one above it, as on
  the DOM: Lynx does not block the tap itself. Its state is sent as
  `aria-disabled` is, so assistive technology is told. Other events, and
  `disabled` on an input, are unchanged.

### Added — `LIPS-L012`: `line-clamp` on Lynx (lips#42)

- `line-clamp` and `-webkit-line-clamp` in a Lynx sheet are an error of
  their own, whose hint names the fix: the `text-maxline` attribute on the
  text, with `text-overflow: ellipsis`. Before, they got the generic
  `LIPS-L008` warning and the text was never cut.

### Added — list cell hints on Lynx (lips#43)

- `full-span`, `sticky-top`, `sticky-bottom`, `estimated-height-px` and
  `estimated-main-axis-size-px` on a `list-item` reach Lynx's list in its
  insert actions, as the booleans and numbers it reads, and in an update
  action when they change on a cell it already has. Write the list's own
  `sticky` for sticky cells. Cells are still built eagerly: recycling is a
  later step.

## [0.3.1] — 2026-11-23

The Lynx pass, published for a build step. Nothing changes for an app that
does not import it, hence the patch version.

### Added — `@lipsjs/lips/lynx`, the Lynx pass for a build step

- `compileLynxTemplate`, `lynxVocabulary`, `compileLynxStyle` and
  `LYNX_PAGE_CONFIG`, from an entry of their own. They were reachable only
  from source, so an app could not hold its own templates and sheets to
  what Lynx draws without copying Lips's tree. Build-time, like
  `./precompile`; the main-thread and background hosts are not part of it.

## [0.3.0] — 2026-11-23

Lips on Lynx (RFC-006 L0–L3 and its accessibility), untrusted templates
(RFC-007), i18n in Unicode MessageFormat 2, and a `<context>` layer. Breaking
before 1.0, hence the minor version: messages are MessageFormat 2,
`watchContext` replaces the `context` template field, and Stylis is opt-in.

### Added — ARIA read as Lynx's own accessibility attributes (RFC-006 §4.8)

- The background host keeps each element's ARIA and, once per flush, sends
  what it comes to: `role`, and the roles of `button`, `a` and `h1`–`h6`, as
  traits; labels from `aria-label`, `alt`, `aria-labelledby` and
  `<label for>`, resolved to text at run time; states as translatable words
  in `accessibility-value`; `aria-hidden`, `aria-modal` and `tabindex`.
- Live regions announce through `lynx.accessibilityAnnounce`.
- The vocabulary pass warns on ARIA Lynx cannot read (`LIPS-L105`–`L107`).

### Added — untrusted templates (RFC-007)

- **`new Lips({ untrusted: untrusted() })`** runs templates you did not write
  — a generated UI, a partner's embed — under one replaceable policy. From the
  new opt-in entry `@lipsjs/lips/untrusted` (9.2 KB gzipped), passed by value
  like `messageFormat`, so apps that never use it ship none of it.
  - A template reaches the data and functions the host hands it, frozen copies
    of a few pure globals, and its own subtree through the template language.
    Not the page, not the realm's prototypes or constructors, not script, not
    page-wide CSS, not the router's globals.
  - **Compile time:** `checkTemplate( policy )`, a new `CompileOptions.check`
    hook, checks the template and its macros. Each refusal is a positioned
    diagnostic (`LIPS-U001`…`U042`, with `line`/`col`/`hint`), and the refused
    element, attribute or expression is dropped before it compiles.
  - **Runtime:** a guarded expression evaluator (refusals throw into `onError`),
    and a guarded DOM host that checks skeletons once in an inert `<template>`,
    sanitizes `@html` by the same rules, and asks the policy about every
    element, attribute, style value and listener after that. Handlers receive a
    snapshot of the event, never the event. Refusals there go to
    `policy.report`.
  - **Stylesheets:** `@import`, loading functions and disallowed `url()`s are
    reported where written, and a sheet with any refusal ships empty. A
    precompiled `style` is not injected (`LIPS-U042`).
  - **Replace the policy whole or in part:**
    `untrusted({ ...untrustedPolicy, url: sameOriginOnly })`.
  - **Works on `./runtime`** with precompiled templates: their skeletons are
    checked when first used.
  - `mode` is ignored under a guard — no option switches it off.
- **`tests/untrusted.spec.ts`** maps every route found, each with a control
  that proves the route is real when the template is trusted.

### Changed

- **Each mode claims only what it guarantees.** `interpreted` is CSP-safe — it
  never builds a `Function` — and was documented as a sandbox for untrusted
  embeds. It is not one: it limits the names an expression starts from, not
  what it reaches. The docs (`expression.ts`, `LipsConfig.mode`, RFC-001,
  RFC-002, RFC-003, ROADMAP, README) now say so and point to RFC-007.
- Size budgets: full 33.85 → 34.05, `./runtime` 15 → 15.15, `./precompile`
  14 → 14.15, for the guard seam, token positions and the fixes below. The
  reasons are in `scripts/size-check.mjs`.

### Fixed

- **Names found through `Object.prototype`.** In the interpreted mode, `constructor`,
  `__proto__`, `toString`… resolved to `Object.prototype`'s members, because arrow
  frames and the globals table were `{}`. In the compiled mode the rename table
  did the same and emitted the source text of `Object` for an identifier named
  `constructor`. The tables are prototype-free now.
- **Comments round-trip.** A template comment starting with `>` or `->` was
  re-emitted as `<!-->…`, which the browser reads as an empty comment followed by
  markup.
- **Scope names are quoted.** A component name with a quote in it closed the
  stylesheet's `[rel="…"]` scope, and the injector's `<head>` lookup.

### Changed — i18n messages are Unicode MessageFormat 2 (BREAKING)

- **Every dictionary entry is an MF2 message** (CLDR 47), formatted by
  `messageformat` v4, now a dependency. It is MF2 source
  (`'Welcome {$name}!'`) or its data model as JSON. The old shapes are
  gone: `{ type: 'variable' | 'text' | 'plural' | 'condition', value }`
  and region-variant objects (`{ '*': …, UK: … }`).
  - Migrating: `{name}` → `{$name}`. A `plural` becomes
    `.input {$count :integer} .match $count 0 {{…}} one {{…}} * {{…}}`.
    A `condition` becomes a `.match` on the value. A region variant
    becomes an entry in that region's own dictionary (`en-GB`).
- **Plurals by CLDR category** (`one`, `few`, `many`, …) per language,
  an exact number first.
- **Typed formatting through `Intl`**, in the reader's language:
  `:number`, `:integer`, `:currency`, `:percent`, `:offset`, `:string`,
  `:date`, `:time`, `:datetime`, `:unit`. `lips.i18n.functions` takes a
  host's own, named with a namespace.
- **Placeholders are bidi-isolated** (U+2068…U+2069).
- **No `new Function`.** The `condition` format evaluated dictionary
  text, which broke `interpreted` mode's CSP promise.
- **`lips.i18n.onError`** reports a message that does not parse or
  cannot fill. Under `debug` it warns. Rendering never throws.
- **Dictionaries are keyed by full language tag** (`fr`, `fr-CA`,
  `zh-Hant`), whatever the casing. They are read through RFC 4647 Lookup
  (`lookupTags`): `zh-Hant-TW` → `zh-Hant` → `zh`. `setLoader` is asked
  once for each tag of the chain.
- **`self.pick( name )`** and **`lips.i18n.pick( name, lang? )`** read a
  translatable name (`{ default, names }`) through the same chain.
- **An engine without `Intl`** gets the least MF2 needs: plain numbers
  and dates, and every plural `other`. Installed member by member, only
  where missing.
- **The engine is injected, like the style compiler.** The full build
  carries it (budget 26.55 → 33.85 KB gzipped: the library's 7.6 KB, our
  own code net zero). `./runtime` does not, and stays under 15 KB. An app
  there that translates passes it:
  `new Lips({ messageFormat })` with `messageFormat` from the new
  **`@lipsjs/lips/i18n`** entry (7.75 KB). Without an engine,
  `setDictionary` is refused.
- `design/i18n-context.md` §5.2–§5.4.

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
- The expression cache key held a raw NUL character. Lynx's template
  encoder stores a script as a C string, so a dev build's background script
  ended there and the iOS simulator reported `SyntaxError: Unexpected EOF`.
  It is now written `\0`; minified builds already escaped it.
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
