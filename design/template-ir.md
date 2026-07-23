# RFC-001 — Template IR: the Phase 2 engine

> Status: draft for review · 2026-07-23
> Prereqs: [ROADMAP.md](../ROADMAP.md) Phases 0–1 complete (64-spec suite, CI, baseline)
> Evidence: [spike/RESULTS.md](../spike/RESULTS.md), [bench/baseline/2026-07-23-1k.json](../bench/baseline/2026-07-23-1k.json)

## 1. Context

Lips serves two customers with one artifact:

- **Modela**: templates are *generated at runtime* by an assistant, revised continuously,
  and must render live with structured feedback on errors. The component definition is an
  interchange format, not just an API.
- **Standalone devs**: a no-build, HTML-native, fine-grained framework whose honest
  benchmark story depends on replacing the digest architecture.

The measured gap (1k rows, medians): create **490ms vs 4.2ms**, update **109ms vs 0.2ms**
against the IR prototype. The prototype proves the ceiling; this RFC specifies the real
engine.

**One artifact, four consumers:** the IR is (1) the runtime render program, (2) the
serializable/portable Modela artifact, (3) the target of an optional build-time compiler
(CSP mode), and (4) the unit of hot-swap diffing.

## 2. Goals / non-goals

**Goals**
1. Template string → IR in one pass, with positioned machine-readable diagnostics
2. IR → DOM via `cloneNode` + bind walk; updates via per-key signals — O(changed)
3. IR is JSON-serializable and deterministic (same template → same IR)
4. Dual expression execution: compiled (`Function`, trusted) / interpreted (CSP/sandbox)
5. State-preserving hot-swap: `swap(instance, newIR)` re-renders only changed regions
6. Public template syntax unchanged — the 64-spec suite is the compatibility contract

**Non-goals (this phase)**
- SSR/hydration (IR is designed not to preclude it; work is Phase 3)
- New template syntax
- Non-DOM renderers (the IR/renderer seam makes them possible later; only DOM ships now)

## 3. Pipeline

```
template string
  │  tokenizer (chars → tags/attrs/text/interpolations, positions kept)
  ▼
  parser (tokens → TemplateAST, error-recovering)
  │  • collects Diagnostics instead of throwing
  │  • whitespace preserved per HTML semantics (<pre>, textarea)
  ▼
  compiler (AST → TemplateIR)
  │  • static HTML skeleton extraction per block
  │  • binding table with childNodes paths
  │  • expression table (deduped source strings + AST-derived deps)
  ▼
  TemplateIR ──────────────► JSON (Modela artifact / precompiled module)
  │
  ▼
  runtime: instantiate(ir) = clone skeleton → walk binds → wire signals
```

The tokenizer/parser owns the syntax — **no innerHTML, no regex preprocessing**. This
removes the entire fragility class: table-context hoisting, attribute-name lenience
differences (the `<for [item, i]>` happy-dom failure), whitespace corruption, silent
mis-parses.

## 4. The IR

```ts
interface TemplateIR {
  v: 1                        // format version — hot-swap refuses mismatches
  exprs: string[]             // deduped expression sources (see §5)
  root: BlockIR
}

/** A contiguous static region with its dynamic bindings */
interface BlockIR {
  html: string                // static skeleton; anchors compiled in as <!--□n-->
  binds: BindIR[]
  blocks: ChildBlockIR[]      // control-flow regions at anchor positions
}

type Path = number[]          // childNodes index walk from block root
type E = number               // index into exprs

type BindIR =
  | { t: 'text',   p: Path, e: E }                          // textContent
  | { t: 'attr',   p: Path, name: string, e: E }            // set/removeAttribute
  | { t: 'prop',   p: Path, name: string, e: E }            // @html, @text, value…
  | { t: 'event',  p: Path, name: string, e: E }            // compiled handler call
  | { t: 'spread', p: Path, e: E }                          // ...state.attrs
  | { t: 'comp',   p: Path, name: string | { e: E },        // <badge/> or <{expr}/>
      inputs: Record<string, E | { lit: unknown }>,
      contents?: BlockIR }                                  // slotted body

type ChildBlockIR =
  | { t: 'if',     a: number,                                // anchor id
      branches: { when: E | null, block: BlockIR }[] }       // when:null = else
  | { t: 'for',    a: number, of: E, args: string[],
      by?: string | E, block: BlockIR }
  | { t: 'switch', a: number, on: E,
      cases: { is: (string | number)[] | null, block: BlockIR }[] }
  | { t: 'async',  a: number, awaitE: E,
      then?: { args: string[], block: BlockIR },
      catch?: { args: string[], block: BlockIR },
      loading?: BlockIR }
  | { t: 'let',    a: number, vars: Record<string, E | { lit: unknown }> }
```

Design notes:
- **Static skeletons** are parsed once into a `<template>` element at IR load;
  instantiation is `content.cloneNode(true)` — the technique that put the prototype at
  vanilla-level create times.
- **Anchors** are comment nodes compiled into the skeleton; control-flow blocks own the
  range after their anchor. This keeps today's boundary-comment model, but assigned by
  the compiler rather than at render time.
- **Paths are precomputed integers**, not runtime-generated strings — this replaces the
  string path namespace (`0:app/c2:pr[0]`) whose prefix collisions are a live known issue.
- Macros compile away: a macro call site inlines the macro's BlockIR with an argument
  scope — no runtime macro machinery.

## 5. Expressions

A dedicated mini-parser for the expression subset (member access, calls, literals,
unary/binary/ternary, arrow functions, template interpolation splitting). Output per
expression: normalized source, AST, and **precise dependency paths** (`state.items`,
`input.user.name`, scope vars) — replacing the regex extraction and its false positives
(`__isReactive__`'s unescaped scope-key regex).

Two interchangeable executors over the same expression table:

| mode | mechanism | context | cost |
|---|---|---|---|
| compiled | one `new Function(params…)` per unique expr at IR load — no `with`, strict-safe | trusted pages, the Modela editor | ~vanilla |
| interpreted | small AST walker | CSP (`script-src` without `unsafe-eval`), untrusted embeds | 3–10× per eval — acceptable off the hot path because deps are precise |

A build-time step (Vite plugin, Phase 3) emits the compiled functions as a module —
same IR, zero runtime eval, closing both the CSP gap and the startup gap to compiled
frameworks.

## 6. Reactivity & runtime

- **State**: per-key signals (shallow by default; `deep: true` opt-in wraps nested
  objects). Writes notify only subscribers of that key — deletes `deepClone` snapshots,
  the `isEqual` digest, and the deep Proxy (IUC).
- **Instantiate**: clone skeleton → resolve bind paths → create one effect per bind.
  Effects are owned by the instance; `dispose()` walks them — the SCI/PCC teardown
  bookkeeping collapses into plain ownership.
- **`for` blocks**: keyed reconciler (LIS-based minimal moves) over block instances;
  `by=` semantics carried over from Phase 1 unchanged. Fixes the replace-path garbage
  accumulation in the baseline by making instance teardown symmetric with creation.
- **Signal history** moves to an opt-in `historySignal()` wrapper (Modela editor keeps
  undo/redo; runtime pages stop paying for 100-entry histories per signal).
- **Lifecycle**: `onAttach`/`onDetach` become ownership events (parent renders/removes
  you) instead of document-wide MutationObserver scanning — DWS retires.

## 7. Diagnostics — the assistant contract

```ts
interface Diagnostic {
  code: string                       // stable, e.g. 'LIPS-P012'
  severity: 'error' | 'warning'
  message: string                    // human-readable
  hint?: string                      // actionable fix, e.g. "close <if> before </div>"
  loc: { line: number, col: number, offset: number, length: number }
}

parse( template: string ): { ir: TemplateIR, diagnostics: Diagnostic[] }
```

- `parse` **never throws**; recovery inserts error-region blocks so partial templates
  render partially (a half-written assistant template must not blank the Modela canvas)
- Codes are stable API: the assistant's generate → parse → repair loop keys on them
- Runtime errors join the same shape and flow to the Phase 1 `onError` boundary

## 8. Hot-swap

```ts
instance.swap( newIR ): SwapReport
```

Structural diff of old vs new block trees (blocks matched by kind + position + expression
sources): unchanged blocks keep their DOM and signal subscriptions; changed binds
re-evaluate in place; changed skeleton regions re-clone locally. Component **state lives
outside the IR**, so it survives by construction. `SwapReport` lists replaced regions —
Modela can flash-highlight what changed. This is HMR semantics as a first-class runtime
API, and the editor's core interaction.

## 9. Migration plan

1. Engine behind a flag: `new Lips({ engine: 'ir' })`; current engine remains default
2. Gate A — **compat**: the full spec suite green on both engines (the suite is the
   spec; divergences either fix the IR engine or update a documented behavior with a
   changelog entry)
3. Gate B — **perf**: `bench/` medians vs the committed baseline; budgets from ROADMAP
   (create ≤ 1.4× vanilla, update ≤ 1.2×, memory −50%)
4. Default flips; one deprecation release later, TPS (regex preprocessor), IUC (deep
   proxy), and DWS are deleted
5. Public syntax is untouched throughout; `Template` objects remain the definition format

Build order inside Phase 2: expression parser → tokenizer/parser + diagnostics → IR
compiler → runtime (binds, then control-flow blocks, then components) → keyed
reconciler → hot-swap. Each stage lands with its own specs; the existing suite runs
against the flag in CI from the first runtime milestone.

## 10. Resolved decisions (maintainer review, 2026-07-23)

1. **Scope vars** (`<let>`/`<const>`) → **block-local signal slots**; deps become precise.
2. **Spread ordering** → the before/after-spread precedence rules the current engine
   implements ad hoc get a codified spec section before compiler work starts.
3. **i18n hook points** → plugin taps at text/attr bind evaluation; hook shape confirmed
   early in Phase 2 so `@lipsjs/i18n` can leave the core in Phase 3.
4. **Interpolation of nullish values** → IR engine renders **`''`** (matching React/Vue).
   Breaking change vs the current literal `"undefined"` — ships with a changelog entry
   when the engine default flips; no compat flag.
5. **`.lips` single-file format** → **first-class parser input from day one**: the parser
   accepts the `demos/jsml` SFC layout (frontscript + template), so the playground and
   Modela's generated artifacts share one parser.
