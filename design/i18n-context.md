# RFC-005 — Language and context: reading, keying, scoping

**Status:** implemented (revised 2026-08-21)
**Supersedes:** nothing. **Depends on:** RFC-001 (fine-grained reactivity)
**Companion of:** RFC-004 (StyleIR)

---

## 1. Context

This RFC comes out of a review of one line in an old demo:

```ts
lips.setContext({ lang: 'en-US', online: true, … })
```

and its consumer:

```html
<span @text=context.lang></span>
```

Nothing in the framework read that field. It was app state that happened
to be named `lang`, rendered as a badge — and calling `lips.setLanguage('fr-FR')`
translated the page while leaving the badge reading `en-US`.

The interesting part is *why* it was written that way. It was not a design
idea. It was the only thing available:

> **There was no way to read the active language from a template or a
> handler.** `self` exposed `state`, `input`, `static`, `context`, `node`,
> `emit/on/once/off`, `destroy`, `setContext` — no language. `lips.getLanguage()`
> existed but only on the instance, outside component reach.

So a language badge, or a switcher that highlights the active option, had
to mirror the language into context by hand. That is a workaround for a
missing accessor.

Chasing it produced four changes, from the smallest to the most
structural. They are independent; they are in one RFC because they all
come from the same missing piece.

---

## 2. Reading the language — `self.lang` / `self.setLanguage`

### The rule

```html
<span @text=self.lang></span>
<button on-click( () => self.setLanguage('fr-FR') )>FR</button>
```

`self.lang` is a **getter** that reads the language signal. Any bind that
touches it subscribes, so it re-renders on `setLanguage()` with no extra
machinery — the same mechanism that already re-translated marked nodes.

`self.setLanguage` is exposed because a switcher is UI: it has to be
reachable from a template's `on-click`, not just from the Lips instance.

### Grain

`self` is **one object per component**, so `self.lang` is
component-grained. A `<i18n lang=…>` block in the middle of a template
cannot give one component's `self.lang` two values at once:

```html
<!-- self.lang here is still the OUTER language -->
<i18n lang="de-DE"><i>{self.lang}</i></i18n>

<!-- but a component placed inside reports de-DE -->
<i18n lang="de-DE"><shower/></i18n>
```

Scoped translation still applies to every bind in the subtree. Only
`self.lang` is component-grained, because `self` is.

### Why not context

Making the framework read `context.lang` was considered and rejected:

- context is **one global store**, so `setContext('lang', x)` reaches
  exactly as far as `setLanguage(x)` — no new capability;
- it reserves a magic key in the app's own context namespace;
- it creates two writers for one piece of state with nothing keeping them
  in sync.

An app that wants context-driven language for its own reasons can still
have it in two lines of user space — `watchContext(['lang'], … → setLanguage(…))`
— without the framework blessing the key.

`setLanguage()` remains the single writer. Writing `lips.i18n.lang`
directly updates dictionary lookups but not the signal, so nothing
already rendered re-translates; this is now documented at the call site.

---

## 3. Stable translation keys

### The problem

Dictionaries are keyed by **source text** — the gettext model:

```json
{ "Undo": "Annuler", "Device Screens": "Dispositifs" }
```

Two consequences: identical strings with different meanings collide, and
**any reword orphans the translation**. For hand-written UI that is a
known, accepted trade. For generated UI it is not a trade at all —
rewording a label is the normal case, so translations detach on every
regeneration.

### The rule

```html
<h1 i18n="hero.title">Welcome</h1>
<input i18n i18n-placeholder="search.hint" placeholder="Search…">
```

- `i18n="key"` ids the element's own text.
- `i18n-<attr>="key"` ids that attribute.
- Bare `i18n` keeps the source-text model, unchanged.

Given a key, the dictionary is consulted for **it**, and the source text
becomes only the fallback wording. Reword the English and the French
holds.

Dictionary entries for keys are shaped exactly like text entries —
strings, region-variant objects, or formats:

```json
{
  "counter.label": "Compter",
  "counter.hint": {
    "type": "plural",
    "value": { "0": "Pas démarré", "1": "Un clic", "*": "{count} clics" }
  }
}
```

`i18n` and `i18n-*` are compiler directives and are not emitted as DOM
attributes.

### A key ids one FIXED string

Two shapes are rejected at compile time (`LIPS-C015`):

```html
<h1 i18n="k">Hello {state.name}</h1>   <!-- interpolated -->
<h1 i18n="k">a<b>x</b>c</h1>           <!-- several text runs -->
```

In the first the key would resolve the whole entry and silently drop the
interpolated value; in the second every run would render the same
translation. Both are what `@format` already exists for — it takes a
reference **and** params:

```html
<small @format="counter.hint, { count: state.count }"></small>
```

The diagnostic names that fix rather than just refusing. On error the
compiler falls back to source-text keying instead of emitting something
wrong.

`LIPS-C014` warns about `i18n-<attr>` on an element with no `i18n`
marker — a key that would translate nothing.

### Missing keys are reportable

A key that resolves to nothing is an authoring fault: the template names
an id the dictionary does not carry. A missing *source-text* entry is
just an untranslated string. Only the first is worth reporting, so
`I18N.onMissing( key, lang )` fires only for keys. The facade wires it to
a console warning under `debug`; a generator can wire it to collect gaps.

---

## 4. Scoped context — `<context>` and `<i18n lang=…>`

### The gap

`IRLips.context` is a single global store. Every component reads the same
object, so a subtree cannot be given its own value for a key. Two canvases
each wanting their own `selection` collide, and the workaround is manual
key namespacing.

### The rule

```html
<context selection=state.sel tool=state.tool>
  <board/>
</context>

<i18n lang=state.docLang>
  … document pane in the content's language …
</i18n>
```

Inside the block, `context.selection` resolves to the provided value;
outside, to the global one. Components placed inside see it **without the
parent threading inputs** — that is the whole point, and it is what
`<let>` cannot do (let names are expression scope, not context).

Both tags compile to one IR kind, `provide`; they differ only in which
field they fill.

### How it works

The layer is a plain object whose **prototype is the enclosing context**,
with one reactive getter per provided key. That single choice buys the
whole feature:

- a read of a provided key hits the own getter and tracks the layer's
  signal;
- a read of anything else walks the prototype chain into the global
  reactive store and tracks **there**, so unprovided keys stay live —
  `setContext('user', …)` still updates binds inside the layer;
- `Object.create` costs nothing per read, so a component under a provider
  pays no lookup penalty.

Nesting composes for free: an inner `<context>` prototypes off the outer
layer, so the nearest provider wins and outer provisions are still
inherited.

Components inherit `context` **and** `lang` from their call site, not
from the root — a component is a fresh *expression* scope but not a fresh
*context* scope.

### Language is not a context key

The scoped language rides on the render env, not on the context object.
It is framework state, so `<i18n lang=…>` must not collide with a
`context.lang` the app happens to own. This is the same reasoning as §2:
the framework does not reserve names in the app's context namespace.

A nullish scoped language falls back to the enclosing language rather
than to `''`.

Scoped translation applies to text binds, marked attributes, and
`@format` alike. The global signal is tracked even inside a scoped
subtree: a scoped block whose expression reads nothing else must not go
stale, and tracking one extra signal only costs a re-run that recomputes
the same string.

### Diagnostics

| code | level | when |
|---|---|---|
| `LIPS-C016` | error | spread on `<context>` — provided keys must be known at compile time |
| `LIPS-C017` | warning | `<context>` that provides nothing |
| `LIPS-C018` | error | `<i18n>` with no `lang` attribute |

### 4.1 Ownership — writes land on the nearest layer

Provision alone is half a provider: a subtree that can read its own
`selection` but whose writes go to the global store still collides with
its siblings. So `setContext` resolves the same way reads do.

```html
<context selection="node-a"><board/></context>
```

`this.setContext('selection', …)` from anywhere inside that subtree —
including from a component several levels down — writes to **the layer**,
not the global store. A key no layer declares still falls through, so a
tree with no providers behaves exactly as before.

The walk is over the prototype chain the layers already form, so
ownership needs no registry: a layer owns exactly the keys it declared,
and both the signals and the ownership vanish when the block is disposed.
There is no unregister step and nothing left behind.

**Literal keys are owned; expression keys are derived.** The distinction
falls out of what the author already wrote, with no extra syntax:

| declaration | effect | a local write |
|---|---|---|
| `selection="node-a"` | seeded once, no effect | sticks |
| `selection=state.sel` | effect re-syncs from the source | holds until the source next changes |

So `<context sel="…">` is how a subtree gets state **of its own**, and
`<context sel=state.sel>` is how a parent **drives** one.

### 4.2 `onContext` sees the effective context

`onContext` used to be wired to the host's global store, so a scoped
override never fired it while bindings reading the same key updated
normally — the one place where declared and rendered context disagreed.

It now tracks the **effective** context with its own effect: reading a
key hits the layer's own getter when a `<context>` provides it and falls
through to the global proxy when it does not, so both notify through the
same path. The `watchContext` runtime option this replaced is gone rather
than left as dead plumbing.

### 4.3 `watchContext`, not `context`

The template field is now `watchContext`:

```ts
export const watchContext = ['theme']
```

It declares which context fields fire `onContext` — it never declared
what the component reads, because bindings that read `context.x` are
tracked individually and update whether or not `x` is listed. The old
name said the opposite of that. `context` still works and means the same
thing.

---

## 5. Loading — initial language and dictionaries

### 5.0 `LipsConfig.lang`

`I18N.currentLang` was initialised from `window.navigator.language` at
construction: not configurable, and it threw on any host without a
`navigator`.

```ts
const lips = new Lips({ lang: 'fr-FR' })
```

Resolution order is `config.lang` → `navigator.language` → `'en-US'`. The
browser language stays the default, so following the user's locale is
still what happens by default; the constant is a last resort for SSR,
workers, and non-DOM test runners, not a policy.

---

### 5.1 Lazy dictionaries

Bundling every language up front costs every user all of them. A loader
resolves one language root on demand:

```ts
lips.i18n.setLoader( id => import(`./languages/${id}.json`).then( m => m.default ) )
```

`setLanguage()` **switches first and resolves second**: the language
changes immediately, showing source wording — real text, not a blank —
and the strings settle when the dictionary lands. That ordering is only
safe because an untranslated string is already the defined fallback (§3).

Making it re-render needed one new piece. The language signal alone would
not fire, because the language never changed — only what it resolves to.
So dictionaries carry a **revision** that translated binds track
alongside the language, bumped whenever one is registered. That also
makes a plain `setDictionary()` at runtime re-translate what is already
on screen, which it previously did not.

Each root is attempted once. A rejected load is remembered, so a missing
language file does not re-fetch on every switch, and a language already
registered never calls the loader at all.

---

## 6. Deferred

**A subtree that provides for itself.** `<context>` values come from the
enclosing scope. A component cannot declare "I provide `selection` to my
own children" without its parent wrapping it — provider-by-component
rather than provider-by-block.

**Scoped `onContext` for keys a layer adds.** A component watching a key
that only exists inside a layer works, but `watchContext` is a static
list on the template, so it cannot vary per placement.

**Dictionary granularity.** The loader resolves one dictionary per
language root. Splitting by route or feature — the natural pairing with
code-splitting — has no expression.

**Bundle: Stylis is eager.** ~4.4 KB gzipped, ~16% of the full entry,
pulled in by `setStylePreprocessor` in `lips.ts`. Making it opt-in the
way `setCompiler` already is would let apps with no nested CSS drop it,
at the cost of nesting silently not working unless opted in — a product
decision, not a cleanup.

---

## 7. Resolved decisions

1. **`self.lang`, not `context.lang`.** Context is one global store, so
   routing language through it adds a reserved key and a second writer
   for no new capability.
2. **`self.lang` is component-grained.** `self` is one object per
   component; a mid-template scope cannot give it two values.
3. **Keys are opt-in.** Bare `i18n` keeps the gettext model. Existing
   templates and dictionaries are untouched.
4. **A key ids one fixed string.** Interpolated text goes through
   `@format`, which already takes a reference plus params.
5. **Missing *keys* are reported; missing source-text entries are not.**
   Only the first is an authoring fault.
6. **Scoping is prototype chaining.** It gives inherited lookup, live
   fall-through, and free nesting in one line, with no per-read cost.
7. **Scoped language lives on the env, not in context.** Framework state
   must not collide with an app's own `context.lang`.
8. **`navigator.language` stays the default.** `LipsConfig.lang` overrides
   it; `'en-US'` is only reached where there is no navigator at all.
9. **Ownership follows the read path.** `setContext` resolves through the
   same prototype chain as a read, so a layer owns exactly what it
   declares and teardown is automatic.
10. **Literal vs expression decides owned vs derived.** No new syntax: a
    seeded key is the subtree's own state, an expression-bound key is
    driven by its source.
11. **`onContext` tracks the effective context.** Declared and rendered
    context must not be able to disagree.
12. **Language switches before the dictionary arrives.** Source wording
    is a defined fallback, so there is nothing to wait for; a revision
    signal back-fills the translation.
13. **Quoted handlers are an error, not a second syntax.** `on-x( … )`
    stays the one form; `on-x="…"` is reported (LIPS-C020) and the dead
    attribute is dropped rather than emitted.
