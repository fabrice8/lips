# RFC-009 — Editor tooling: the template, highlighted and typed

**Status:** proposed · 2026-11-25 · home decided by the owner (§8.1)
**Depends on:** RFC-001 (template IR: the parser and its locations), RFC-004
(StyleIR: `{expr}` in a stylesheet), lips#54 (a component's types: `Shape`,
`Handlers`, `SharedContext`)

---

## 1. Context

A Lips component is plain data, and its template is a string: what makes it
precompile to JSON IR, render untrusted (RFC-007) and draw on Lynx
(RFC-006). The editor sees that string as a string. Nothing colours
`<if( state.open )>`, nothing completes `state.`, and nothing says that
`{state.cont}` names no state key or that `on-click(stp)` names no handler.
Lips finds both at run time, if the line runs.

The script half is typed since lips#54, but only so far. A component
written in a `register`, `render` or `root` call is inferred whole. A
component written apart — a `.lips` file, a module of exports, the house
style — has its handlers' `this` fixed where it is written, so its handler
carries an annotation, `Handlers<Shape<{ … }>>`, and reads a sibling
handler as `any`.

What is asked: colour and check the template string, and type a component
written apart with no wrapper and no annotation, in the two forms Lips has
(a `.lips` file, an object or module in `.ts`). The template stays a
string.

Prior art. **Marko**: the `.marko` file is the unit, and its language tools
generate the TypeScript behind it, so the author writes neither wrapper nor
annotation. **Vue** (`vue-tsc`, the Vue extension) and **Astro**: the same,
on **Volar**, a framework for languages embedded in other languages.
**lit-analyzer**: checks lit's `html` tagged templates inside `.ts` files,
from a TypeScript server plugin.

## 2. Decisions

**D1 — The template stays a string.** JSX would type the template for free
and cost what the string buys: JSON IR, untrusted templates, Lynx, a
generator that emits a component as data. Every check below is done by a
tool reading the string, never by changing what the string is.

**D2 — The field is the marker; no tag, no import.** A component's
template is already named: the `default` field, the `macros` field and the
`stylesheet` field of a component, `export default` / `export const
stylesheet` / `export const macros` in a module, and the markup half of a
`.lips` file. The tool keys on those names. A string Lips reads anywhere
else (a template built at run time, a fixture) takes a `/* lips */` comment
before its backtick. Nothing at run time changes, and nothing is imported.

A `lips` tag (`` lips`…` ``) was the alternative. It costs an import and a
function per template, and its name is taken: `const lips = new Lips()` is
how every app holds its instance.

**D3 — Types come from the tool, not from the author.** For each
component, the tool writes a hidden TypeScript file: the script as
written, wrapped the way `component()` wraps it, and every template
expression placed in a function whose parameters are `state`, `input`,
`static`, `context` and `self`, typed from that wrapper. TypeScript checks
the hidden file; each error is mapped back to the character it came from.
So a `.lips` file, and a module of exports, gets what a component written
in a `register` call gets today: `this` typed in every handler, siblings
included, with no annotation. `Handlers<Shape<…>>` and `component()` stay
for code that runs without the tool.

**D4 — Lips's own diagnostics in the editor.** The tool runs the compiler
it already has. Every `LIPS-P…`, `LIPS-C…` and, for a Lynx target,
`LIPS-L…` diagnostic shows where it points, as the author types, not when
a test compiles the template. This needs no new checking code.

**D5 — On Volar.** Volar gives, from one description of a language: the
language server (any LSP editor), the TypeScript server plugin (so `.ts`
files that import a `.lips` file see its types), and the command-line
checker (`vue-tsc` is built this way). Lips writes the generator (§4); the
rest is Volar's.

## 3. Highlighting

A TextMate grammar, `source.lips`: HTML, plus what Lips adds to it —
`{…}` slots (embedded TypeScript), `<if( … )>`, `<else-if( … )>`,
`<switch( … )>`, `<for [a, b] in=…>`, `<let>`, `<const>`, `<async>`,
`<then [v]>`, `<catch [e]>`, `<macro>`, `<{expr}/>`, `on-*( … )`,
`@text=`, `@html=`, `@ref=`, `@format=`, `...spread`, `i18n=`. A
stylesheet grammar: CSS plus `{…}` values. Both are injected into
TypeScript and JavaScript at the markers of D2.

Shipped as a VS Code extension, the first piece usable on its own. It
starts from what exists: `lips-js/syntax-highlighter` (2025) is a VS Code
grammar, `source.lips`, already injected into TypeScript and JavaScript at
`default:` and `export default` — D2's choice, made then. Phase 1 adds the
`stylesheet` and `macros` fields, the `.lips` file, `/* lips */`, the
constructs RFC-001 added since, and the scope tests of §9. GitHub
colours a language once Linguist lists it, which wants a number of public
repositories using it: later, not a dependency.

## 4. The generator: what each construct becomes

`@lipsjs/language-core` turns a component into the hidden file and its
mappings. It is plain code with no editor in it, tested on its own. For a
`.lips` file:

```ts
// the script, as written
export type Input = { initial?: number }
const state = { count: 0 }
const handler = { step( by: number ){ this.state.count += by } }

// what the tool adds, mapped to nothing the author wrote
const __c = __lips.component<{ input: Input }>()({ state, handler })
function __template( state: …, input: …, static: …, context: …, self: … ){
  ( state.count )                         // ← mapped to `{state.count}`
  __lips.event<'click'>( self.step, [ 1 ] ) // ← mapped to `on-click(step, 1)`
}
```

The script's `const handler = { … }` is checked in place, its `this` given
by a `ThisType` the tool places on it, so its errors point at what the
author wrote.

| Construct | Becomes | Checked |
|---|---|---|
| `{expr}`, `attr=expr`, `<if( expr )>`, `<switch( expr )>`, `@text=`, `@html=`, `<{expr}/>`, `...spread`, a `<case is=…>` | `( expr )` in the template function | names, keys, calls |
| `<for [item, i] in=xs>` · `from to by` | `__lips.each( xs, ( item, i ) => { … } )`, typed for arrays, objects and ranges | the source, and the names inside |
| `<let name=expr>` · `<const>` | `const name = expr` in that block | as an expression; a write to a `<let>` name is an error (the compile-time check lips#53 left open) |
| `<async await( p )>` `<then [v]>` `<catch [e]>` | `const v = __lips.awaited( p )`, `e: unknown` | the promise's value |
| `on-click( h, a, b )` | `__lips.event<'click'>( self.h, [ a, b ] )` | `h` is a handler; it takes `a`, `b`, then the event (`MouseEvent` for `click`, from the DOM's event map), and may ignore the event |
| `<counter initial=…>`, a component tag | `__lips.input<'counter'>({ initial: … })` | the child's input, when the tag is known (§5) |
| `@format="key, { … }"` | `( { … } )` | the parameters as an expression |
| `{expr}` in a stylesheet | `( expr )` in the same scope | as in the template |
| a macro's `[args]` | `any`, at first | its body, its call sites later |

`self` is the component as `this` is in a handler: its members and
handlers. Names the runtime refuses (`window`, `document`, … under the
untrusted policy) are not in scope when the component is untrusted.

## 5. Components by tag

A tag names a registered component, and registration is at run time. The
tool reads tags from an augmentable interface, as `SharedContext` is read:

```ts
declare module '@lipsjs/lips' {
  interface Components {
    counter: typeof import('./components/counter')
  }
}
```

A tag it lists has its input checked; a tag it does not list is not. The
tool can also write this block itself from a project's `register` calls
(phase 4). What a child emits is untyped today (`emit( event, ...args )`).
Typing it needs a declared list of events on the component, a runtime
field, so it is a separate decision (§8).

## 6. Parser additions

The parser keeps a location for each `{…}` slot, but for an expression,
event, callable or spread attribute it keeps the attribute's location and
the source, not where the source starts. The generator needs the start of
each expression, and of each name a construct declares (`[item, i]`,
`<let name>`). A location per expression and per declared name, nothing
else: the IR does not change, so nothing at run time does.

## 7. Packages, phases and cost

| Package | What it is |
|---|---|
| `@lipsjs/language-core` | the generator (§4) and the grammar (§3); no editor in it |
| `@lipsjs/language-server` | Volar's language server, for any LSP editor |
| `@lipsjs/typescript-plugin` | Volar's TypeScript server plugin |
| `lips-check` | the command-line checker, for CI |
| Lips for VS Code | the extension: grammar, server, plugin |

Estimates are for one engineer working on nothing else, and include the
tests each rule ships with (§9):

| Phase | Delivers | Estimate |
|---|---|---|
| 1 | §3: highlighting in `.lips` files and at the D2 markers in `.ts`; the VS Code extension | 2–3 days |
| 2 | §6, D4, and §4 for `.lips` files: Lips's diagnostics and type errors in the editor, `this` typed with no annotation, `lips-check` | 2 weeks |
| 3 | §4 for components in `.ts` files: objects and modules of exports, read from the D2 markers | 1 week, after a spike (§8) |
| 4 | §5: component inputs by tag, and the `Components` block written by the tool | 1 week |
| 5 | Completion, hover and go-to-definition across script and template; rename | 1 week |

About six weeks to all five. Phases 1 and 2 are usable on their own: three
weeks to highlighting plus checking for `.lips` files, the form most of
what the editor gives is for. Publishing (a Marketplace publisher, the npm
packages) is the owner's step at the end of phase 1.

## 8. Open questions

1. ~~Where the tools live.~~ **Resolved (owner, 2026-11-25): a repository
   of their own**, as Vue's tools live apart from Vue. The library's tests,
   size budgets and releases stay what they are; the tools depend on a
   published `@lipsjs/lips` (its parser and compiler) like any consumer.
   `lips-js/syntax-highlighter` is that repository's start: renamed (to
   `lips-js/language-tools`, as Vue's is `vuejs/language-tools`) and grown
   into the packages of §7, its grammar becoming phase 1's.
2. **Templates inside `.ts` files.** Volar's plugin is made for files that
   are a language of their own (`.lips`). Checking a template inside a
   `.ts` file is what lit-analyzer does, from a TypeScript server plugin
   alone, and what Volar may also allow. A two-day spike decides it before
   phase 3; if neither holds, `.ts` components keep the annotation and
   `.lips` is where the template is checked.
3. **Typed events.** A component's `emits` list, a runtime field, would
   type what its parent's `on-*` receives. Worth it only with phase 4.
4. **Typed dictionary keys.** `i18n="counter.reset"` and `@format` keys
   checked against the dictionaries a project registers. Later.

## 9. Checks

Each rule ships with its check, as every rule in Lips does:

- **The generator:** for each construct in §4, a fixture (a template and
  the errors it must report, at the characters it must report them), and a
  mutation of the rule that the fixture catches.
- **The mappings:** every expression's mapping round-trips — offsets in the
  hidden file map back to the exact source characters — over every
  template in `demos/` and `docs/reference.md`.
- **The grammar:** scope snapshots (`vscode-tmgrammar-test`) over the same
  templates.
- **No false errors:** `lips-check` over `demos/app` reports nothing, in CI.
