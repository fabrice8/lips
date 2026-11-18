# RFC-007 — Untrusted templates: the security model

**Status:** implemented · 2026-11-18
**Depends on:** RFC-001 §5 (expressions, IR), RFC-006 §4.1 (the host seam)
**Corrects:** RFC-001 §2 and §5, RFC-002's sketch-board table, RFC-003 Phase 1 —
each described the interpreted mode as fit for untrusted embeds

---

## 1. Context

RFC-001 introduced two expression executors and called the second a
sandbox. That was half true. The interpreted mode is **CSP-safe**: it never
builds a `Function`. But it restricted only the *names* an expression could
start from. What the expression could reach from there — members, calls,
writes, the objects its globals were — was unrestricted, and everything else
a template supplies (markup, attributes, styles, component names) reached the
page unchecked. Modela's published UIs are meant to run generated templates on
pages Lips does not own, so the gap is Lips's to close.

This RFC says what a template you did not write may touch, closes every route
Lips can close itself, names the ones it leaves to the page, and makes each
mode claim only what it guarantees.

Cosense is not a consumer: it decided that what a module, partner or tenant
supplies is never a Lips template. The fix is for Lips's own promise.

---

## 2. Threat model

### 2.1 Untrusted and trusted

**Untrusted:** everything about a template that can arrive as data — `default`,
`macros`, `stylesheet`, a precompiled `ir` or `style`, `state`, `static` — and
every value built from it at runtime: template objects, tag names, attribute
maps, URLs, CSS values.

**Trusted:** functions, and what the host supplies. A `handler` is JavaScript;
whoever hands Lips a function already runs code in the page. The same holds for
`input`, the instance's `context`, and the components the host registers.

### 2.2 Authority is what the host hands in

An untrusted template may use:

- the data it is given — read and written as data;
- the functions it is given — handler methods, functions in its data, and the
  component API on `self` (`state`, `lang`, `emit`, `on`, `setContext`, …);
- its own subtree, through the template language;
- the globals the policy offers, and nothing else from the realm.

It must not reach: the page (`window`, `document`, nodes it did not render, the
URL and history); the realm's shared objects (prototypes, constructors, the
page's own globals) as values or as targets of a write; anything that runs
script or loads a document; anything that acts on the whole page (`<base>`,
`<meta>`, `<link>`, unscoped CSS, `@import`, the router's globals); the host's
DOM by name (`document` clobbering, `form=`).

### 2.3 Out of scope — and what covers it

| Not closed by Lips | Why | What covers it |
|---|---|---|
| Loads from allowed URLs — sending out data it was given | images and `url()` are what UIs are made of | CSP (`img-src`, `connect-src`, `form-action`), or a stricter `policy.url` |
| Availability — an unbounded `<for>`, deep recursion | a template can always spend its own thread | a worker, an iframe, a watchdog |
| Layout and UI redress — overlays | needs a CSS engine to police | a container with `contain: paint`, shadow DOM, an iframe |
| Window-level named properties for globals the page never defined | Lips cannot know what the page reads by name | not reading globals by name; shadow DOM |
| ID references acted on by a click — `popovertarget`, `commandfor`, `for` | need a user gesture, like redress | shadow DOM, or a stricter `policy.attr` |
| Side channels | — | an iframe |

**Lips does not lean on CSP for anything it can refuse itself.** A strict CSP is
still recommended underneath — the second wall, not the first.

---

## 3. What each mode guarantees

| mode | expressions run by | guarantees | does not guarantee |
|---|---|---|---|
| `compiled` (default) | one cached `Function` each | speed | anything about untrusted code — templates are code |
| `interpreted` | an AST walker | no `eval`/`Function`, so a CSP without `unsafe-eval`; names resolve to scope, metavars and its globals table | a boundary |
| untrusted — `new Lips({ untrusted: untrusted() })` | a guarded AST walker | §2.2, enforced at runtime and reported at compile time; no `eval`/`Function` | §2.3 |

The trusted modes keep their behaviour and speed: the guard is chosen when an
expression is wired, never tested per evaluation (§7).

---

## 4. The routes, and where each is closed

| Route | Closed by | Compile time | Runtime |
|---|---|---|---|
| Expressions: names, members, calls, writes, the values they hold | Lips | U001–U005 | guarded evaluator |
| Event objects handed to inline handlers | Lips | — | handlers get the policy's snapshot |
| Handler arguments — host values a template receives | Lips | — | `policy.value` on every value it holds |
| `console` | Lips | U001 (not offered) | not offered |
| `@html` | Lips | — | parsed inert, held to the element and attribute rules |
| Elements that run script, hold a document, or act on the page | Lips | U010 | host refuses; skeletons swept |
| Dynamic tags | Lips | U010–U012 for literals | host refuses |
| Custom elements, `is=` | Lips | U021 | host refuses (U011, U021) |
| Attributes: `on*`, URLs, `srcdoc`, `formaction`, clobbering, `form=` | Lips | U020–U022, U030 | host refuses |
| Spreads | Lips | — | host refuses per key |
| Stylesheets: `@import`, `url()`, loading functions, expressions | Lips | U040, U041, U030, U001–U005 | a sheet with a refusal ships empty |
| Inline `style=`, reactive declarations | Lips | U030, U040, U041 | host refuses |
| Precompiled `ir` | Lips | — | skeleton swept before first use |
| Precompiled `style`, or a stylesheet in a definition built from data | Lips | — | not injected (U042) |
| Template objects built from data | Lips | compiled under the same policy | — |
| Macros | Lips | the macros source is checked too | — |
| Slots | by construction | content is compiled with the template that wrote it | rendered by that template's renderer |
| Context | by construction | — | the instance's own store |
| Router | Lips | U012 | refused by name, too |
| Loads from allowed URLs | CSP / policy | — | — |

Lips reports at compile time **and** enforces at runtime. A precompiled IR, a
template object built from data, a URL that only exists at runtime — none of
these meet the compiler, so the runtime holds the line on its own. Compile time
is where a refusal gets a position, so a generator can be told what to fix.

---

## 5. Design

### 5.1 One policy

```ts
interface TemplatePolicy {
  globals: Record<string, unknown>                       // names besides metavars and scope
  member( key: string, write: boolean, obj?: unknown ): Verdict
  self( key: string, write?: boolean ): Verdict          // the component's own self
  value( v: unknown ): Verdict                           // may a template hold this?
  event( e: Event ): object                              // what a handler receives
  tag( name: string ): Verdict
  component( name: string ): Verdict
  attr( tag: string, name: string, value?: string ): Verdict   // `@html` is asked as an attribute
  url( value: string ): Verdict
  css( text: string ): Verdict
  report( refusal: Refusal ): void                       // runtime refusals outside an expression
}
type Verdict = Refusal | undefined                       // undefined allows
interface Refusal { code: string, message: string, hint?: string }
```

Every check asks this one object. Its methods call each other through `this`,
so a host replaces one rule and every place that depends on it follows:

```js
untrusted({ ...untrustedPolicy, url: v => sameOrigin( v ) ? undefined : refusal })
```

**The default policy**, `untrustedPolicy`:

- **globals** — frozen copies, never the page's objects: `Math`, `JSON`
  (`parse`, `stringify`), `Object` (`keys`, `values`, `entries`, `fromEntries`),
  `Array` (`isArray`, `from`, `of`), `String`, `Number`, `Boolean` and `Date` as
  plain calls with chosen statics, `parseInt`, `parseFloat`, `isNaN`,
  `isFinite`, the URI codecs. A write to one, or a member not offered, is
  refused (U003).
- **members** — the prototype machinery is refused (`constructor`,
  `__proto__`, `prototype`, the `__define/lookup*` accessors, `caller`,
  `callee`); everything else is data.
- **self** — read-only; `node` refused.
- **values** — DOM nodes, windows, events and the code constructors are
  refused, this realm's or another's.
- **events** — a snapshot: key and pointer fields, `target`/`currentTarget` as
  `{ value, checked, name, id, type, tagName, dataset }`, `preventDefault`,
  `stopPropagation`.
- **tags** — refused: elements that run script or hold a document
  (`script`, `iframe`, `frame`, `object`, `embed`, …), act on the whole page
  (`base`, `link`, `meta`, `style`, `title`, `html`, `head`, `body`), carry
  content no element check follows (`template`, `noscript`, …), or animate
  attributes (SVG `animate`, `set`, …). A name with `-` is a custom element.
- **components** — `router` refused: it owns the page URL and globals.
- **attributes** — `on*`, `srcdoc`, `is`, `form` refused; `id`/`name` that would
  shadow a `document` property refused; `style` held to `css`; URL attributes
  (`href`, `src`, `action`, `formaction`, `srcset`, `ping`, …) held to `url`.
- **URLs** — relative, `http(s):`, `mailto:`, `tel:`, raster `data:image/…`;
  read the way a URL parser reads them (tabs, newlines, leading controls gone).
- **CSS** — read the way the browser reads it (comments gone, escapes
  decoded): `@import` refused (U040); `image-set()`, `image()`, `cross-fade()`,
  `element()` refused (U041); every `url()` held to `url`.

### 5.2 Three enforcement points

**Compile time — `checkTemplate( policy )`**, a `CompileOptions.check` hook. The
compiler runs it on the parsed template and on the macros source before either
compiles. Each refusal is a positioned diagnostic; a refused element or
attribute is removed, and a refused expression becomes `undefined`. Expressions
are checked with token positions the parser now records (`at`), so the
diagnostic points at the member or name, not at the attribute.

**Expressions — the guarded evaluator.** The same AST and semantics as the
interpreted mode, in a separate walker so the trusted one stays as it was. A
value becomes visible to a template in one of four ways — a name, a member read,
a call's result, an arrow's argument — and each goes through `policy.value`.
Every member, read or written, goes through `policy.member`, or `policy.self`
for an object the runtime marked as a component's `self`. A refusal throws a
`PolicyError` into the component's `onError`: an expression that cannot finish
must not finish with something else.

**The page — the guarded host.** RFC-006 gave every node operation one seam,
the `Host`; the untrusted DOM host is the default one held to the policy:

- a block skeleton is parsed once into an inert `<template>` and swept —
  refused elements become a hidden stand-in that keeps their children (so
  skeleton paths still resolve), refused attributes are removed, an element that
  carried `is` is rebuilt without it;
- `@html` goes through the same parse and sweep, then moves in — nothing is
  serialized and re-parsed;
- each element created, attribute set, style variable written and listener
  wired afterwards is asked one at a time.

The host never throws — a render cannot be half-aborted — so a refused write is
skipped and goes to `policy.report`.

**Stylesheets.** The facade compiles a sheet through the policy: the scanner's
`lint` hook reports `@import` and loads per statement, expressions are checked
where they are written, and a whole-sheet check catches what no statement saw. A
sheet with any refusal ships empty. Only sheets the instance compiled from
source and found clean are injected; a precompiled `style` was never scoped by
Lips and cannot be checked without a CSS parser, so it is not injected (U042).
IR is different: its skeleton *can* be checked, by the browser's own parser.

**Components.** The instance's component lookup asks `policy.component`; a
refused name renders nothing.

### 5.3 Refusal codes

| code | refused |
|---|---|
| LIPS-U001 | a name nothing provides |
| LIPS-U002 | prototype machinery; a computed key that is not a string or number |
| LIPS-U003 | a global member not offered, or a write to one |
| LIPS-U004 | holding a platform object or a code constructor |
| LIPS-U005 | `self.node`; a write to `self` |
| LIPS-U010 | an element |
| LIPS-U011 | a custom element |
| LIPS-U012 | a component |
| LIPS-U020 | an event-handler attribute |
| LIPS-U021 | `srcdoc`, `is`, `form` |
| LIPS-U022 | an `id`/`name` that shadows a `document` property |
| LIPS-U030 | a URL scheme |
| LIPS-U040 | `@import` |
| LIPS-U041 | a CSS function that loads without `url()` |
| LIPS-U042 | a stylesheet Lips did not compile |

At compile time each is a `TemplateDiagnostic` (`code`, `line`, `col`, `hint`).
At runtime, inside an expression, a `PolicyError` (`code`, `hint`) in
`onError`; at the page boundary, a `policy.report` call.

---

## 6. The option

```js
import Lips from '@lipsjs/lips'
import { untrusted, untrustedPolicy, checkTemplate } from '@lipsjs/lips/untrusted'

new Lips({ untrusted: untrusted() })
new Lips({ untrusted: untrusted({ ...untrustedPolicy, url: sameOriginOnly }) })
compileTemplate( src, { check: checkTemplate( untrustedPolicy ) } )   // diagnostics only
```

`LipsConfig.untrusted` takes what `untrusted( policy? )` builds: the compile-time
check, the style hook, and the runtime pieces.

- **The host decides, not the template.** Trust cannot be a field of the
  template object: the untrusted party writes that object and would leave it
  out.
- **Per instance.** Everything an untrusted instance renders is untrusted,
  including template objects it builds and components it names. A host's own UI
  stays on its own instance. A per-component flag inside one tree would have to
  track where every template object came from; per instance, nothing can be
  half-trusted.
- **Passed by value, from its own entry.** Measured inside the full build, the
  policy cost every app 5.6 KB gzipped. As `@lipsjs/lips/untrusted` it costs
  only the apps that import it, as `messageFormat` and `stylePreprocessor`
  already do. It also works with `./runtime` for precompiled templates: their
  skeletons are swept on first use.
- **Not `mode: 'untrusted'`.** `mode` chooses how trusted expressions run.
  Untrusted is a different question — what a template may reach — and it governs
  markup, styles and components too. Under a guard `mode` is ignored, so no
  combination of options switches it off.

---

## 7. Cost

**Trusted modes.** The expression runner picks the guard when a bind is wired
(`guard ? guard.run : …`), and the handler-name fallback consults it only when
it is there. No per-evaluation work changes. The interpreted mode's name tables
became prototype-free literals — the same lookup.

**Bundles** (gzip, local bun): full 33.72 → 33.91, `./runtime` 14.90 → 15.05,
`./precompile` 13.95 → 14.05; the new `./untrusted` entry 9.21, about 60 % policy
and 40 % the expression parser it needs to check expressions where they are
written. The core carries the seam (two guard hooks, the `self` mark, the facade
passing the pieces through), token positions, and the fixes in §8.

**Untrusted mode.** A member read costs a policy call and a value check —
slower than the interpreter, which is itself off the hot path because
dependencies are precise.

---

## 8. Fixes that apply to the trusted modes too

Found while mapping the routes; each has a spec in `tests/untrusted.spec.ts`.

- **Name tables answered through `Object.prototype`.** The interpreter's arrow
  frames and globals table were `{}`, so an identifier like `constructor`
  resolved to `Object`. The compiled mode's rename table had the same lookup and
  emitted the source text of `Object` in place of the name. Both tables are now
  `__proto__: null`.
- **A comment that did not round-trip.** A comment starting with `>` or `->` is
  read differently by the template parser and the browser; the compiler now
  emits it so both read one comment.
- **An unquoted scope name.** A name containing a quote closed the stylesheet's
  scope selector, and the injector's `<head>` lookup. Both quote it now.

---

## 9. Deferred

- **Sealed IR.** A precompiled skeleton is swept at runtime, which is enough;
  a host that compiles untrusted templates on a server could sign the IR instead,
  if the sweep ever shows up in a profile.
- **A CSS parser for precompiled styles.** Refusing them (U042) is the honest
  default until one exists.
- **The handler-name fallback calls unbound.** `on-click( emit, … )` fails in every
  mode because `self.emit` is called without its `this`. Unrelated to this RFC;
  noted for a fix of its own.
- **Resource limits.** A cap on `<for>` ranges or evaluation steps could live in
  the policy; nothing asks for it yet.

---

## 10. Resolved decisions

1. **One policy, three enforcement points.** Compile time reports, the
   evaluator and the host enforce, and all three ask the same object.
2. **Runtime enforcement does not depend on the compiler.** IR, template
   objects and runtime values never meet it.
3. **A separate guarded evaluator,** not a flag in the trusted one: the trusted
   hot path stays untouched, and the guarded one stays small enough to audit.
4. **The host is the page boundary.** RFC-006's seam already sees every node
   operation; the guard sits there instead of at a dozen call sites.
5. **Skeletons are swept by the browser's parser,** in an inert template, so
   what Lips checks is exactly what the browser built.
6. **Refusals are diagnostics.** Positioned at compile time; thrown into
   `onError` inside an expression; reported at the page boundary, where
   throwing would half-abort a render.
7. **Authority is what the host hands in.** Data it gives can be written;
   functions it gives can be called. Lips does not track where a value came
   from.
8. **`@html` is sanitized by the same rules,** not refused: the sweep the
   skeletons need is the sanitizer.
9. **`<log>` stays; `console` goes.** `<log>` is Lips calling `console.log`
   with values; the template never holds `console`.
10. **The router is refused by default.** It writes page globals and history;
    pages switch on state instead.
11. **Opt-in entry, passed by value.** Most apps never render an untrusted
    template and should not ship the policy.
