# RFC-002 — Lips as the Modela engine

> Status: implemented (engine side) · 2026-07-24
> Companion to [RFC-001](./template-ir.md). Derived from a read of the
> Modela editor codebase (`modelaway/editor`), not from speculation.

## Why this exists

Modela is a canvas visual editor: a Lips-built shell (toolbar, quickset,
floating layers panel, menus) around iframe *frames* on a canvas, with an
external controls layer (movable / sortable / resizable / zoomable) that
attaches to Lips components and drives the DOM directly. It was mid-refactor
onto Lips `0.0.12` when work paused.

Reading that codebase surfaced concrete gaps between what Modela's components
*already do* and what the Lips IR engine supported. This RFC records the
contract and what changed on the Lips side to honour it. **Modela adapts to
this contract when its implementation resumes** — nothing here requires Modela
to change first.

## The five patterns Modela relies on

### 1. Collections as state (`Map`, `Set`)

Modela's layer tree is a recursive `Map<string, LayerElement>` where each node
may hold a child `Map`. It is built by a DOM traverser and mutated in place:

```js
state.layers.set( key, layer )   // add
state.layers.delete( key )       // remove
state.layers = new Map()         // rebuild on frame change
```

**Engine support:** deep-reactive stores now wrap `Map`/`Set`. Mutators
(`set` / `delete` / `clear` / `add`) notify the owning key's subscribers;
values read out of a collection are wrapped in turn, so nested Maps stay
reactive at any depth. `<for>` iterates Sets as `[ value, index ]` alongside
its existing array/Map/object forms.

The subtle part: **collection proxies are identity-stable across stores.** A
parent's `state.layers` and a child's `input.list` are the same object reached
through two reactive stores. Each store registers its own notifier against one
shared proxy, and assigning an unchanged collection reference still notifies
(collections mutate in place, so reference equality proves nothing). Without
this, `state.layers.set(…)` in the panel would not reach the `<layerlist>`
child rendering it.

### 2. Spread arguments on macros

Modela's toolbar/quickset/menu build option lists this way:

```html
<option type="tool" key=key ...each/>
<option ...state.spread key="explicit"/>
```

**Engine support:** macro call sites compile to an ordered list of
assignments, so spreads and explicit attributes override each other **left to
right**, matching JS object-literal semantics. Every call-site key — declared
argv or not — is exposed through `arguments`, which Modela passes to handlers
(`on-click( onHandleOption, type, key, arguments )`). Keys that disappear from
a spread are removed on update.

### 3. Components as control handles

Modela's controls are plain classes that attach to a component:

```js
this.movable = editor.controls.movable( this, options )
// internally:
component.node                                  // live element(s)
component.on('component:attached', () => bind() )
component.on('component:detached', () => unbind() )
```

**Engine support:** every component `self` exposes `node` (live element nodes,
comment boundaries excluded) and an event bus (`on` / `once` / `off` / `emit`)
that fires `component:mount`, `component:attached`, `component:detached`,
`component:destroy`. Attachment is tracked whether or not `onAttach` is
defined, because controls subscribe through the bus rather than the hook. Root
components emit on both the runtime bus and the facade's `Events`, so
`component.on(…)` from outside and `this.on(…)` inside see the same stream.

### 4. Mutually recursive components

`<layerlist>` renders `<layeritem>`, which renders `<layerlist>` for its
children — unbounded depth driven by data.

**Engine support:** verified by spec. Component resolution is per-render and
lazy, so mutual recursion terminates naturally on the data (the legacy engine
forbade a component rendering within itself).

### 5. Handlers receive their input

```js
onInput({ host, settings }){ … }
```

**Engine support:** `onInput` is called with the input object for root and
nested components alike.

## Deliberate non-support

**`<let ...obj/>` — spread into scope.** Modela used this once
(`<let ...state.suggestions/>`). It cannot work with compiled expressions: the
spread's keys are unknown at compile time, so a bind referencing them as bare
identifiers can never resolve. The compiler now reports `LIPS-C013` with a
fix: assign the object to one name (`<let opts={ … }/>` then `opts.key`).
Silently dropping it — the previous behaviour — was worse.

**`historySignal`.** Modela has its own history system (diff-match-patch over
content snapshots, with compression). Lips should not grow a competing one.

## The sketch-board path (not yet built)

When Modela's canvas/sketch board resumes, the pieces it needs already exist:

| Need | Lips feature |
|---|---|
| Generate UI from a sketch, render immediately | `compileTemplate()` → `renderIR()` — no build step |
| Revise a component without losing editing state | `instance.swap( newIR )` |
| Highlight what a revision changed | `SwapReport.changes` (`skeleton` / `binds` / `block` + path) |
| Store / stream a generated component | `TemplateIR` is JSON; `precompile()` emits it |
| Render untrusted generated UI in a preview | `mode: 'interpreted'` — no `eval`/`Function` |
| Report a bad generation back to the assistant | parser/compiler diagnostics with `line`/`col`/`code`/`hint` |

### Instance salvage

A revision that changes a block's static skeleton has to rebuild that block.
Rather than destroy what lives inside it, the engine **salvages** the component
instances: each one is released from the region being rebuilt, offered to the
fresh render, and re-homed there — same state, same DOM nodes, same handlers.
Only its parent-side wiring (input expressions, event instructions) is rebuilt,
against the new call site. No lifecycle hook fires: from the component's point
of view nothing happened. Components the revision dropped are destroyed
normally, `onDestroy` and all.

The same applies when only a component's own call site changes
(`<panel list=state.a/>` → `<panel list=state.b/>`): the instance stays, the
new binding is wired onto it, and inputs the revision removed are cleared.

**Identity rule.** A `key` input decides which live instance a call site
claims:

```html
<layer key=layer.id .../>   <!-- follows the key, wherever it moves -->
<layer .../>                <!-- follows position among same-name siblings -->
```

Keyless components match by position among same-name components in render
order — the rule keyless JSX lists already follow. For a sketch board that
regenerates whole templates, **give regenerated components a stable `key`**;
that is what lets an instance survive being moved somewhere else in the tree.

`SwapReport.salvaged` lists what carried over, so a board can report "kept 4
components, rebuilt 2".

**What still resets.** Salvage preserves state and node identity, not DOM
attachment: the nodes are detached and re-inserted, so anything that reacts to
being re-parented (an `<iframe>` reloads, CSS transitions restart) still does.
Focus is restored automatically. `<if>` / `<for>` bodies are not salvaged as
blocks — only the components inside them are.

## Open questions for when Modela resumes

1. Does sketch generation emit whole component templates or patches? (Whole
   templates suit `swap()` today; patches would want an IR-level merge API.)
2. Is component identity stable across regenerations, or re-derived each time?
   Salvage design depends on the answer.
3. Does the board need IR to round-trip through storage/network, or stay in
   memory? Both work; the former makes `precompile()` the natural boundary.
