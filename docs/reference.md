# Lips reference

What each part of Lips is, when to reach for it and when not to, and a short
example. It describes what Lips does today, checked: every example below
runs in `tests/reference.spec.ts`. A comment above each one says how it is
checked:

- `renders "…"`: rendered as a component; its text must contain the quote
  (after clicking the selector, when one is named);
- `compiles`: a template that compiles with no error;
- `reports LIPS-…`: a template that reports that diagnostic;
- `runs`: code run against a fresh `lips`, which must not throw;
- `from <file>`: copied from that file, which a demo runs and
  `npm run typecheck` checks.

The design behind each part is in the RFCs under [`design/`](../design);
this page is how it behaves.

**Contents**: [The Lips instance](#the-lips-instance) ·
[A component](#a-component) · [Types](#types) · [Lifecycle](#lifecycle) ·
[Template syntax](#template-syntax) · [Composition](#composition) ·
[Context](#context) · [i18n](#i18n) · [Stylesheets](#stylesheets) ·
[The router](#the-router) · [Hot-swap](#hot-swap) ·
[Precompile and CSP](#precompile-and-csp) ·
[Untrusted templates](#untrusted-templates) · [Lynx](#lynx) ·
[Parts and plugins](#parts-and-plugins) · [Reactivity](#reactivity) ·
[Diagnostics](#diagnostics)

---

## The Lips instance

<!-- runs -->
```js
import Lips from '@lipsjs/lips'

const lips = new Lips({ lang: 'en-US' })
```

| Option | What it does |
|---|---|
| `context` | the initial shared context ([Context](#context)) |
| `lang` | the initial language; `navigator.language` when left out, `en-US` where there is none |
| `mode` | `'compiled'` (default: one `Function` per expression) or `'interpreted'` (no `Function`, for a CSP without `unsafe-eval`). Both mean the same: an expression reads as JS reads it |
| `debug` | warns about a translation key no dictionary answers, and a message that fails |
| `styleLayer` | wraps every component sheet in `@layer <name>`, for utility-CSS users |
| `stylePreprocessor` | a CSS preprocessor, e.g. `stylisPreprocessor` from `@lipsjs/lips/stylis`, for engines with no CSS nesting |
| `messageFormat` | the MessageFormat 2 engine, for `@lipsjs/lips/runtime` (the full entry has it) |
| `untrusted` | holds every template to a policy ([Untrusted templates](#untrusted-templates)) |
| `engine` | reserved |

### `register( name, template )` · `unregister( name )` · `has( name )`

A component by tag name. Names are looked up when a template renders, so the
order you register in does not matter. Refused, with an error that says why:
a name the compiler reads as an HTML or SVG element or a syntax tag (`menu`,
`dialog`, `nav`, `if`, …, in any case), since the component would never
render; and a handler named after a member of the component (`state`,
`emit`, `node`, `swap`, …).

Use it for every component a template places by tag. A template you render
once at the top needs no name: `render()` takes it directly.

<!-- runs -->
```js
lips.register('user-card', { default: '<b>{input.name}</b>' })
lips.has('user-card')       // true
lips.unregister('user-card')
```

### `render( name, template, input? )` · `root( template, selector )` · `dispose()`

`render` creates a component and returns its handle; `name` is also its
stylesheet scope. `root` renders and appends in one call and remembers the
component, which `dispose()` destroys.

<!-- runs -->
```js
const card = lips.render('card', { state: { n: 1 }, default: '<p>{state.n}</p>' }, { title: 'Hi' })
card.appendTo('#app')
card.state.n = 2
card.destroy()

lips.root({ default: '<main>app</main>' }, '#app')
lips.dispose()
```

The handle: `state` (reactive), `node` (its root elements), `appendTo( target )`,
`swap( ir )` ([Hot-swap](#hot-swap)), `destroy()` (idempotent), and the
component bus, `on` / `once` / `off` / `emit` ([the bus](#the-component-bus)).

### `use( plugin, options? )`

Installs a plugin ([Parts and plugins](#parts-and-plugins)).

### Context and i18n

`getContext()`, `setContext( key, value )` / `setContext({ … })`,
`watchContext( fields, fn )`, `useContext( fields, fn )`: see [Context](#context).
`setLanguage( lang )`, `getLanguage()`, `useTranslator( support, fn )`,
`i18n`: see [i18n](#i18n).

---

## A component

A component is a plain object. Every field is optional.

| Field | What it is |
|---|---|
| `default` | the template source |
| `state` | data the component changes; reactive. Each instance starts from its own deep copy |
| `static` | data that never re-renders: reading it subscribes to nothing, writing it redraws nothing. Each instance has its own copy. `_static` is the same field, for the named-export form (`export const static` is a SyntaxError) |
| `handler` | methods, bound to the component (`this`), and the [lifecycle](#lifecycle) hooks |
| `macros` | `<macro>` definitions, inlined at compile time ([Macros](#macros)) |
| `stylesheet` | scoped CSS whose values may be `{expressions}` ([Stylesheets](#stylesheets)) |
| `watchContext` | context fields whose change runs `onContext` ([Context](#context)) |
| `name` | the scope of a template placed by value (a route page, `<{state.view}/>`); left out, each template object gets its own |
| `ir`, `style` | precompiled template and stylesheet, used instead of `default` and `stylesheet` ([Precompile](#precompile-and-csp)) |

<!-- renders "3 of 3 left" after clicking "button" -->
```js
{
  state: { left: 5 },
  static: { total: 3 },
  handler: { take(){ this.state.left-- } },
  default: `<p>{state.left - 1} of {static.total} left</p><button on-click(take)>take</button>`
}
```

In a template the component's own data is `state`, `input`, `static`,
`context` and `self`. `input` is what the parent passes: each attribute on
the tag, reactive, an empty object when nothing was passed. `self` is the
component, as `this` is in a handler: its handlers, `node`, `refs`, `lang`,
`emit`, `setContext`, `setLanguage`.

**`state` or `static`?** `state` for what the screen shows and changes;
`static` for configuration and handles a handler keeps (an API base, a
timer, a chart instance) that must not cost a re-render. **`input` or
context?** `input`, almost always: it keeps a component reusable. Context is
for what a whole subtree shares ([Context](#context)).

---

## Types

A component is typed where it is written. Written in a `register`,
`render` or `root` call, Lips infers it: `state` and `static` from their
values, each handler from itself, and `this` in every handler from all
three, its sibling handlers included. A sibling it does not have, or a
state key, is a type error, and the handle's `state` is typed with no
annotation. `render()` reads `input` from what it is handed.

<!-- runs -->
```js
lips.register('tripler', {
  state: { count: 0 },
  handler: {
    step( by ){ this.state.count += by },
    triple(){ this.step( 3 ) }
  },
  default: `<button on-click(triple)>{state.count}</button>`
})
```

<!-- renders "3" after clicking "button" -->
```js
{ default: `<tripler/>` }
```

Written apart, in a file of its own, a component's `this` is fixed where
it is written, before any of those calls sees it. Its handler is typed by
the parts it reads, by name:

<!-- from demos/app/client/components/counter.ts -->
```ts
export const handler: Handlers<Shape<{ input: Input, state: State, static: Static }>> = {
```

An object written apart in a `.ts` file can instead be wrapped in
`component( … )`, which infers it as the calls above do, naming in a first
call only what no value shows: `component<{ input: Input }>()({ … })`.

The context is the app's, so it is typed once, for every component and for
`new Lips()`, by adding to `SharedContext`. `setContext( key, value )` then
checks the value too. A published app writes `declare module '@lipsjs/lips'`.

<!-- from demos/app/client/context.ts -->
```ts
declare module '../../../src/types' {
  interface SharedContext {
    online: boolean
```

| Type | What it is |
|---|---|
| `Component<S>` | a component: what `register`, `render`, `root`, a route and `<{…}/>` take |
| `TypedComponent<S>` | a component whose shape is known, so `render()` reads it back: what `component()` and `precompile()` return |
| `Shape<{ input?, state?, static?, context? }>` | the four typed parts, by name. A part it names is exact, a part it leaves out is empty, `context` is `SharedContext` unless named. Bare, every part is `any` |
| `Rendered<S>` | what `render()` and `root()` return |
| `Self<S, Methods>` | `this` in a handler: the component's members and its handlers |
| `Handlers<S>` | a `handler` object typed apart from its component |
| `Hooks` · `HookName` | the lifecycle hooks, their signatures and names |
| `SharedContext` | the app's context, added to once |

**When not**: a handler typed by `Handlers<…>` reads a sibling handler as
`any`; only an inferred one knows its siblings. What the template string
reads is not checked: its expressions are not TypeScript.

---

## Lifecycle

| Hook | When | How often |
|---|---|---|
| `onCreate()` | the instance exists, before it renders | once |
| `onInput( input )` | it was given input; again whenever an input changes or a spread brings a new key | at creation when it has input, then once a turn per change |
| `onMount()` | its first render is done; its nodes exist | once |
| `onRender()` | after every render, the first included | after `onMount`, then after each update |
| `onUpdate()` | something its template reads changed and an effect re-ran: a text, an attribute, a branch, a row, an input it passes | once a turn per batch of changes |
| `onAttach()` | its nodes are in the document | once, when they arrive |
| `onDetach()` | its nodes left the document | once, at teardown, if it was attached |
| `onContext()` | a field it lists in `watchContext` changed | per change |
| `onError( error )` | what its template evaluates, or a handler, threw or rejected | per error |
| `onDestroy()` | it is torn down | once |

At creation: `onCreate → onInput → onMount → onRender → onAttach`. At
teardown: `onDetach → onDestroy`. A root's `onAttach` waits for
`appendTo()`.

<!-- register "life-log" -->
```js
{
  state: { log: [] },
  handler: {
    onCreate(){ this.static.log = [ 'create' ] },
    onInput(){ this.static.log.push('input') },
    onMount(){ this.static.log.push('mount') },
    onRender(){ this.static.log.length < 4 && this.static.log.push('render') },
    onAttach(){ this.static.log.push('attach'); this.state.log = [ ...this.static.log ] }
  },
  default: `<p>{state.log.join(',')}</p>`
}
```

<!-- renders "create,input,mount,render,attach" -->
```js
{ default: `<life-log a=1/>` }
```

**The error boundary.** Everything a template evaluates runs inside it:
binds, branch conditions, list sources, awaited values, dynamic tags,
component inputs, macro arguments, `<let>`, `<context>`. So do handlers, a
promise a handler returns included. What throws reaches `onError`, or the
console when there is none, and the rest of the page renders; a branch that
threw shows once what it reads is there.

<!-- renders "after" -->
```js
{
  state: {},
  handler: { onError( e ){ this.static.failed = e } },
  default: `<if( state.user.name )><b>never</b></if><p>after</p>`
}
```

**Bus events.** The component's own bus carries `component:mount`,
`component:attached`, `component:detached` and `component:destroy`, in that
order: how code outside a component (a drag control, a chart) follows it
without a hook.

---

## Template syntax

### Text and attributes

`{expression}` renders its value; `null` and `undefined` render nothing.

| Form | Means |
|---|---|
| `title="text"` | literal text |
| `title="a {expr} b"` | text with values in it |
| `title=expr`, `title={ expr }` | a value: unquoted ends at the first space; braced may hold spaces |
| `disabled`, `!disabled` | `true` / `false` |
| `...expr` | an object's keys as attributes; a key that disappears is removed |

A bound `false`, `null` or `undefined` removes the attribute; `true` writes it
empty. On `aria-*` a boolean is written out, `"true"` or `"false"`.
`value=`, `checked=` and `selected=` also set the element's property, so
state can reset a field the reader typed in, and `<select value=…>` picks
its option (after the options a `<for>` renders).

<!-- renders "Ada (admin)" -->
```js
{
  state: { user: { name: 'Ada', admin: true }, extra: { 'data-id': 7 } },
  default: `<p class="user {state.user.admin ? 'admin' : ''}" ...state.extra>{state.user.name}{state.user.admin ? ' (admin)' : ''}</p>`
}
```

Expressions are JS's: literals, members (`?.` included), calls, arrows,
`! - +`, arithmetic, comparison, `&& || ??`, the ternary, assignment and
`++ --`, array and object literals with spread. Not: template literals,
`typeof`, `in`, `instanceof`, `new`, regex literals. A free name is a
template variable (`<let>`, a `<for>` argument), one of `state` `input`
`static` `context` `self`, or a global (in interpreted mode, only `Math`,
`JSON`, `Object`, `Array`, `String`, `Number`, `Boolean`, `Date`,
`parseInt`, `parseFloat`, `isNaN`, `isFinite`, `encodeURIComponent`,
`decodeURIComponent`, `console`).

Character references: every numeric one (`&#169;`, `&#xA9;`) and HTML's
`&amp; &lt; &gt; &quot; &apos; &nbsp;`. Any other name is reported
(LIPS-P013) and stays as written: write the character itself.

### `@text`, `@html`, `@ref`, `@format`

`@text=expr` sets an element's text; `@html=expr` its markup (DOM only;
trusted content only). `@ref="name"` puts the element on `self.refs.name`
while it lives (a bound name follows its value). `@format` is
[i18n](#i18n). On a tag no component claims they mean the same.

<!-- renders "focused" -->
```js
{
  state: { msg: '' },
  handler: { onAttach(){ this.refs.field.focus(); this.state.msg = document.activeElement === this.refs.field ? 'focused' : 'no' } },
  default: `<input @ref="field"><span @text=state.msg></span>`
}
```

### Events

`on-<event>( handler, ...args )` calls the handler with the arguments, then
the event. A bare name is the component's handler (even one named like a
global, `open` or `print`), unless a template variable holds that name.
`on-<event>( expression )` calls the function the expression gives.

| Modifier | Means |
|---|---|
| `.stop` | the event goes no further up |
| `.capture` | the handler has it on the way down, before its target |
| `.outside` | the handler runs for the event anywhere except inside the element (a menu closing) |

They combine (`.capture.stop`) and mean the same on Lynx. A quoted handler
(`on-click="go"`) wires nothing and is an error (LIPS-C020).

<!-- renders "opened 0, removed 1" after clicking ".x" -->
```js
{
  state: { opened: 0, removed: 0 },
  default: `<div on-click(() => state.opened++)><button class="x" on-click.stop(() => state.removed++)>×</button>opened {state.opened}, removed {state.removed}</div>`
}
```

### `<if>` · `<else-if>` · `<else>`

One branch shows; switching branches destroys the old one, its components
included. `<else-if>` and `<else>` follow their `<if>` directly.

<!-- renders "Getting there" -->
```js
{
  state: { level: 50 },
  default: `<if( state.level < 34 )>Needs work</if><else-if( state.level < 67 )>Getting there</else-if><else>Shipping shape</else>`
}
```

### `<for>`

| Source | Arguments |
|---|---|
| `in=` an array | `[ item, index ]` |
| `in=` a `Map` | `[ key, value, index ]` |
| `in=` a `Set` | `[ value, index ]` |
| `in=` an object | `[ key, value, index ]` |
| `from=` … `to=` | `[ n ]`, both ends included, counting down when `to < from` |

`in`, `from` and `to` are values: unquoted, braced, or a lone `"{slot}"`.
Any other quoted form is an error (LIPS-C004). Without `by`, rows are
positional; `by="id"` (a key path) or `by=self.keyOf` (a function of
`( item, index )`) gives each row an identity, so a reorder moves rows
rather than rewriting them, and their components keep their state. A
duplicate key falls back to position, with a warning.

<!-- renders "1:a 2:b 3:c · 5 4 3" -->
```js
{
  state: { rows: [ { id: 'x', label: 'a' }, { id: 'y', label: 'b' }, { id: 'z', label: 'c' } ] },
  default: `<p><for [row, i] in=state.rows by="id">{i + 1}:{row.label} </for>·<for [n] from=5 to=3> {n}</for></p>`
}
```

### `<switch>` · `<case>` · `<default>`

`is` takes a value or an array of values; `is="text"` is a string.

<!-- renders "read only" -->
```js
{
  state: { role: 'guest' },
  default: `<switch( state.role )><case is="admin">admin</case><case is=[ 'viewer', 'guest' ]>read only</case><default>sign in</default></switch>`
}
```

### `<async>` · `<loading>` · `<then>` · `<catch>`

`<loading>` shows at once; the resolved value or the error replaces it.
What the await expression throws is the `<catch>` arm's error, as `await`
has it. A newer await wins: an older result that arrives late is dropped.

<!-- renders "Hello Ada" -->
```js
{
  state: { user: Promise.resolve({ name: 'Ada' }) },
  default: `<async await( state.user )><loading>…</loading><then [u]>Hello {u.name}</then><catch [e]>{e.message}</catch></async>`
}
```

### `<let>` · `<const>`

Names for the whole block they are in, read before or after where they are
written, recomputed when what they read changes. A bind that reads one and
what it is computed from sees both as they are now, whichever it reads
first: a list that shrinks and an index kept within it never meet out of
step. Read-only. A spread is an error (LIPS-C013): the names must be known
when the template compiles.

<!-- renders "total 22" -->
```js
{
  state: { price: 10, qty: 2 },
  default: `<let subtotal={ state.price * state.qty } tax={ subtotal / 10 }/><p>total {subtotal + tax}</p>`
}
```

### `<log>`

`<log( a, b )/>` calls `console.log( a, b )` when what it reads changes, and
renders nothing.

<!-- compiles -->
```html
<log( 'rows:', state.rows.length )/>
```

### Dynamic tags and fragments

`<{expr}>` renders what the value names: a registered component's name, a
template object, or an element's tag. It closes with `</>`, as a fragment
`<>…</>` does.

<!-- renders "<mark>" -->
```js
{
  state: { tag: 'mark' },
  default: `<p><{state.tag}>&lt;{state.tag}&gt;</></p>`
}
```

---

## Composition

### Inputs and spreads

Every attribute on a component's tag is an input. `...expr` spreads an
object's keys in. A component re-renders only what reads an input that
changed, and `onInput` runs again.

### Slots

What a component's tag encloses is `input.renderer`, placed with
`<{input.renderer}/>`. Its expressions belong to where it was written (the
parent's state and handlers); its context and language are where it is
placed. A slot can take arguments: the parent names them in brackets, the
component gives them where it places it, and they follow their value.

<!-- register "item-list" -->
```js
{ default: `<ul><for [row] in=input.items><li><{input.renderer} item=row/></li></for></ul>` }
```

<!-- renders "Ada! Grace!" -->
```js
{
  state: { people: [ 'Ada', 'Grace' ], mark: '!' },
  default: `<item-list [item] items=state.people><span>{item}{state.mark} </span></item-list>`
}
```

### The component bus

`this.emit( 'event', … )` reaches the parent's `on-event( … )` and the
handle's `on( 'event' )`. The bus runs both ways: the holder of a handle
sends a command with `handle.emit( … )`, which reaches what the component
registered with `this.on( … )` (not its handler methods by name).
Arguments sent outward are copied clean of reactive proxies, and a value
with `toJSON` is sent as what `toJSON` returns (a `Date` as its ISO string).

<!-- register "pick-one" -->
```js
{ handler: { pick(){ this.emit('picked', 2) } }, default: `<button on-click(pick)>pick</button>` }
```

<!-- renders "picked 2" after clicking "button" -->
```js
{
  state: { got: 0 },
  default: `<pick-one on-picked( n => state.got = n )/><p>picked {state.got}</p>`
}
```

### Macros

A macro is markup reused at compile time: no instance, no state, no
lifecycle, no styles. Declared arguments are names in its body; every
attribute is also on `arguments`. Attributes apply in source order, spreads
included, as in an object literal. A macro cannot recurse (LIPS-C009), and a
macro call takes no `on-*` (LIPS-C023) and no content (LIPS-C024): pass a
handler as an argument and wire it in the body.

<!-- renders "Pen*" -->
```js
{
  macros: `<macro [label, active, pick] name="tool"><b on-click(pick)>{label}{active ? '*' : ''}</b></macro>`,
  handler: { choose(){} },
  default: `<tool label="Pen" active pick=self.choose/>`
}
```

Use a macro for repeated markup; a component for anything with state,
behaviour or styles of its own.

---

## Context

What a whole subtree shares: a theme, a session, a navigate function. Read
it as `context.x`; a bind that reads it updates when it changes.
`watchContext: [ 'x' ]` runs `onContext` when `x` changes; it does not
decide what the component reads. Write it with `lips.setContext()` or a
handler's `this.setContext()`, which writes the nearest `<context>` that
provides the key, or the shared store.

`<context key=value>` provides keys to everything under it, components
included. A key bound to an expression follows it; a literal one is the
subtree's own, seeded once.

Prefer inputs: a component that reads context only works where that context
is provided.

<!-- runs -->
```js
lips.setContext('theme', 'light')
const stop = lips.watchContext([ 'theme' ], () => {})
lips.useContext([ 'theme' ], ctx => ctx.theme )
stop()
```

<!-- renders "outer: light, inner: dark" -->
```js
{
  default: `<p>outer: {context.theme}, <context theme="dark">inner: {context.theme}</context></p>`
}
```

---

## i18n

Messages are [MessageFormat 2](https://messageformat.unicode.org).
A dictionary is per language tag, read through lookup: a `fr-CA` reader is
served from `fr-CA`, then `fr`.

- `i18n` on an element translates its text by the text itself; `i18n="key"`
  by a stable key (reword the source, the translation holds);
  `i18n-title="key"` / `i18n-placeholder="key"` the attribute.
- `@format="key, { params }"` renders a message with values.
- `<i18n lang=…>` sets the language of a subtree; `self.lang` is the
  language a component renders in; `self.setLanguage()` switches the app.
- `lips.i18n.setLoader( tag => … )` loads a dictionary on demand.

<!-- runs -->
```js
lips.i18n.setDictionary('fr', {
  hello: 'Bonjour',
  items: '.input {$n :integer}\n.match $n\none {{{$n} article}}\n* {{{$n} articles}}'
})
lips.setLanguage('fr')
lips.useTranslator('*', lang => document.documentElement.lang = lang )
```

<!-- renders "Bonjour Ada · 2 articles" -->
```js
{ default: `<p><span i18n="hello">Hello</span> Ada · <span @format="items, { n: 2 }"></span></p>` }
```

---

## Stylesheets

A component's `stylesheet` is scoped: its root elements carry
`rel="<name>"`, and its rules sit inside `[rel="<name>"] { … }`. So a rule
matches the root's descendants; style the root itself with top-level
declarations, or `&.class`. Every instance shares one `<style>`, removed
with the last. A value may be an expression: `color: {state.tone}` becomes
a custom property on the roots, written as state changes, including inside
`:hover`, `@media` and `@keyframes`.

<!-- renders "styled" -->
```js
{
  state: { size: 14 },
  stylesheet: `
    padding: .5rem;
    &.card { border: 1px solid }
    .title { font-size: {state.size}px }`,
  default: `<div class="card"><h2 class="title">styled</h2></div>`
}
```

`style=` on an element takes CSS text (`style="margin: {state.gap}rem"`); an
object literal is an error (LIPS-C019).

---

## The router

`<router routes=…>` renders the page whose path matches. A route is
`{ path, template, default? }`; `:name` segments become `input.params`,
percent-decoded, and the query `input.query`. `global` follows the
browser's URL: `navigate()` pushes an entry, Back routes by `popstate`, and
the first navigation replaces the entry the page loaded on. It publishes
`navigate` in context and, with `global`, on `window`; a destroyed router
removes both. Events: `on-before`, `on-after` (`{ fromState, toState }`),
`on-not-found` (the path). Full entry only.

<!-- renders "user 42" after clicking "button" -->
```js
{
  static: { routes: [
    { path: '/', template: { default: '<p>home</p>' }, default: true },
    { path: '/users/:id', template: { default: '<p>user {input.params.id}</p>' } }
  ] },
  default: `<router routes=static.routes/><button on-click(() => context.navigate('/users/42'))>go</button>`
}
```

---

## Hot-swap

`handle.swap( ir )` re-renders a live component against a new IR, diffing
by expression source: what did not change is kept, a changed bind is
rewired onto the same node, a changed block re-renders. Components inside
are carried over (`report.salvaged`), keeping their state; give generated
components a `key` input if a revision may move them. Focus is restored.

<!-- runs -->
```js
const app = lips.render('editor', { state: { n: 1 }, default: '<p>{state.n}</p>' }).appendTo('#app')
const { changes } = app.swap( compileTemplate('<p class="big">{state.n}</p>').ir )
```

---

## Precompile and CSP

`precompile( template, { name } )` (from `@lipsjs/lips/precompile`) turns
`default`, `macros` and `stylesheet` into `ir` and `style`; the result
renders with `@lipsjs/lips/runtime`, which ships no compiler. With
`mode: 'interpreted'` nothing builds a `Function`, so the app runs under a
CSP without `unsafe-eval`. That is CSP-safety, not a sandbox: both modes are
for templates you wrote. `lipsPlugin()` does it for `.lips` files in Vite or
Rollup: a script, then the template; it inlines `const macros` and exports
`state`, `handler`, `_static`, `watchContext` and the stylesheet.

<!-- runs -->
```js
const { template, diagnostics } = precompile({ default: '<p>{state.n}</p>', state: { n: 1 } }, { name: 'counter' })
new Lips({ mode: 'interpreted' }).render('counter', template ).appendTo('#app')
```

---

## Untrusted templates

`new Lips({ untrusted: untrusted() })` (from `@lipsjs/lips/untrusted`)
holds a template you did not write to a policy: it reaches the data and
functions you hand it, a few pure globals, and its own subtree, and not the
page, prototypes or script. What it may not do is a diagnostic
(`LIPS-U…`) and refused again at runtime. A missing path reads as
`undefined` there rather than throwing. Details: [RFC-007](../design/untrusted-templates.md).

<!-- runs -->
```js
const embed = new Lips({ untrusted: untrusted({ ...untrustedPolicy, report(){} }) })
embed.render('embed', { state: { n: 1 }, default: '<p>{state.n}</p>' }).appendTo('#app')
```

---

## Lynx

The same templates render natively through [Lynx](https://lynxjs.org): Lips
runs on the background thread, and a small applier on the main thread is
the only code that touches elements. `compileLynxTemplate` (from
`@lipsjs/lips/lynx`) compiles for the `'tree'` target with the HTML
vocabulary mapped onto Lynx's elements, and reports what Lynx cannot draw
(`LIPS-L1…`); `compileLynxStyle` lints a sheet (`LIPS-L0…`); `pluginLips`
(from `@lipsjs/lips/lynx-plugin`) wires both into Rspeedy. Details:
[RFC-006](../design/lynx-binding.md).

<!-- from demos/lynx/src/main-thread.ts -->
```ts
const page = ( globalThis as any ).__CreatePage( '0', 0 )
connectMain( page )
```

<!-- from demos/lynx/src/background.ts -->
```ts
const { ir, diagnostics } = compileLynxTemplate( TEMPLATE )
diagnostics.length && console.warn( '[lips] template diagnostics', diagnostics )

const bg = connectBackground()
renderIR( ir, { state, handlers, stylesheet: JSON.parse( sheet ) }, { host: bg.host, mode: 'interpreted' }).mount( bg.root )
```

---

## Parts and plugins

A plugin is `{ name, requires?, components?, install? }`. `lips.use( plugin,
options? )` installs what it requires, then its components, then runs its
`install`; once per Lips. Another plugin of the same name, or a component
name something else holds, is refused.

`@lipsjs/lips/parts` ships headless parts as plugins: `popover`, and on it
`menu`, `dialog`, `combobox`, `reveal` (a region that folds) and
`datePicker`; `layer` and its blurred backdrop, `toast`, `icons( set )` and
`virtualList`. Each takes the classes the app gives, sets state classes
(`is-open`, `is-active`, `is-selected`), and holds its keys, focus and
ARIA on both hosts. Details: [RFC-008](../design/parts.md).

A component whose markup differs by host carries `lynx` source beside
`default`. On Lynx an app renders with `renderIR`, so `lynxComponents(
plugins )` (from `@lipsjs/lips/lynx`) is `use()`'s counterpart: it compiles
the plugins, and what they require, for Lynx, as `renderIR`'s `components`.

A part's templates are source. An app that runs `@lipsjs/lips/runtime`
alone, with no compiler, compiles them in its build with
`precompilePlugins( plugins )` (from `@lipsjs/lips/precompile`), which
returns plain JSON by component name, and hands that to its Lips:

<!-- runs -->
```ts
// build
const { components } = precompilePlugins([ combobox, dialog ])
// page
const lips = new Lips({ mode: 'interpreted', precompiled: components })
lips.use( combobox ).use( dialog )
```

<!-- from demos/app/client/pages/parts.ts -->
```html
<popover open=state.open on-change( setOpen )>
  <popover-trigger class="ghost" haspopup="menu"><span>Actions ▾</span></popover-trigger>
  <popover-menu items=static.actions class="menu" item="menu-item" on-select( run )/>
</popover>
```

---

## Reactivity

The core Lips is built on is exported. `signal( v )` is `[ read, write,
touch ]`; `effect( fn )` runs `fn` and again when what it read changes,
until `dispose()`; `untrack( fn )` reads without subscribing; `batch( fn )`
runs `fn` and notifies once at the end; `computed( fn )` is a value read
with `read()`, computed when read and again only once what it read
changed, never seen as it was before a change by an effect that change
wakes; `reactive( obj, deep? )` is a store
with one signal per key (`deep` reaches nested objects, arrays, `Map` and
`Set`). `Object.keys( store )` follows the keys there are.

A computed value computed again to the value it had (by `Object.is`)
wakes nothing; an object always counts as changed, since stores mutate in
place. What it throws is kept and thrown to each reader until what it read
changes. A write outside a batch runs what it reaches at once, each effect
once; an effect that throws does not keep the others from running, and the
first error is thrown after them. Effects that keep waking one another in
a batch throw rather than hang. `tests/signal-conformance.spec.ts` holds
all of it, case by case, to an established body of signal semantics.

<!-- runs -->
```js
const store = reactive({ items: [] }, true )
const seen = []
const { dispose } = effect( () => seen.push( store.items.length ) )
batch( () => { store.items.push( 1 ); store.items.push( 2 ) })
dispose()
```

---

## Diagnostics

A compile never throws: it returns the IR and a list of diagnostics, each
`{ code, severity, message, hint?, loc: { line, col, offset, length } }`.
The full entry logs a template's at its first render. Every code below is
triggered in `tests/diagnostics.spec.ts`.

| Code | Severity | Means |
|---|---|---|
| `LIPS-P001` | error | a tag the template ends inside, or a malformed closing tag |
| `LIPS-P002` | error | an invalid tag name |
| `LIPS-P003` | error | an unterminated comment |
| `LIPS-P004` | warning | `</>` closes a named tag, or a closing tag auto-closes an open one |
| `LIPS-P005` | error | a stray closing tag |
| `LIPS-P006` | error | an element still open at the end |
| `LIPS-P007` | error | an unterminated `{…}` |
| `LIPS-P008` | error | an unterminated dynamic tag `<{…}` |
| `LIPS-P009` | error | invalid attribute syntax, or unterminated `[…]` arguments |
| `LIPS-P010` | error | an attribute value missing or unterminated, or an unterminated `on-x( …` |
| `LIPS-P011` | error | a head `( … )` on a tag that takes none |
| `LIPS-P012` | error | an unterminated head `<if( …` |
| `LIPS-P013` | warning | a named character reference Lips does not decode |
| `LIPS-C001` | error | `<else-if>` / `<else>` without an `<if>` before it |
| `LIPS-C002` | error | `<case>`, `<default>`, `<then>`, `<catch>`, `<loading>` outside their parent |
| `LIPS-C003` | error | something other than an arm inside `<switch>` / `<async>` |
| `LIPS-C004` | error | a construct missing what it needs: a head, `in`/`from`, `is`, `await( … )`; or a `<for>` attribute that is not a value |
| `LIPS-C007` | warning | a callable attribute `x( … )` on an element |
| `LIPS-C008` | warning | `[…]` arguments on an element |
| `LIPS-C009` | error | a recursive macro |
| `LIPS-C010` | warning | something other than `<macro>` in `macros` |
| `LIPS-C011` | error | a `<macro>` with no `name` |
| `LIPS-C012` | error | `@format` without `reference, { params }` |
| `LIPS-C013` | error | a spread on `<let>` / `<const>` |
| `LIPS-C014` | warning | `i18n-*` on an element without `i18n` |
| `LIPS-C015` | error | `i18n="key"` on text that is not one fixed string |
| `LIPS-C016` | error | a spread on `<context>` |
| `LIPS-C017` | warning | a `<context>` that provides nothing |
| `LIPS-C018` | error | `<i18n>` without `lang` |
| `LIPS-C019` | error | `style=` given an object literal |
| `LIPS-C020` | error | a quoted handler, `on-click="…"` |
| `LIPS-C021` | error | `@html` on the `'tree'` target |
| `LIPS-C022` | error / warning | an unknown event modifier / a modifier on a component's event |
| `LIPS-C023` | error | an `on-*` on a macro call |
| `LIPS-C024` | error | content inside a macro call |
| `LIPS-E001` … `LIPS-E012` | error | an expression that does not parse: the message names the token |

Style codes (`LIPS-S001`–`S008`) are listed in [RFC-004](../design/style-ir.md),
untrusted ones (`LIPS-U…`) in [RFC-007](../design/untrusted-templates.md),
Lynx ones (`LIPS-L…`) in [RFC-006](../design/lynx-binding.md).
