# RFC-003 — Modela: thesis, roadmap, and kill criteria

> Status: proposal · 2026-08-03
> Product-side companion to [RFC-002](./modela-integration.md), which covers the
> engine contract. This one is about what Modela is *for*, in what order it gets
> built, and how we find out early if it is wrong.

## The observation

Prompting a model for UI is fast, surprising, and pleasant — for one turn. Then:

1. **Every first proposition looks alike.** Different prompts converge on the same
   layouts, the same spacing, the same card grids.
2. **Refinement is a negotiation.** Adjusting one region means re-prompting, and
   each turn re-samples the whole artifact rather than perturbing the one thing
   you wanted changed.
3. **Content tuning arrives last and overwhelms**, because it was never separable
   from structure.
4. **Logic wiring is the one part AI does cleanly** — until the system behind the
   UI gets genuinely complex.

The first three are the same failure. Text is a low-dimensional, high-ambiguity
channel for spatial intent: "a dashboard" has a modal answer, so every model
returns approximately it, and every correction restarts the sample.

## The thesis

> Let the human supply the **spatial prior** in a spatial modality. Let the model
> supply the **wiring**. Neither is doing the other's job.

A sketched arrangement is a high-dimensional constraint that text cannot carry. It
does not ask the model to be more creative — it removes the ambiguity that makes
the model fall back on its mode. The human keeps visual and structural authorship;
the model keeps what it is reliably good at.

This is falsifiable, and cheaply (Phase 0).

## Why Lips is the right substrate

ArchiCAD and Revit did not beat AutoCAD on drawing tools. They beat it by making
**the drawing a projection of a model**: you place a wall that carries structure,
material and relationships, and plans, sections and schedules are derived views.
Change once, everything stays coherent.

UI tooling is still pre-BIM. Figma draws rectangles that *represent* UI; code is a
separate real artifact; they drift. AI generators emit code where the visual is a
result, never a source.

Lips' IR is the BIM move, and it already exists:

| BIM property | Lips equivalent |
|---|---|
| The model, not the drawing, is the artifact | `TemplateIR` — plain JSON, round-trippable |
| Views are projections of the model | canvas and code are both views of the IR |
| Change propagates without rebuilding the world | `swap()` + instance salvage |
| Change is inspectable | `SwapReport.changes` — kind + path per region |
| Untrusted/derived content is safe to display | `mode: 'interpreted'` — no `eval` |
| Bad input is reportable, not fatal | diagnostics with `line`/`col`/`code`/`hint` |
| Structure and content are separable | skeleton vs. binds, already distinct in the IR |

That last row matters for the content-tuning complaint: structure lives in the
block skeleton, content lives in binds. They are already separate editing surfaces
in the format — Modela only has to expose them as separate modes.

## Non-goals

- **Not a faster React.** Speed does not sell frameworks; Solid is faster than
  everything and has modest adoption. The position is *the runtime built for
  generated and visually-edited UI* — something incumbents cannot copy cheaply
  because they all compile to code rather than to a manipulable artifact.
- **Not a design tool.** Figma owns visual comping. Modela's artifact runs.
- **Not an Expo replacement, yet.** See "Platform posture".

## Platform posture

Two questions that were previously conflated:

- **Modela the tool** is a professional authoring environment — desktop and
  tablet, browser-hosted. DOM-only Lips is correct here and needs no change.
  Revit is not cross-platform either.
- **What Modela produces** must run where the user ships.

Therefore the commitment now is **not** "port Lips to native." It is:

> **Protect IR neutrality.** No DOM-specific concept may enter the IR format
> without an explicit decision recorded here.

The one known DOM coupling in the format is that a block's skeleton is an **HTML
string** (`BlockIR.html`, instantiated via `<template>.cloneNode`). Binds are
already declarative over integer paths and are host-agnostic. When a non-DOM
export target is needed, the compiler emits a structural node tree alongside
`html`, and the runtime takes a small host interface
(`createElement / createText / insert / remove / setAttr / listen`). That is a
contained change *provided nothing else DOM-shaped leaks into the IR first*.

Deferred, not declined. Revisit when a real export target demands it.

## Prior art

Surveyed 2026-08-03. A search snapshot, not an exhaustive review.

### Camp 1 — round-trip visual editors over real code

Onlook, Codux, Plasmic, Builder.io. Method, in Onlook's author's own description:
inject a build-time attribute that points back to source *like a source map*, then
"find the code, parse it into an AST, inject the styles, and write it back."

- **Better than us at distribution, decisively.** Works on any existing React
  codebase; no framework adoption; explicitly no lock-in. This is the real
  competitive threat, and architectural elegance does not answer it.
- **Worse at revision mechanics.** Source-map → AST → write-back is fragile
  exactly where UI gets interesting — loops, conditionals, dynamic props, wrapped
  components — and edits are non-persistent until written back to code. Live state
  does not survive the rebuild.

### Camp 2 — AI app generators

v0, Lovable, Bolt, Replit, Magic Patterns, Stitch. Regeneration-based; a revision
re-emits files. This is the source of the pain in "The observation" above, and it
is documented from the outside: *"Getting a design from MidJourney or Vercel's V0
is amazing, but the real work begins with the day of editing that follows"*
(designer quoted in the PrototypeFlow formative study). The sameness symptom has
been named publicly too — "AI design isn't ugly. It's fluent — and that's the
problem," UX Collective, June 2026.

### Camp 3 — HCI research (most relevant)

**PrototypeFlow** — Yuan, Chen, Hu, Feng, Xie, Mohammadi, Xing, Quigley.
ACM TOCHI, [10.1145/3773035](https://dl.acm.org/doi/full/10.1145/3773035).
Formative study with 10 professional designers; 3 user studies, 16 participants.

Their finding **F2** is this RFC's thesis, already validated:

> "Text-only or image-only input doesn't fully capture what I'm imagining" —
> combining wireframes with text "allows for greater control over functionality
> and layout, while preserving creativity."

Their **F4** is scoped revision: "transparent, editable checkpoints throughout the
generation process" rather than trial-and-error re-prompting.

**Consequence for us, both directions:**

- A1 is **no longer an open question**. Do not spend Phase 0 re-proving that
  sketch + text beats text alone. It is established and peer-reviewed.
- The idea is therefore **not novel**. Spatial conditioning is prior art.

**Where they stop:** PrototypeFlow emits **editable SVG prototypes** — design
artifacts that do not run. No logic, no state, no interactivity; the walkthrough
ends with exporting a prototype "ready to circulate for team feedback." Its
revision mechanism is regeneration (whole-prototype for layout/theme, component
level for smaller edits) — which is free for them precisely *because SVG has no
live state to lose*.

Table 1 of that paper is a ready-made competitive matrix of input/output
modalities across the leading tools. Read it before Phase 0.

### The gap that remains

| | Spatial constraint in | Running, stateful artifact | Revision by patching, not regenerating |
|---|---|---|---|
| Onlook / Codux / Plasmic | ✗ | ✓ | ✗ — AST write-back, state lost on rebuild |
| v0 / Lovable / Bolt | ✗ | ✓ | ✗ — regeneration is the model |
| PrototypeFlow | ✓ | ✗ — SVG | partial, by regeneration |
| **Lips + Modela** | Phase 0 | ✓ | ✓ |

Nobody combines all three. That intersection is the position, and it is the one
the IR makes available.

### What this changes

1. **Phase 0 is re-scoped** (see below): test constraint *persistence across
   successive revisions of a running artifact*, not sketch-vs-prompt.
2. **The rival is Camp 1, not Camp 2.** v0 and Lovable make apps from prompts —
   a different product. Onlook/Plasmic/Codux occupy this space and win on
   distribution. The wedge must therefore be where AST surgery is weakest:
   **dynamic, stateful, data-driven UI**, where source-mapping degrades and
   losing live state on every edit actually hurts.

## Assumption ledger

Ordered by risk, not by appeal. The natural instinct is to build A4 first because
it is the exciting part; that is the trap.

| | Assumption | Cost to test | Order |
|---|---|---|---|
| ~~A1~~ | ~~A human spatial constraint measurably breaks AI sameness~~ | — | **settled by prior art** (PrototypeFlow F2) |
| A1′ | A spatial constraint **persists across successive AI revisions** of a running artifact | **days** | 1st |
| A2 | Canvas ↔ IR ↔ code round-trips stay coherent under real editing | weeks | 2nd |
| A3 | Scoped patches beat whole-page regeneration for refinement | weeks | 3rd |
| A4 | Pen/sketch input can be made to work well | **months** | 4th |
| A5 | Non-DOM export targets | months | last |

## Phases

Durations assume one developer with AI assistance and uninterrupted focus. Each
phase has an exit that is checkable and a kill criterion that is honest.

### Phase 0 — Constraint-persistence probe · ~2 weeks

Not a product. A rig, thrown away afterwards.

**Re-scoped after the prior-art survey.** The original probe tested whether a
sketch beats a prompt — PrototypeFlow already answered that with professional
designers, so re-running it would buy nothing. What nobody has tested is the
combination this architecture uniquely enables.

Draw crude regions on a grid (boxes, no pen, no beauty). Condition generation on
them. Render through Lips as a **running, stateful** component. Then issue three
to five successive revision requests — content, styling, an added element.

**Exit:** the spatial constraint still holds after N revisions — the layout has
not drifted back toward the model's default — *and* live component state survives
every revision. Measure drift as layout distance from the original constraint at
each step; measure survival with `SwapReport.salvaged` and observed state.

**Kill criterion:** if the constraint erodes over successive revisions — if by
revision four it looks like every other generated dashboard — then scoped patching
does not buy authorship, and the differentiation collapses to "a nicer live
preview." Reconsider before building anything else.

**Why this is the right probe:** every competitor either regenerates (Camp 1 and
2, so constraint and state both reset) or has no live state to lose (Camp 3). The
persistence question is only askable on a patchable, stateful substrate — which is
exactly what exists.

### Phase 1 — The model spine · ~6–10 weeks

Modela resumed on Lips 0.2.x (currently pinned to `0.0.12`), with the IR as the
single source of truth.

- canvas edit → IR patch → `swap()` on the live instance
- code view ↔ IR, both directions
- selection, inspector, structure tree over IR nodes
- structure and content as distinct editing modes (skeleton vs. binds)

**Exit:** edit from either surface; both stay in sync; live component state is
never lost across a revision. This is where `swap()` + salvage earn out — the
parametric-propagation analogue.

**Kill criterion:** if round-trip coherence needs constant special-casing, the IR
is the wrong granularity for an editor and that needs solving before more is
built on it.

### Phase 2 — AI as a patch producer · ~4–6 weeks

The design decision that kills the re-prompt cycle: **the model emits IR patches
scoped to a selection, not whole templates.** You adjust a region; the rest of the
page is not resampled and cannot drift.

- selection-scoped generation and revision
- diagnostics (`code`/`line`/`col`/`hint`) fed back for self-correction
- `SwapReport.changes` drives canvas highlighting of what a revision touched
- untrusted generations previewed under `mode: 'interpreted'`

**Exit:** a targeted change to one region leaves the rest byte-identical, and a
bad generation is reported rather than applied.

### Phase 3 — Flow and logic · ~6–8 weeks

The "flow draw" half. Wiring as a graph layered over the IR — events, state,
data flow, conditions. Lean hard on AI here: by your own observation it is the
part models do cleanly, so the human should be directing it, not typing it.

**Exit:** a non-trivial interactive app — real state, real async, real
navigation — built end-to-end without hand-writing wiring.

### Phase 4 — Pen and sketch · open-ended

Only after 0–3. Now the input modality makes a proven loop *feel* right, instead
of being a bet on whether the loop exists.

### Phase 5 — Export targets · demand-driven

Web export first. Additional hosts when a real target demands them, per
"Platform posture".

## What is actually differentiated

Worth separating three things that are easy to collapse into one:

- **Substrate** — the mechanism that makes the loop feel alive rather than janky.
- **Differentiation** — the reason someone cannot get this elsewhere.
- **Thesis** — the product bet layered on top.

Coherent state under change is the **substrate**, not the differentiation. Nobody
adopts a tool because state is preserved; they adopt it for what that makes
possible. Architects did not buy Revit for parametric propagation either — they
bought "my drawings can no longer disagree with each other." Propagation was the
mechanism. The innovation was that *the model replaced the drawing set*.

Modela's equivalent claim is therefore not "state survives" but:

> **The design and the running app are one artifact, and both the human and the
> AI edit it in place.**

Decomposed by strength:

| Property | Status | Defensible? |
|---|---|---|
| Coherent state across surfaces | built, verified | Moderate — an engineering lead, not a moat |
| **Scoped patch revision** — AI edits a region, never regenerates the page | designed (Phase 2) | **Strong** |
| **Bidirectional round-trip** — hand edits survive; visual edits produce real artifacts | partly real via the IR | **Strong** |
| Persistent spatial constraint | unproven (Phase 0) | Weak alone, strong combined |

The two strong rows share one root cause: **the IR is the artifact, not the code.**
Anything that generates code must regenerate a whole component — it has no
patchable model to revise, and no way to absorb a hand edit without re-parsing.
That is an architectural position, not a feature gap closable in a sprint.

So the moat is a single decision with three consequences, not three features.

The spatial-prior thesis is the **product layer** on top, and it is the copyable
part — sketch-to-UI demos already exist. What would be genuinely new is the sketch
persisting as an *authored constraint that later AI revisions must respect*,
closer to a parametric constraint in CAD than to a prompt. Phase 0 should be
framed to test that, not merely "does a sketch help once".

### Not innovative, and worth saying plainly

The canvas and editor chrome (solved space, heavy prior art). The generation
itself (a rented model). Fine-grained reactivity (Solid got there; a quality bar
now, not a differentiator). Raw speed (nobody switches frameworks for it).

### The failure case

If coherent state is all that turns out to be true, Modela is a nicer live
preview — necessary, and not a product. What converts substrate into product is
what it lets the AI do: **revise one region without disturbing the rest**, and let
hand edits survive that.

## Honest horizon

- **Weeks 1–3:** you know whether the thesis holds.
- **~6 months:** a demonstrable loop — sketch → generated UI → visual edit →
  scoped AI revision → still running, state intact.
- **~12 months:** something another person can use for real work.
- **ArchiCAD:** a decade and a large team. Correct as a north star, wrong as a
  near-term expectation. Revit did not win on breadth; it won on one property
  executed to undeniable. Modela's is the artifact claim above — drive that to
  undeniable before widening the surface.

## What to guard against

1. **Breadth over depth.** Framework + editor + codegen + AI + plugins +
   multi-platform is six companies. The failure mode is six things permanently at
   70%.
2. **Premature plugin API.** Extensibility needs 2–3 real plugins' worth of use
   cases before the shape is knowable. Building it earlier guarantees rework.
3. **Ecosystem debt.** Lips convincingly removes React's *model* pain — hooks,
   re-render, memo, dependency arrays. It does nothing about routing, data, auth,
   component libraries or hiring. That is what prospective users will actually
   feel, and it should be answered honestly rather than talked past.
4. **Zero external users.** Lips 0.2.0 is solid and weeks old with no outside
   consumer. One real user will reveal which of the 267 specs test the wrong
   thing.

## Open questions

1. What is the sketch → IR representation? Region graph, coarse layout tree, or
   raw strokes with a vision model? Phase 0 should answer this by trying the
   cheapest one first.
2. Is component identity stable across regenerations, or re-derived each time?
   Salvage keying (`key` input) depends on the answer — see RFC-002.
3. Does the flow graph live *inside* the IR or beside it? Inside keeps one
   artifact; beside keeps the IR neutral. Leaning beside, per platform posture.
