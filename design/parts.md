# RFC-008 — Parts: headless components at `@lipsjs/lips/parts`

**Status:** in progress · 2026-11-25 · home and posture decided by the owner
(§2) · every part in §5 built (§5, "As built")
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

A part is Lips components: templates and their handlers, as any app
writes them. Each part is a plugin (`Plugin`), which `lips.use()` installs
with what it is built on, once:

```js
import Lips from '@lipsjs/lips'
import { menu } from '@lipsjs/lips/parts'

const lips = new Lips()
lips.use( menu )   // and the popover it is built on
```

**One template, both hosts.** Each part's template is written for the DOM and
for Lynx at once, as RFC-006 §4.3 allows: `div`, `button`, `p`, `span`,
`input`, and no tag `LIPS-L101` refuses. Where the two hosts differ, the part
holds both behaviours, and the host decides which one runs
(`backdrop-filter` exists only on the web, `blur-view` only on Lynx).
Where the markup itself differs (the virtual list is Lynx's own `list`
there), the component carries `lynx` source beside `default`, and
`lynxComponents()` (`./lynx`) compiles it for Lynx; decided by the owner
on 2026-11-25, over blocks of host-only markup in one template and over
two components the app picks between.

**Shipped as source.** A part is published as its template's source and its
handlers, and the app compiles it as it compiles its own templates: the full
entry at run time, `precompile()` (`./precompile`) in its build where a
content security policy refuses `unsafe-eval`, `compileLynxTemplate()` for
Lynx. IR compiled at Lips's build would be compiled twice over (once per
target), and tied to the compiler that made it, which an app's own Lips
need not be.

**Its look is the app's; its mechanics are inline.** A part takes the classes
the app gives and sets state classes; what it needs to work (a layer over
the page, where a panel sits, invisible until placed: `position`,
`opacity`, never a colour) is an inline `style`. Lips puts live values in a
component's scoped sheet, not in `style=`, and a part would too, but Lynx
cannot add a sheet at run time (`./lynx/plugin`): a part's sheet would have
to reach the app's build as a `*.lips.css` the app imports. Nothing a part
needs so far is what only a sheet reaches (`:hover`, `@keyframes`,
`@media`). When one does, the plugin carries its sheet and the Lynx build
picks it up; that is the seam.

**Composed from pieces: the part they sit in, or the one they are given.**

```html
<popover open=state.menuOpen on-change( setMenu )>
  <popover-trigger class="btn"><span>Actions</span></popover-trigger>
  <popover-content class="menu">…</popover-content>
</popover>
```

`popover` provides what its pieces share (whether it is open, its ids, its
trigger's reference, how to open and close it) as `context.popover`, which
reaches them where its slot places them (RFC-005 §4.4), as Lynx UI's
pieces reach theirs through React's context. A piece given `of` uses that
instead: mine if given, else the one I sit in, so a piece is driven by any
controller of the same shape, and is not tied to the part around it.
Context carries only that, the part a piece belongs to; what a piece needs
from the app is an input.

What a part keeps without drawing it (its controller, an id) is in its
`static`, one per instance; what it draws from is in `state`.

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

**Layer**: what floats, the primitive the next four stand on. One element
fixed over the page, on both hosts: on Lynx `position: fixed` places an
element as a child of the page's root, which is what Lynx asks of a page
that is all Lynx. Lynx's `overlay`, a layer outside Lynx with one child
that must itself be fixed, is for a Lynx module inside a native page; no
part serves that yet. What floats places itself from its anchor's
rectangle (§7, a reference that measures), flips to the other side where
there is no room, and mirrors in right-to-left. A layer that need not
escape its scroll container (a row's menu in a short list) stays in place,
absolutely positioned, and measures nothing.

**Popover and menu**: a trigger with `aria-expanded` and `aria-controls`, a
layer. It closes on Escape, on a tap outside and on the Android back button
(§7), and gives focus back to its trigger (`refs.focus`). A menu adds arrow
keys, Home/End and typing to find an item; on Lynx an item is a button.

*As built (2026-11-25).* `popover`, `popover-trigger`, `popover-content`
(`./parts/popover`) and `popover-menu` (`./parts/menu`), for the DOM and
Lynx from one template each:

- **The layer was the popover's**: `popover-content` rendered, while
  open, the fixed layer, a backdrop in it and the panel. The dialog
  shares it, and it is now a part of its own (`page-layer`, below).
- **A tap outside is the backdrop's**: it takes the tap whole, so the
  panel closes and nothing beneath is reached, as a menu on a phone does.
  `.outside` would not do for a toggle: it listens in the capture phase on
  both hosts, so a `.stop` cannot hide the event from it, and it runs
  before the trigger's own tap, which would close the panel and open it
  again. A popover that lets taps through (non-modal) needs `.outside` to
  skip its trigger, and so a way to ask, on Lynx, whether an event's target
  `{ id, uid }` is inside a ref; built with the first part that needs it.
- **What happens on each open is lifecycle, not a watcher.** The layer
  (`popover-layer`) and the menu's list (`popover-menu-list`) are
  components inside the content's `<if>`: mounted each time it opens,
  destroyed when it closes. The layer's `onAttach` measures and places the
  panel; the list's `onMount` sets where it starts and its `onAttach` takes
  focus. (`onAttach` did not run for a component a branch renders after
  mount; fixed in Lips with the first parts.)
- **Placed when measured, by a placement the app may replace.** The panel
  is drawn invisible, then the trigger, the layer and the panel are
  measured, and `place()`, or the app's own (`place=`), puts it: below the
  trigger, above where only that fits, at its start edge or its end in
  right-to-left (`dir="rtl"`), kept inside the layer.
- **Which element is the popup is a choice** (`popup`): the panel, by
  default, takes the popover's id, its `role`, the trigger as its label and
  focus; with `popup="content"` the content takes them, as the menu's list
  does.
- **The menu's list is the popup**, `role="menu"`: it keeps focus and names
  the active item with `aria-activedescendant`, as a combobox will. Lynx,
  which has neither, gives it accessibility focus and makes each item a
  button. Arrows and Home/End skip disabled items, a letter goes to the
  next item it starts, Enter or Space or a tap selects (`select`), Tab
  closes it and lets focus move on; a tap opens it on its first item,
  ArrowUp on the trigger on its last. Its items are data,
  `{ id, label, disabled? }`, each drawn as its label or by its slot,
  which gets `item` and `active`.
- **Named `popover-menu`**: `menu` is an HTML element, and `register`
  now refuses a name the compiler reads as one.
- **Not yet:** `aria-roledescription` on the list, so that Lynx speaks a
  menu as one (§4, `LIPS-L105` until then), waits for words the app
  translates, which a plugin will carry; opening on hover, focus or a long
  press (INTERFACE's regions show on each), as more of `popover-trigger`'s
  policy; Android's back button (§7).

*As built, the layer (2026-11-25).* `page-layer` (`./parts/layer`): the
fixed element, a backdrop that takes a tap whole, and Escape, both
saying `dismiss`; `center` centres what it holds. Once it is in the page
it says `live` with its element, and what sits in it measures from there:
the popover's panel is placed then. A parent's `onAttach` runs before its
children's, so the layer saying it is live, rather than its parent's own
`onAttach`, is what makes sure the layer is there to measure.

**Dialog**: a layer over the whole page, `aria-modal`, its title as its
label. On the web it keeps Tab inside it and makes the page behind it inert;
on Lynx, `accessibility-exclusive-focus` keeps a screen reader inside it.
Focus goes to its first field, or its title, and back to what opened it.

*As built (2026-11-25).* `popover-dialog` and `dialog-title`
(`./parts/dialog`), on the popover's controller: the popover holds whether
it is open, its id and its trigger (`haspopup="dialog"`), and a dialog with
no trigger is the same with none written.

- **Focus goes to the panel**, which is read by its title, not to its
  first field: a Lynx ref cannot be searched for one. It says `placed`,
  and the app moves focus on to a field from there, with its own ref.
- **The page behind it is `inert`** on the web: every sibling of the
  layer and of what holds it, up to the body, and given back when it
  closes; what was inert already is left as it was. Tab and Shift+Tab go
  round what can be focused in the panel. On Lynx, which has neither
  `inert` nor Tab, `aria-modal` (`accessibility-exclusive-focus`) keeps a
  screen reader inside.
- **However it closes**, focus goes back to the trigger: Escape and the
  backdrop ask the popover to close, but the app may close it from its
  own button, by its own `open`. So the dialog's layer gives the page back
  and focuses the trigger as it is destroyed, the page first, since an
  inert trigger refuses focus.
- **Its role is `dialog`**, or the app's (`alertdialog`); its label, its
  title or `label`. Lynx has no dialog role (`LIPS-L105`, as the menu).

**Toasts**: a queue in a live region (`role="status"`, or `alert` for an
error), announced on Lynx through `accessibilityAnnounce`. A toast stays
while the pointer or the focus is on it, and one that offers an action never
leaves by itself (WCAG 2.2.1).

*As built (2026-11-25).* `toast-region` (`./parts/toast`). The queue is
the app's, `{ id, text, action?, duration? }`; a toast whose time is up
asks to go, once (`dismiss`), and the app takes it out. The region is
always drawn, so what comes into it is announced, on the web as on Lynx;
an app with errors draws a second region, `role="alert"`. Each toast has
its own time (`toast-item`), held while the pointer or the focus is on it
and going on from what was left. On Lynx, where there is no pointer and
only a field takes focus, a toast is not held. Lynx announces a region's
whole text on each change, so when one of two toasts goes, the other is
announced again; one region per toast would be announced on arrival by
neither host.

**A region that reveals and folds**: a button with `aria-expanded` and the
region it controls. It may stay rendered while folded (a form keeps what
was typed) or render only when open.

*As built (2026-11-25).* `reveal-region` (`./parts/reveal`), a popover's:
its trigger is the button, and the region is in the page's flow, not a
layer, so it takes no focus and nothing but the button and the app closes
it. `keep` keeps it rendered and hidden by `display: none`, which a screen
reader passes over on both hosts. With a `role` (`region`), it is named by
its button.

**Icons**: a set as data, a name for each markup, drawn as inline `svg`
(lips#34). Its colour is bound into the markup, since a custom property does
not reach inside Lynx's `svg` string (§3). An icon with no label is
`aria-hidden`; one alone in a button gives the button its label.

*As built (2026-11-25).* `icons( set )` (`./parts/icon`), a plugin made
from the set, which gives `icon`. Each icon is its paths, its box, and a
stroke width for a line icon (no fill, round ends). Its colour is `color`,
or the text's (`currentColor`) on the web; on Lynx the app gives it. The
set is held by a getter in the component's `static`, so each icon shares
it rather than copying it (`ir/initial`). One set per Lips: a second
`icons(…)` is another plugin of the same name, refused.

**Blurred backdrop**: `backdrop-filter: blur()` on the web, `blur-view` on
Lynx (§3). The part takes a radius; iOS's material is the app's choice
(`blur-effect`).

*As built (2026-11-25).* `backdrop-blur` (`./parts/layer`): one element,
`<blur-view blur-radius>` with `backdrop-filter` in its style. Each host
draws what it knows and passes over the other's: the DOM draws an unknown
element as a box, and blurs it; Lynx reads `blur-view` and has no
`backdrop-filter`. A layer takes one with `blur`, `effect` and `backdrop`
(its class). Tried on Lynx in §3, as `blur-view` alone; with the unknown
property beside it, the next Explorer run.

**Combobox**: an input, a layer and the options in it, filtered as the
person types. On the web, `role="combobox"` and `aria-activedescendant`
keep focus in the input while arrows move through the options. On Lynx,
neither role exists: options are buttons, the selected one says so
(`aria-selected` → its value), and the input is described as a combobox. A
long list of options is a virtual list.

*As built (2026-11-25).* `popover-combobox` (`./parts/combobox`): the
field is the popover's trigger, so the list is placed under it and focus
comes back to it, and the list is the popup (`popup="content"`), so the
field keeps focus. Options are a menu's items, moved through by the same
`move`. What is typed is the combobox's: `match` finds the options
(`contains` by default), and `query` tells an app that finds them itself.
The field shows the chosen option's label, from the app's `value`, until
the person types.

- **Not yet:** the person cannot tap the field while the list is open: the
  layer's backdrop takes the tap and closes the list (the non-modal case
  under the popover, with `.outside` that skips the trigger). Lynx's
  description of the field as a combobox waits for words the app
  translates, as the menu's does (`LIPS-L105`). Built on it, Lynx's
  `setValue` was found sent one value short, which misread every op after
  it in its batch; fixed in the binding.

**Virtual list and grid on the web**: only the rows in view and a margin are
rendered, from each row's measured or estimated height. A grid keeps
`aria-rowcount` and each row's `aria-rowindex`, so a screen reader knows
where it is. On Lynx the part renders Lynx's own `list`, which already
recycles; a grid of columns needs `span-count`, read only as a number (§7).

*As built (2026-11-25).* `virtual-list` (`./parts/list`). On the web, a
box that scrolls, measured when it is in the page and read again on each
scroll; rows of one `size`, `columns` to a row, `overscan` rows past the
view each side (`frame()`). A row that stays in view stays the same
element. A `grid` or `table` of one column carries `aria-rowcount` and
`aria-rowindex`; a grid of columns is tiles, whose rows ARIA would count
otherwise, and says neither. On Lynx, its `lynx` source: Lynx's `list`,
`list-type` flow for columns, `span-count`, each row a `list-item` with
`size` as its estimate. Lips builds every cell in the background and
Lynx draws only those it asks for (RFC-006 §4.5).

- **Not yet:** rows of different heights, measured as drawn; a grid's
  keys between cells (the date grid has its own).

**Date picker**: a month as a grid of days, with arrows, Page Up/Down for a
month and Home/End for a week; the names of days and months and the first
day of the week from `Intl` and the reader's locale (`./i18n`). On Lynx each
day is a button. It sits in a layer under a text field that also takes a
typed date.

*As built (2026-11-25).* `date-grid` and `popover-date` (`./parts/date`).

- **ISO days in UTC.** A value is `YYYY-MM-DD`, and the arithmetic
  (`addDays`, `addMonths` keeping the month's last day, `weeksOf`) is in
  UTC, so no clock change moves a day.
- **Focus stays on the grid**, which names the active day with
  `aria-activedescendant`, as the menu and the combobox do, rather than
  moving a roving `tabindex` from day to day.
- **Words from `Intl` where it formats dates.** The months' and days'
  names, the title and a day's full name in the language's own order, and
  the first day of the week (`Intl.Locale`'s week info). Lynx's PrimJS
  is not known to have `Intl`, and the least of it `./i18n` installs
  writes a date whole: that is told apart, and then the app's `words`,
  or English, name them. `first` overrides the week's start.
- **Days refused** by `min`, `max` or the app's `disabled( iso )` are
  `aria-disabled`; reached by the keyboard they are not chosen, and a tap
  on one does nothing.
- **On Lynx, buttons**: its `lynx` source draws each day as a button
  named in full, the chosen one selected, and no grid roles.
- **`popover-date`** is the grid in a popover's layer, a dialog of its
  `label`, the grid focused when it opens; choosing closes it, and focus
  goes back to the trigger.
- **Not yet:** the text field that takes a typed date. Reading a typed
  date is the reader's language's, as writing one is; it waits for a
  parser the app may replace, as `match` is the combobox's.

## 6. Build order

Each is one change to Lips, with its tests, in this order:

1. **What the parts stand on in Lips** (§7): a reference that measures, and
   Lynx attributes that take a number or a boolean.
2. Layer, popover and menu. **Built** (§5, "As built").
3. Dialog. **Built.**
4. Toasts. **Built.**
5. A region that reveals and folds; icons; blurred backdrop. **Built.**
6. Combobox. **Built.**
7. Virtual list and grid on the web. **Built.**
8. Date picker. **Built.**

The two last need the most: a virtual list stands on measuring, and a date
picker on the layer, the grid's keys and `./i18n`.

## 7. What Lips needs first

- **A reference that measures.** Built (RFC-006 §4.5, "As built, a ref
  that measures"): `await this.refs.x.getBoundingClientRect()` answers
  on the DOM and, from Lynx's `boundingClientRect` UI method, on Lynx.
- **Typed Lynx attributes.** Lips writes an attribute as text. A `list`'s
  own props (`span-count`, `sticky-offset`, `sticky`, the `experimental-*`
  flags) are read only as numbers and booleans, and are converted by name
  (lips#48). An `overlay`'s `visible` and `level` and `flatten` were
  thought to be the same; read in the engine, Android, iOS and the core
  take them as text. Only HarmonyOS reads text as true, so `visible="false"`
  showed an overlay there. Its 13 boolean attributes are now sent as
  booleans (RFC-006 §4.5, "As built, Lynx's boolean attributes").
- **Android's back button**, which should close the topmost layer: whether
  Lynx sends it to the page, and how, is to find out.
- **Android's screen reader** (lips#44, `enableA11y`): until the host
  turns it on, none of the accessibility in §5 reaches TalkBack.
- **What the next parts stand on, read in the binding (2026-11-25).**
  A live region, `aria-modal` and focus were already Lynx's (RFC-006
  §4.8): a region's new text is `accessibilityAnnounce`d, `aria-modal`
  is `accessibility-exclusive-focus`, and a ref's `focus()` is input
  focus on a field and accessibility focus elsewhere. A ref's `animate`
  answers on both hosts, so motion (§9) needs no sheet. `Intl` on Lynx's
  PrimJS is not known to be there: `./i18n` installs the least of it
  MessageFormat needs, which writes dates plainly and names no month. The
  date picker takes the names of days and months, and the first day of
  the week, from real `Intl` where it is, and from words the app gives
  where it is not.
- **The L4 gate** (lips#39) still decides whether Lips on Lynx is ready for
  a production app. The parts do not wait on it, since they run on the web
  first, but nothing ships on Lynx before it passes.

## 8. Checks

Every behaviour a part promises has a test that fails when the behaviour is
removed: its roles and states, its keys, where focus goes and comes back,
what a screen reader is told. Each runs on the DOM, and on Lynx's headless
tier (RFC-006 test tier A, both threads in one process) for the attributes
the main thread writes and what Lynx measures. A part
the size budget does not hold is refused by `size-check`.

## 9. Open

- Whether a part should also accept a template for each piece it draws (an
  option's row, a day's cell), as a slot (`<{input.renderer}/>`), or only
  classes. The menu takes both: classes for its items, and a slot for an
  item's row where the app gives one.
- Android's back button (§7).
- Motion: a layer that animates in and out. Lynx animates with transitions
  and `animate()`; a part would set `is-entering` and `is-leaving` and
  wait for the app's transition to end. It waits for the first part that
  needs it.
