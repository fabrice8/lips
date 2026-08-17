# RFC-005 — Language and context: reading, keying, scoping

**Status:** implemented
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

### What is still global

`setContext` writes to the global store from anywhere. Scoping is
**provision**, not ownership: a subtree can be *given* a value, but there
is no mechanism for a subtree to own a key and tear it down. `onContext`
likewise watches the global store. Both are noted here as the remaining
asymmetry rather than fixed — see §6.

---

## 5. `LipsConfig.lang`

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

## 6. Deferred

**Owned context.** A subtree can be given a key but cannot own one.
`setContext` writes globally from anywhere with no teardown. A provider
that also *owns* its keys — writes scoped to the layer, cleaned up with
it — is the natural next step, and is what a `<context>`-local
`setContext` would need.

**`onContext` under a layer.** `def.context` subscriptions watch the
global store, so a scoped override does not fire `onContext`. Binds
reading `context.x` inside a layer are correct; only the declared-hook
path is not. Unifying them means routing the watch through the effective
context rather than the host.

**The `context: [...]` field's name.** It reads as "the context this
component uses" but only controls whether `onContext` fires; bindings
update regardless. Documented, still misleading.

**Lazy dictionaries.** `setDictionary` is eager and synchronous. Nothing
supports loading a language on demand.

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
