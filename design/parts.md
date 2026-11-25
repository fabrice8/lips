# RFC-008 — Parts: headless components at `@lipsjs/lips/parts`

**Status:** proposal · 2026-11-25 · home and posture decided by the owner
(§2)
**Depends on:** RFC-001 (template IR), RFC-004 (StyleIR), RFC-005 (scoped
context), RFC-006 (Lips on Lynx)
**Tracked in:** [ROADMAP.md](../ROADMAP.md)

---

## 1. Context

An application on Lips writes every control beyond what HTML gives it: a
searchable picker, a menu, a dialog, toasts, a date picker, a long list. Each
one has to get focus, keys and what a screen reader hears right, and since
RFC-006 it has to get them right on Lynx too, where most ARIA roles have no
equivalent (`LIPS-L105`). Lips ships none of these today. This RFC adds
them as **parts**: Lips components that hold structure, behaviour, focus and
accessibility, and no look.

The set comes from what a data-heavy application needs, in the order each
stands on the one before (§6): a layer that floats, popover and menu,
dialog, toasts, a region that reveals and folds, icons, a blurred backdrop,
combobox, a virtual list and grid on the web, date picker.

Prior art: **Lynx UI** (`@lynx-js/lynx-ui-*`), the headless parts the Lynx
team ships for ReactLynx. It composes each part from pieces (`PopoverRoot`,
`PopoverTrigger`, `PopoverContent`, …), puts what floats in Lynx's
`overlay`, and leaves the look to the app. On the web, the WAI-ARIA
Authoring Practices give each pattern's keys and states.

## 2. Decided

- **Home: a subpath of `@lipsjs/lips`**, `@lipsjs/lips/parts`, beside
  `./lynx`, `./i18n` and the rest. One repository, one build, one release.
  A subpath is loaded only by an app that imports it, so the core's size is
  unchanged; the parts get a budget of their own in `scripts/size-check.mjs`.
- **Headless.** A part names no colour, size or font. It renders elements
  with the classes the app gives and the state classes it sets
  (`is-open`, `is-active`, `is-selected`: Lynx has no attribute selectors),
  and the app's own sheet styles them. A theme reaches parts as custom
  properties bound at the app's root, which Lips already does (RFC-004
  §7.4) and which inherit on Lynx (tried, §3). Lips adds nothing for
  tokens.

## 3. Tried first

Four things the parts stand on were tried on Lynx Explorer 4.1.0, on an iOS
simulator (iOS 26.2) and an Android emulator (API 36.1), from Lips as
published with RFC-006's fixes (lips#45, lips#46). Each drew the same on
both, and moved when its bound value changed. The template was a spike and
was not merged.

| Tried | Result |
|---|---|
| A grid line carried by a custom property: `grid-column-start: var(--from)`, bound at the root, and a line in an element's own bound `style` | Holds on both. A bar on a timeline or a day in a calendar is a number bound per element |
| `<blur-view blur-radius>` over content | Blurs on both. iOS lays its material over the blur (`blur-effect`, light by default); Android blurs plainly |
| `direction: rtl` and `lynx-rtl` on a flex row | Mirrors on both; `margin-inline-start` falls on the right; `text-align: start` aligns right |
| An icon as `mask-image` tinted by `background-color` | A gradient and a raster image (PNG as data, by URL, or carried by a custom property) mask on both. **An SVG mask draws nothing**, as text, URL-encoded or base64 |

So an icon is an inline `<svg>` with its colour bound into its markup
(lips#34, built), and `mask-image` is kept for a raster image or a fade.

## 4. What a part is

A part is a Lips component: a template and its handlers, registered by
name with `lips.register` like any other. Each piece is exported as its
name and its template, and the app registers the ones it uses:

```js
import Lips from '@lipsjs/lips/runtime'
import { popover, menu, dialog } from '@lipsjs/lips/parts'

const lips = new Lips({ mode: 'interpreted' })
for( const [ name, template ] of [ ...popover, ...menu, ...dialog ] ) lips.register( name, template )
```

**One template, both hosts.** Each part's template is written for the DOM and
for Lynx at once, as RFC-006 §4.3 allows: `div`, `button`, `p`, `span`,
`input`, and no tag `LIPS-L101` refuses. Where the two hosts differ, the part
holds both behaviours, and the host decides which one runs (`overlay` exists
only on Lynx; `backdrop-filter` only on the web).

**Shipped compiled.** A part is published as its template IR, compiled for
the DOM and for Lynx at Lips's build, so an app in interpreted mode under a
content security policy with no `unsafe-eval` needs no compiler. Its sheet,
the little a part needs to work (`position`, `overflow`, `display`, never a
colour), is compiled the same way.

**Composed from pieces, through context.** A part's pieces share its state
through scoped context (RFC-005), as Lynx UI's do through React context:

```html
<popover open=state.menuOpen on-change( setMenu )>
  <popover-trigger class="btn">Actions</popover-trigger>
  <popover-content class="menu">…</popover-content>
</popover>
```

`popover` provides `context.popover` (open, its ids, its trigger's
reference); `popover-trigger` and `popover-content` read it. The app passes
nothing between them.

**Controlled.** What the app cares about is an input, and a change comes
back as an event: `open` / `on-change`, `value` / `on-change`. A part holds
only what the app need not see: the option under the keyboard, the text typed
to find one, a toast's remaining time. This keeps a part's state in the
app's own signals, where the app can save, undo or share it.

**Accessibility is the part's, on both hosts.** A part sets the roles and
states (`aria-expanded`, `aria-controls`, `aria-selected`,
`aria-activedescendant` on the web), and RFC-006's map turns them into Lynx's
own (`accessibility-*`, `accessibility-exclusive-focus` for `aria-modal`,
`lynx.accessibilityAnnounce` for a live region). Where Lynx has no role
(`listbox`, `menu`, `dialog`, `grid`, `combobox`), the part says what it is
with `aria-roledescription`, in words the app can translate, so the role is
still spoken (§7).

## 5. Each part

What each part renders, and how it works on each host. Keys are the ARIA
Authoring Practices' for the pattern.

**Layer**: what floats, the primitive the next four stand on. On the web, an
element positioned against its anchor and moved above the page; on Lynx, an
`overlay`. It places itself from its anchor's rectangle (§7, a reference
that measures), flips to the other side where there is no room, and mirrors
in right-to-left. A layer that need not escape its scroll container (a
row's menu in a short list) stays in place, absolutely positioned, and
measures nothing.

**Popover and menu**: a trigger with `aria-expanded` and `aria-controls`, a
layer. It closes on Escape, on a tap outside (`.outside`) and on the
Android back button (§7), and gives focus back to its trigger
(`refs.focus`). A menu adds its items' roving focus, arrow keys,
Home/End and typing to find an item; on Lynx an item is a button.

**Dialog**: a layer over the whole page, `aria-modal`, its title as its
label. On the web it keeps Tab inside it and makes the page behind it inert;
on Lynx, `accessibility-exclusive-focus` keeps a screen reader inside it.
Focus goes to its first field, or its title, and back to what opened it.

**Toasts**: a queue in a live region (`role="status"`, or `alert` for an
error), announced on Lynx through `accessibilityAnnounce`. A toast stays
while the pointer or the focus is on it, and one that offers an action never
leaves by itself (WCAG 2.2.1).

**A region that reveals and folds**: a button with `aria-expanded` and the
region it controls. It may stay rendered while folded (a form keeps what
was typed) or render only when open.

**Icons**: a set as data, a name for each markup, drawn as inline `svg`
(lips#34). Its colour is bound into the markup, since a custom property does
not reach inside Lynx's `svg` string (§3). An icon with no label is
`aria-hidden`; one alone in a button gives the button its label.

**Blurred backdrop**: `backdrop-filter: blur()` on the web, `blur-view` on
Lynx (§3). The part takes a radius; iOS's material is the app's choice
(`blur-effect`).

**Combobox**: an input, a layer and the options in it, filtered as the
person types. On the web, `role="combobox"` and `aria-activedescendant`
keep focus in the input while arrows move through the options. On Lynx,
neither role exists: options are buttons, the selected one says so
(`aria-selected` → its value), and the input is described as a combobox. A
long list of options is a virtual list.

**Virtual list and grid on the web**: only the rows in view and a margin are
rendered, from each row's measured or estimated height. A grid keeps
`aria-rowcount` and each row's `aria-rowindex`, so a screen reader knows
where it is. On Lynx the part renders Lynx's own `list`, which already
recycles; a grid of columns needs `span-count`, read only as a number (§7).

**Date picker**: a month as a grid of days, with arrows, Page Up/Down for a
month and Home/End for a week; the names of days and months and the first
day of the week from `Intl` and the reader's locale (`./i18n`). On Lynx each
day is a button. It sits in a layer under a text field that also takes a
typed date.

## 6. Build order

Each is one change to Lips, with its tests, in this order:

1. **What the parts stand on in Lips** (§7): a reference that measures, and
   Lynx attributes that take a number or a boolean.
2. Layer, popover and menu.
3. Dialog.
4. Toasts.
5. A region that reveals and folds; icons; blurred backdrop.
6. Combobox.
7. Virtual list and grid on the web.
8. Date picker.

The two last need the most: a virtual list stands on measuring, and a date
picker on the layer, the grid's keys and `./i18n`.

## 7. What Lips needs first

- **A reference that measures.** A ref calls UI methods on Lynx, but
  nothing comes back: the main thread runs them and answers no one. A layer
  needs its anchor's rectangle. `await this.refs.x.rect()` would answer from
  `getBoundingClientRect()` on the DOM, and from Lynx's `boundingClientRect`
  UI method on Lynx, through a reply the protocol does not have yet.
- **Typed Lynx attributes.** Lips writes an attribute as text. Lynx reads
  some only as numbers or booleans. A `list`'s own props (`span-count`,
  `sticky-offset`, `sticky`, the `experimental-*` flags) are converted by
  name in lips#48. An `overlay`'s `visible` and `level`, and likely
  `flatten`, are not yet: the same conversion, extended to them, closes
  them.
- **Android's back button**, which should close the topmost layer: whether
  Lynx sends it to the page, and how, is to find out.
- **Android's screen reader** (lips#44, `enableA11y`): until the host
  turns it on, none of the accessibility in §5 reaches TalkBack.
- **The L4 gate** (lips#39) still decides whether Lips on Lynx is ready for
  a production app. The parts do not wait on it, since they run on the web
  first, but nothing ships on Lynx before it passes.

## 8. Checks

Every behaviour a part promises has a test that fails when the behaviour is
removed: its roles and states, its keys, where focus goes and comes back,
what a screen reader is told. Each runs on the DOM, and on Lynx's headless
tier (RFC-006 test tier B) for the attributes the main thread writes. A part
the size budget does not hold is refused by `size-check`.

## 9. Open

- Whether a part should also accept a template for each piece it draws (an
  option's row, a day's cell), as a slot (`<{input.renderer}/>`), or only
  classes. The first parts take classes, and a slot is added where an app
  needs one.
- Android's back button (§7).
- Motion: a layer that animates in and out. Lynx animates with transitions
  and `animate()`; a part would set `is-entering` and `is-leaving` and
  wait for the app's transition to end. It waits for the first part that
  needs it.
