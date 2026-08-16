# RFC-004 — Style IR: reactive declarations for component stylesheets

> Status: draft for review · 2026-08-15
> Prereqs: [RFC-001](./template-ir.md) shipped (IR engine default), instance salvage landed
> Related: [RFC-003](./modela-vision.md) — Modela consumes Layer 2, and only Layer 2

## 1. Context

Lips is fine-grained everywhere except one place. Text, attributes, props and events are
bound per key and update exactly what changed. The `stylesheet` key is the single part of a
component that **cannot react at all** — it is compiled once, injected once, and frozen for
the life of the component.

The escape hatch today is `style=` on an element. That has two costs:

1. **A component's appearance splits across two places** based on an implementation detail —
   whether a value happens to be constant. The same category of break as reaching for
   `innerHTML` to render dynamic text.
2. **It does not cover the space.** `style=` cannot express pseudo-classes, media queries or
   keyframes. So a reactive value in any of those contexts is not awkward in Lips today, it
   is *unreachable*:

```css
.btn:hover { background: {state.accent} }   /* no way to write this */
```

There is a second, unrelated defect in the same area. `precompile.ts` emits stylesheets as
**source**, and the `./runtime` build ships no CSS preprocessor — so `Stylesheet.load()`
warns and returns ([src/stylesheet.ts](../src/stylesheet.ts)). **The CSP-safe precompiled
build cannot render a styled app.** That is a hole in a headline promise, not a missing
feature, and it is fixed by the same work.

## 2. The lens

> **Lips-first.** Every decision in this RFC is justified by what Lips needs as a
> fine-grained UI framework. Modela is downstream and gets a vote on nothing here.

RFC-003 carries a standing hedge: Lips must stand alone regardless of Modela's fate. Applying
that lens is what produced the layer split in §4 — and it inverts the design a
Modela-first reading would have produced. The test each item must pass: *would this be worth
building if Modela were cancelled tomorrow?* Layer 1 passes unconditionally. Layer 2 does not,
and is therefore deferred.

## 3. Goals / non-goals

**Goals**
1. Any declaration value may be an expression: `padding: {state.gap}px`
2. Reactivity is per declaration — O(changed), like every other bind
3. The injected sheet is **immutable** for the life of the component; updates touch no CSSOM
4. StyleIR is JSON-serializable and precompilable; the runtime build ships no CSS compiler
5. Zero change to the authoring surface for static CSS — existing components keep working
6. Reuse the existing bind machinery (`guarded()`, dispose handles, `onError`) — no parallel
   reactive system

**Non-goals (Layer 1)**
- Dynamic selectors or dynamic at-rule conditions — both are compile errors (§11)
- Runtime rule insertion/removal — that is Layer 2 (§14)
- Replacing the stylesheet across `swap()` — Layer 2
- A general CSS parser. Layer 1 needs a value scanner, not a parser (§5)

## 4. Two layers, and why the seam is here

|                       | Layer 1 — reactive declarations | Layer 2 — rule structure |
|---|---|---|
| Who needs it | Lips | swap / HMR / Modela |
| Unit of change | one declaration | one rule |
| Mechanism | CSS custom properties | CSSOM `insertRule`/`deleteRule` |
| Sheet after injection | immutable | mutated |
| Needs a CSS parser | no | yes |
| Needs stable rule identity | no | yes |
| Needs at-rule modelling | no | yes |

The Lips-first lens forces the mechanism, and the mechanism is the opposite of what a
Modela-first reading gives. **Custom properties are the mechanism; CSSOM surgery is not
needed for reactivity at all.** A component's rule set is fixed at compile time — Lips has no
use for adding a rule at runtime. Only *structural revision* wants that, and structural
revision is swap.

Consequence: Layer 1 ships with essentially no new runtime, and Layer 2 becomes a separable
later layer that can be designed against evidence instead of guesses.

## 5. Pipeline

```
stylesheet source
  │  scanner  — find {expr} in declaration values ONLY
  │            • replaces each with var(--lN) or calc(var(--lN) * 1unit)
  │            • must run BEFORE Stylis: a brace in a value breaks its block parsing
  ▼
  Stylis     — nesting flattened, vendor prefixes applied, scope wrap resolved
  ▼
  StyleIR ──────────────► JSON (precompiled module / Modela artifact)
  │
  ▼
  runtime: inject css text once → bind --lN on the scope roots
```

Everything expensive happens at build time. Stylis becomes a **compile-time dependency
only** — the runtime injects flat, scoped, prefixed text and never calls a CSS compiler.

The scanner tracks value context (after `:`, before `;` or `}`) rather than parsing CSS.
That is the whole reason Layer 1 is small.

## 6. The IR

```ts
interface StyleIR {
  v: 1                 // format version — swap refuses mismatches, as TemplateIR does
  css: string          // post-Stylis: flat, scoped, prefixed. Injected verbatim.
  exprs: string[]      // expression source table, deduped (mirrors TemplateIR.exprs)
  binds: StyleBindIR[]
  props?: PropertyIR[] // @property registrations (§10)
}

interface StyleBindIR {
  prop: string         // '--l0', or the author's own name for a direct bind (§7.4)
  e: number            // index into exprs
}

interface PropertyIR {
  name: string         // '--l0'
  syntax: string       // '<length>' | '<percentage>' | '<number>' | '<color>' | '*'
  inherits: boolean
  initial?: string
}
```

Example 1 of §7 compiles in full to:

```json
{
  "v": 1,
  "css": "[rel=\"progress-bar\"] .track{background:#1a1a1c;border-radius:999px;overflow:hidden}[rel=\"progress-bar\"] .fill{height:6px;background:#ededef;width:calc(var(--l0) * 1%)}",
  "exprs": [ "state.percent" ],
  "binds": [ { "prop": "--l0", "e": 0 } ]
}
```

Note what is absent: no rule list, no selector modelling, no at-rule tree. Layer 1 does not
need to understand the CSS it emits — only the values it lifted out of it.

## 7. Authoring rules

### 7.1 Units — the source disambiguates

`{expr}` **alone** is used verbatim. `{expr}` **followed by a unit token** compiles to
`calc(var(--lN) * 1unit)` and the expression must yield a number.

```css
width:   {state.pct}%              /* calc(var(--l0) * 1%)   — expression yields 62      */
padding: {state.box}               /* var(--l1)              — expression yields "1rem 2rem" */
margin:  0 {state.gap}px           /* 0 calc(var(--l2) * 1px)                            */
```

This keeps the common case readable without making the compiler guess, and it is what lets
§10 infer `@property` syntax for free.

### 7.2 Scope

A stylesheet is per component, so its expressions see the **component-level** scope:
`state`, `input`, `static`, `context`, `self`.

They cannot see `<for>` iterators or `<let>` names — those are template-position-local, and a
sheet has no position. This is a hard boundary, reported as `LIPS-S003`.

### 7.3 Nullish → `unset`

A nullish expression calls `removeProperty`. No implicit fallback is emitted; the declaration
collapses to `unset`. Authors opt into a fallback explicitly, which compiles to the second
argument of `var()`.

This is deliberate, and it buys §12.2 for free.

### 7.4 Direct custom-property binds

When a declaration's property is **already** a custom property and its value is a lone
interpolation, bind the author's name directly — do not alias through `--lN`:

```css
--accent: {input.accent}      /* binds --accent, NOT --l0: var(--accent) */
```

This is not a micro-optimisation. It is **load-bearing for §12.2 and §13** — inheritance
fallthrough and Tailwind interop both require the name to be stable and meaningful across
component boundaries.

## 8. Runtime semantics

**Where the variable is written.** On the component's scope roots — the same elements
`stampScope()` already stamps `rel` on ([src/ir/runtime.ts](../src/ir/runtime.ts)). A
component with several top-level roots gets the variable on all of them.

**Why that is correct.** The injected rule is scoped `[rel="nsp"] …`, so every element it
matches is the scope root or a descendant. Custom properties inherit, and an inline custom
property applies to the element itself as well as its subtree. So one write per root covers
every match.

**Why that is a feature.** The sheet is shared per component *type* and refcounted by
`dindex`; the variables are per *instance*. Ten `<progress-bar>`s cost **one** injected rule
and ten variable writes. Emotion and styled-components generate a class per distinct value
combination — O(distinct values) rules and constant class churn. This is O(1).

**Lifecycle.** A style bind is an ordinary bind. It uses `guarded()`, returns a dispose
handle, and routes failures to the component's `onError` boundary. Disposal is by ownership,
like everything else.

**Ordering.** Variables must be written before the nodes go live, alongside the existing
`stampScope` call — otherwise the first paint resolves `var()` against nothing.

**Across `swap()`.** A rebuild produces fresh roots, so binds re-attach and variables
re-stamp exactly where `stampScope` is re-called today. Replacing the *sheet* is Layer 2;
until then `swap` keeps the sheet it has, which is the current behaviour and no worse.

## 9. Cascade layers

`Stylesheet` gains an optional `layer` setting. Present, the wrap becomes:

```css
@layer <name> { [rel="nsp"] { … } }
```

**Default is absent, and absent is byte-identical to today's output.** Non-Tailwind users are
unaffected in every respect.

Rationale: a Lips scoped rule is `[rel="x"] .btn` — specificity `(0,2,0)` — which already
beats a Tailwind utility's `(0,1,0)`. Tailwind v4 makes it absolute rather than a
specificity race by wrapping everything in `@layer`, and **unlayered styles beat layered ones
regardless of specificity**. So a Tailwind user's utilities silently lose to the component
sheet with no way to win. A `layer` opt-in fixes it in two lines here and is an ugly
migration if retrofitted later.

## 10. `@property` registration

A unit-suffixed slot (§7.1) is registered as `<number>` — **not** as the unit's own type:

```css
@property --card-0 { syntax: "<number>"; inherits: true; initial-value: 0 }
```

The unit was lifted into `calc(var(--card-0) * 1%)`, so what the bind writes is a bare
number. Registering `<percentage>` and then writing `75` makes the value invalid, and a
registered property silently falls back to its `initial-value` — every unit-suffixed
declaration computes to zero. This was caught only in a real browser; jsdom does not run the
cascade, so the jsdom suite was green throughout.

Registration makes a custom property **interpolable**. The payoff is not transitioning one
declaration — it is that one registered variable transitions everything reading it, in
lockstep, from a single line:

```css
--accent: {state.brand};
transition: --accent .3s ease;

.btn       { border: 1px solid var(--accent); color: var(--accent) }
.btn:hover { background: var(--accent) }
.hero      { background: linear-gradient(120deg, var(--accent), transparent) }
```

Border, text, hover fill and the gradient stop ease together. Unregistered, the variable flips
instantly and the gradient stop cannot interpolate at all.

**Limits.** Only unit-suffixed slots are registered. A bare `{expr}` is used verbatim, so its
type is unknown and it stays unregistered — which behaves exactly as today. Colours therefore
do not animate yet; registering them needs an author annotation, and that is deferred until
someone asks for it.

## 11. Diagnostics

Style diagnostics take their own `LIPS-S*` range, sharing the `TemplateDiagnostic` shape so
they flow through the existing `CompileResult` channel.

| Code | Severity | Condition |
|---|---|---|
| `LIPS-S001` | error | interpolation in a selector — selectors are static (Layer 2) |
| `LIPS-S002` | error | interpolation in an at-rule condition — `@media`/`@container` conditions cannot read custom properties |
| `LIPS-S003` | error | expression references a name outside component scope (`<for>` iterator, `<let>`) |
| `LIPS-S004` | error | unterminated interpolation |
| `LIPS-S005` | warning | unit suffix on an expression that is a literal string |

Both structural cases fail **loudly**. Silently doing nothing is the worst outcome: the author
sees a stylesheet that compiles and a page that ignores it.

## 12. What Layer 1 unlocks

Beyond closing the reachability gap and the precompile hole, these fall out of choosing custom
properties as the mechanism rather than being designed in:

**12.1 Native animation of state.** §10 — state assignments animate on the browser's own
timeline. No JS loop, no animation library, no keyframes.

**12.2 Cascade-based theming, zero wiring.** Custom properties inherit; §7.3 removes the
property when nullish; §7.4 keeps names stable across components. Therefore:

```js
const app    = { state: { accent: '#ededef' }, stylesheet: `--accent: {state.accent};` }
const button = { stylesheet: `--accent: {input.accent}; .btn { border-color: var(--accent) }` }
```

`<button accent="#f87171"/>` uses its own; `<button/>` inherits the app's. *"Use mine if
given, otherwise inherit"* — the most common theming requirement — costs zero lines and no
context wiring.

**12.3 State as a CSS-queryable condition.** With container style queries, a parent's state
reaches an arbitrarily deep descendant without inputs, context, or either component knowing
about the other:

```css
/* parent */  container-type: inline-size; --density: {state.density};
/* child   */  @container style(--density: compact) { .row { padding: 4px } }
```

Prop drilling stops existing for anything expressible in CSS.

**12.4 Critical CSS extraction is the artifact shape.** Layer 1 separates static rule text
from dynamic values by construction, so the static half is already a complete `.css` file —
emittable at build time, cacheable, `<link>`-served, no FOUC. CSS-in-JS libraries need
dedicated static-extraction plugins to approximate this and mostly do it badly, because they
cannot tell which values are constant. Here the compiler knows exactly.

**12.5 The reactive surface is public DOM.** Values are custom properties on a real element,
so devtools shows them live and anything can write them — `gsap.to(el, { '--w': '80%' })`
composes, because the bind only writes when state changes. Contrast React inline styles,
which get clobbered on every re-render.

**12.6 Dynamic styles become testable in jsdom.** jsdom does not apply stylesheets
meaningfully, so component styles are effectively untestable in the current suite. Inline
custom properties read back fine — verified: `getPropertyValue('--pad')` returns `12px` after
a state write. Styles join the existing test story with no new infrastructure.

**12.7 Readable variable names in dev builds.** Emit `--fill-width` rather than `--l0` when
not minifying, turning devtools into a live view of a component's reactive style state.

## 13. Interop

**Tailwind.** The two occupy different keys — Tailwind on `class=` in `default`, Layer 1 in
`stylesheet` — and compose through custom properties, which is Tailwind's own sanctioned
escape for dynamic values. Declare in the sheet, consume as arbitrary values:

```js
default:    `<div class="border-[var(--accent)] w-[var(--w)]">…</div>`,
stylesheet: `--accent: {input.accent}; --w: {state.pct}%;`
```

This also removes Tailwind's worst footgun. Constructed class names (`text-{input.tone}-400`)
are invisible to Tailwind's static scanner and force a safelist; driving a custom property
instead makes the problem disappear.

Honest limit: a Tailwind maximalist writes no component stylesheets, so most of Layer 1 is
dead weight to them — `hover:bg-[var(--accent)]` already works. Layer 1's audience is people
writing real component CSS. The precompile fix is the unconditional justification either way.

**Existing components.** Static CSS is untouched. The only compatibility risk is a literal
brace in a value — `content: "{}"`, `@supports` conditions — which needs an escape and a
scanner that tracks value context.

**Scoping, pre-existing and worth knowing.** The wrap is `[rel="nsp"] { … }`, so a class rule
compiles to a *descendant* selector and never matches the component's own root element. A
bare top-level declaration does reach the root, because the wrap itself targets it. Layer 1
makes this asymmetry more visible — `--accent: {…}` at the top level works on the root while
`.root-class { … }` does not — so it is pinned by a check in `bench/style-smoke.html`.
Changing it would alter existing components' cascade and is out of scope here.

## 14. Layer 2 — deferred, and what it must fix

Not built now. Recorded so the shape is not re-derived, and so three known defects in the
obvious design are not walked into:

1. **Rules need stable identity, not indices.** `CSSRuleList` is ordinal, and every
   `insertRule`/`deleteRule` shifts everything after it. An index-addressed patch goes stale
   the moment a rule is removed. This is the lesson the template side already learned — it is
   why `<for>` has `by=` and why binds address nodes by path.
2. **At-rules are groups, not peers.** A flat `rules[]` cannot model `@media`, `@supports`,
   `@container` or `@layer`; `CSSMediaRule` has its own nested list with its own indices. This
   changes the diff and the applier, not just the type.
3. **No separate `vars` field.** A literal var is a static declaration on the scope root; a
   dynamic one is Layer 1. A second mechanism means two code paths, two diff cases and an
   ambiguity about which wins.

Per-instance scoping stays as it is. **Per-instance variation goes through custom properties;
per-type structure goes through rules.** Written down deliberately, or someone will make rules
per-instance and multiply sheet count by canvas node count.

The genuinely hard, expensive-to-reverse part of Layer 2 is the **patch vocabulary** — which
operations are emitted, at what granularity. That is what RFC-003 Phase 0 produces evidence
for, so Phase 0 gains one output: *the CSS operations it wanted and could not express.*

## 15. Build order

1. `src/ir/style.ts` — scanner, unit rule, StyleIR emit, `LIPS-S*` diagnostics
2. Runtime — style binds on scope roots, static injection with no preprocessor
3. Facade + precompile — StyleIR through both paths; `./runtime` ships styles
4. `@property` emission (§10) and the `layer` setting (§9)
5. Specs throughout; the existing 267 are the compatibility contract

## 16. Resolved decisions

1. **Nullish → `unset`**, no implicit fallback. Explicit fallbacks compile to `var(--x, …)`.
2. **Custom-property declarations bind directly**, no `--lN` alias. Load-bearing, not cosmetic.
3. **Cascade `layer` is opt-in**; default output is byte-identical to today.
4. **Dynamic selectors and at-rule conditions are errors**, not silent no-ops.
5. **Stylis moves to compile-time only.** The runtime build ships no CSS compiler — this is
   what closes the `./runtime` hole and is the unconditional justification for the work.
6. **Layer 2 is deferred** pending Phase 0 evidence on the patch vocabulary.
