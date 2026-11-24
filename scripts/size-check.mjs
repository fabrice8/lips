#!/usr/bin/env node
/**
 * Size-budget ratchet. Gzips each published entry and fails if any
 * exceeds its budget. Run after `bun run build`; wired into CI.
 *
 * Budgets sit a little above the current measured size — tight enough
 * to catch a real regression, loose enough to absorb noise. Lower them
 * as the bundle shrinks; never raise one without a deliberate reason.
 */
import { readFileSync, existsSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const KB = 1024

/**
 * entry → gzip budget in KB
 *
 * 2026-07-24: full 22→23, runtime 13→14. The application-readiness
 * pass (reactive Map/Set, macro spread arguments, component
 * node + lifecycle event bus) added ~0.9 KB to the runtime. These are
 * load-bearing for real apps rather than optional extras, so the
 * budget moves once, deliberately, instead of the features being
 * trimmed. Next lever if this tightens again: split the event bus and
 * collection reactivity behind opt-in imports.
 *
 * 2026-08-15: full 23→25, precompile 10→12. StyleIR (RFC-004 Layer 1)
 * adds the CSS value scanner to both build-time entries — ~1.7 KB.
 * `runtime` deliberately does NOT move: the style compiler is injected
 * (facade `setStyleCompiler`) rather than imported, so the precompiled
 * entry gains only ~0.2 KB of custom-property bind code and still ships
 * no CSS compiler at all. That gap is the point of the layer, so runtime
 * holding at 14 is the number to watch — if it ever has to rise,
 * something has leaked across the seam.
 *
 * 2026-08-16: full 25→26. `batch()` in the reactivity core — a few
 * hundred bytes, and it sits in every entry because it is part of the
 * signal implementation, not an optional layer.
 *
 * 2026-08-17: runtime 14→15. Per-object signals — each nested object
 * carries its own per-key channels instead of routing every write to the
 * top key. This is the ONE reason `runtime` is allowed to move: the
 * reactivity core ships in every entry by definition. It is NOT the case
 * the previous note was watching for, which was compiler/preprocessor
 * code leaking across the precompiled seam. If runtime grows again,
 * check which of the two it is before touching this number.
 * 2026-08-17: full 26→27, precompile 12→13. RFC-005 — three new template
 * capabilities, all of which are compile-time work: stable translation
 * keys (`i18n="key"` / `i18n-<attr>`), `<context …>` and `<i18n lang=…>`
 * scope blocks, and their five diagnostics. Both build-time entries carry
 * the compiler, so both move together — that pairing is the signature of
 * genuine compiler growth.
 *
 * `runtime` holds at 15 (14.6 measured) even though it gained the
 * `provide` executor and `self.lang`, so the precompiled seam is intact:
 * none of the key parsing or block compilation leaked across it. That
 * gap between precompile and runtime is still the number to watch.
 * 2026-08-21: full 27→28. RFC-005 follow-through — context ownership,
 * onContext over the effective context, lazy dictionaries, and the
 * LIPS-C020 quoted-handler diagnostic.
 *
 * Savings were taken first, not skipped: the root and nested `self`
 * carried byte-identical copies of `node`/`lang`/`emit`/`emitLocal`/
 * `on`/`once`/`off`, now one shared prototype (`selfBus`), plus a dead
 * listener Map and the `watchContext` runtime option the effective-
 * context rewrite made unreachable. That paid back ~0.15 KB and is why
 * `runtime` came back DOWN to 14.9 after touching 15.0.
 *
 * 2026-08-21b: full 28→26 — the Stylis split, taken. It measured 1.89 KB
 * gzipped in context, NOT the 4.4 KB the previous note estimated from
 * gzipping the standalone UMD build; bun tree-shakes it far smaller. The
 * feared cost — "nested CSS silently not working" — mostly did not
 * exist: the scope wrap IS CSS nesting, which every engine with native
 * nesting resolves (see the 2026-10-15 note for the exceptions), so dropping the preprocessor changes the emitted
 * text and not the rendered result. The compiler now hoists the at-rules
 * that cannot legally nest (@keyframes, @font-face, …) out of the wrap
 * itself, which is the one job Stylis was doing that native nesting does
 * not.
 *
 * The budget comes DOWN rather than staying loose: a ratchet that keeps
 * slack it no longer needs stops being a ratchet.
 *
 * 2026-10-15: precompile 13→14 — the native path made correct. The
 * first cut's hoister was a second tokenizer that pulled `@keyframes`
 * out of `@media` (dropping the condition), tore sheets apart on
 * `url(a@page.png)`, let a stray `}` leak rules out of the scope wrap,
 * and was skipped whenever ANY preprocessor was set. It now lives in
 * the scanner, which also `&`-prefixes identifier-led nested selectors
 * (strict-nesting Safari 16.5–17.1 drops `button {…}` otherwise),
 * compacts the output (comments and indentation used to ship verbatim),
 * respects escapes, and reports braces and `&-suffix`. ~1.0 KB gz on
 * every entry that carries the style compiler; full still fits under 26
 * (25.8) — the next style feature there needs a saving first.
 *
 * Remaining lever: the `<router>` builtin is registered eagerly in
 * lips.ts, so it cannot tree-shake for apps that never route.
 *
 * 2026-10-16: full 26→26.5 — the host seam (RFC-006 L0). The runtime now
 * reaches every node through a `Host`, and the DOM host object is ~1 KB
 * of method table the minifier cannot rename: +0.37 KB gz on `runtime`
 * (14.62 → 14.99), absorbed inside its budget with 8 BYTES to spare. The
 * compiler's `'tree'` target (`BlockIR.nodes`, LIPS-C021) adds ~0.29 KB to
 * both compiler-bearing entries; `precompile` absorbs it (13.50 → 13.79).
 * `full` carries both, 25.79 → 26.44, so it moves — to 26.5, not a round
 * 27: the ratchet stays tight.
 *
 * Savings were looked for first: a shared render-and-place helper paid
 * back almost nothing, because gzip had already collapsed the repetition
 * it removed. `<router>` stays eagerly registered by decision. The lever
 * left is putting the tree emitter behind an injected hook like
 * `setStyleCompiler`, since DOM-only apps never compile for `'tree'`.
 * `runtime` is AT its budget: the next runtime change (L1 adds one) moves
 * it, deliberately and by the least that fits.
 *
 * 2026-10-16b: full 26.5→26.55 — the Lynx style pipeline (RFC-006 L2).
 * What the style compiler gained for it is two options and a fix: a
 * `scope` selector (Lynx scopes by class), a `lint` hook (a target's
 * rules, reported on the source), and statements that start at their
 * first character, so every style diagnostic points at the right column.
 * +69 bytes on `full` (26.443 → 26.512) and on `precompile` (13.79 →
 * 13.86, inside 14). The Lynx rules themselves — the property list, the
 * selector and value checks, the full-value rewrite — live in
 * `src/lynx/style.ts` and cost the DOM bundles nothing.
 *
 * Savings were taken first: the static-declaration fast path went (the
 * general path emits the same text), and the Lynx-only parts the first
 * cut put in the core — full-value binds, a required preprocessor — moved
 * out, from +254 bytes down to +69. `runtime` gained 6 bytes for a bind's
 * unit (14.993 → 14.999) and holds at 15, with 1 byte left. The lever
 * named above still stands and is bigger than this raise: the `'tree'`
 * emitter is woven through the HTML emitter, but a post-pass that
 * re-parses each block's `html` skeleton could replace it (~0.29 KB on
 * both compiler-bearing entries).
 *
 * 2026-11-16: full 26.55→33.85, and a new `mf2` entry at 7.8 — Unicode
 * MessageFormat 2. Every message is MF2 now, formatted by `messageformat`
 * (v4, the OpenJS implementation of the CLDR 47 standard): CLDR plural
 * categories, `:number`/`:currency`/`:percent`/`:date`/`:time`/`:unit`
 * through `Intl`, bidi isolation, and no `new Function` anywhere — the
 * old `condition` format evaluated dictionary text, which broke the
 * `interpreted` mode's CSP promise. The library is 7.6 KB gz; our own
 * code nets to zero (dropping the old formatters paid for the lookup,
 * the `Intl` fallback and `pick`), so `full` moves by the library:
 * 26.52 → 33.83 as CI's bun minifies it (a local bun reads ~0.1 lower).
 *
 * `runtime` does NOT move — it came DOWN, 14.999 → 14.90. The engine is
 * INJECTED like the style compiler (`setMessageFormat`), so an app on
 * `./runtime` that never translates ships none of it, and one that does
 * passes `messageFormat` from `@lipsjs/lips/i18n` (`mf2.min.js`), whose
 * budget is the library's. Squeezed further, measured: a parser-free
 * engine (dictionaries served as data model) would save 1.65 KB of the
 * 7.6, and needs a parser-free build of `messageformat` upstream.
 *
 * Why the library and not our own smaller formatter: the platform that
 * serves dictionaries (Cosense) parses and checks every message with the
 * same library, so a message cannot mean one thing there and another
 * here. A second implementation would be a second meaning.
 *
 * 2026-11-18: full 33.85→34.05, runtime 15→15.15, precompile 14→14.15,
 * and a new `untrusted` entry at 9.35 — RFC-007, templates you did not
 * write. The policy, its guarded evaluator, its compile-time check and
 * its page-boundary host are the `untrusted` entry, passed to Lips by
 * VALUE like `messageFormat`: first measured inside the full build it was
 * +5.6 KB gz on every app, for a feature most never use. What stays in
 * the core is what the core has to carry:
 *  - the seam: a `guard` hook in the expression runner and in the
 *    handler-name fallback, the `self` mark, the facade passing the
 *    policy's pieces through — ~0.09 on runtime; it is also what lets
 *    `./runtime` render untrusted PRECOMPILED templates
 *  - token positions in the expression AST (`at`), so a refusal is
 *    reported at its column — ~0.025 on every entry
 *  - three fixes the review found in the trusted modes too: name tables
 *    that answered `constructor` through Object.prototype, a comment that
 *    did not round-trip, an unquoted scope name — ~0.04
 * Savings were taken first: the name tables are `__proto__: null`
 * literals rather than a helper call (a call is not droppable, and kept
 * the interpreter's globals in `precompile`), `mode: 'compiled'` is
 * ignored under a guard instead of thrown on, and the style hook wraps
 * the compiler rather than repeating its arguments.
 *
 * The untrusted entry is ~60% policy and ~40% the expression parser it
 * needs to check expressions where they are written. It ships only to the
 * apps that import it.
 *
 * 2026-11-23: a new `lynx` entry at 17.25 — the Lynx pass (RFC-006) for a
 * build step: `compileLynxTemplate`, `lynxVocabulary`, `compileLynxStyle`.
 * It was reachable only from source, so a consumer could not hold its own
 * templates to it. Build-time like `precompile`, and the same parser and
 * compiler plus the Lynx vocabulary and style rules (17.13 measured). No
 * other entry moves: it imports what they already hold.
 *
 * 2026-11-24: lynx 17.25→17.75 — inline SVG (lips#34). The template pass
 * keeps an `<svg>` whole and holds it to what Lynx's svg draws: the 17
 * tags and ~40 attributes Lynx publishes, and the `LIPS-L108` messages,
 * +0.53 KB (17.12 → 17.65). The lists are the bulk and are Lynx's own;
 * the messages were kept whole, since they are what a developer reads.
 * The background host's half (writing the subtree into `content`) is in
 * no entry: the hosts ship with the app's own bundles.
 *
 * 2026-11-24b: full 34.05→34.25, runtime 15.15→15.25, precompile
 * 14.15→14.25, lynx 17.75→17.85 — event modifiers (lips#36), the first
 * change to `Host.listen` since the seam. Measured (gz):
 *  - the DOM host reads `.stop`, `.capture` and `.outside` from the event
 *    name: +0.09 on runtime (15.05 → 15.14), on every app. It is platform
 *    calls a minifier cannot shorten (`stopPropagation`, `contains`, the
 *    capture flag, the document); the runtime itself is unchanged, since
 *    the name crosses the seam as written
 *  - the compiler refuses a modifier the hosts do not know (`LIPS-C022`),
 *    which they would otherwise drop without a word: +0.14 on precompile
 *    (14.05 → 14.19) and on lynx, +0.23 on full with the host
 * Savings were taken first: the messages were cut to one line each and
 * the hint folded into the message (-0.02), and the host reads the name
 * with `includes` rather than splitting it (-0.01). Budgets keep the
 * ~0.1 margin CI's bun has needed over a local read.
 *
 * 2026-11-24c: full 34.25→34.35, runtime 15.25→15.35 — element
 * references (lips#37). `@ref="name"` already compiled (an `@` name is a
 * prop bind), so the compiler is unchanged. The runtime keeps the node on
 * the template's `self.refs` while it lives, and does the same on the path
 * a tag no component claims renders by, which is how Lynx's own elements
 * (`scroll-view`, `list`) render: +0.12 on runtime (15.14 → 15.26), +0.11
 * on full. Both paths share one helper. There is no method table in the
 * core: on the DOM the ref is the element, and the Lynx background host,
 * in no entry, gives its nodes the DOM's methods. `untrusted` refuses
 * `self.refs` as it refuses `self.node`, inside its budget (9.29).
 *
 * 2026-11-24d: full 34.35→34.45, runtime 15.35→15.40, lynx 17.85→17.95 —
 * no code change. CI's bun read the branch above every local read: full
 * 34.36 (local 34.25), lynx 17.86 (17.79), runtime 15.31 (15.26). The
 * budgets are set from CI's reads, with the usual ~0.1 margin.
 *
 * 2026-11-24e: new `lynx-main` entry at 2.3 and `lynx-background` at
 * 4.85 — the Lynx runtime, published (lips#38). They were in no entry:
 * an app outside this repository could not render on Lynx. One entry per
 * thread, because each thread loads its own bundle, and the main thread's
 * is the one on the first frame: an entry holding both would make every
 * app rely on its bundler shaking the other half out of a prebuilt file.
 * Measured: the applier 2.21, the background host (ARIA, svg markup, UI
 * methods) 4.74. Neither holds the IR runtime: the background imports
 * `renderIR` from `./runtime`, so it is bundled once. No other entry
 * moves. `lynx-plugin.mjs` has no budget: it runs in Node, in the build,
 * and ships to no device (13.5 gz, Stylis and the style compiler inside).
 */
const BUDGETS = {
  'dist/lips.min.js': 34.45,     // full: runtime + parser/compiler + style compiler + router
  'dist/runtime.min.js': 15.40,  // precompiled-only: none of the above
  'dist/precompile.min.js': 14.25, // build-time: parser + compiler + style compiler
  'dist/stylis.min.js': 3,       // opt-in preprocessor — not loaded unless asked for
  'dist/mf2.min.js': 7.8,        // opt-in MessageFormat 2 engine for `./runtime` — the full entry carries it
  'dist/untrusted.min.js': 9.35, // opt-in policy for templates you did not write (RFC-007) — no entry carries it
  'dist/lynx.min.js': 17.95,     // build-time Lynx pass (RFC-006): template vocabulary and style lint — no entry carries it
  'dist/lynx-main.min.js': 2.3,  // Lynx main thread: the applier over Element PAPI
  'dist/lynx-background.min.js': 4.85 // Lynx background thread: the host the runtime renders into
}

let failed = false
const rows = []

for( const [ file, budget ] of Object.entries( BUDGETS ) ){
  if( !existsSync( file ) ){
    rows.push([ file, 'MISSING', `${budget}`, 'FAIL' ])
    failed = true
    continue
  }

  const gz = gzipSync( readFileSync( file ) ).length / KB
  const over = gz > budget
  failed ||= over

  rows.push([
    file.replace('dist/', ''),
    gz.toFixed( 2 ),
    budget.toFixed( 2 ),
    over ? 'OVER' : 'ok'
  ])
}

const w = arr => arr.map( ( s, i ) => String( s ).padEnd([ 24, 9, 9, 6 ][ i ]) ).join('')
console.log( w([ 'entry', 'gz KB', 'budget', '' ]) )
for( const r of rows ) console.log( w( r ) )

if( failed ){
  console.error('\n✗ size budget exceeded — trim the bundle or justify a new budget in scripts/size-check.mjs')
  process.exit( 1 )
}
console.log('\n✓ all entries within budget')
