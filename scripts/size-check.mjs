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
 */
const BUDGETS = {
  'dist/lips.min.js': 26.55,     // full: runtime + parser/compiler + style compiler + router
  'dist/runtime.min.js': 15,     // precompiled-only: none of the above
  'dist/precompile.min.js': 14,  // build-time: parser + compiler + style compiler
  'dist/stylis.min.js': 3        // opt-in preprocessor — not loaded unless asked for
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

const w = arr => arr.map( ( s, i ) => String( s ).padEnd([ 20, 9, 9, 6 ][ i ]) ).join('')
console.log( w([ 'entry', 'gz KB', 'budget', '' ]) )
for( const r of rows ) console.log( w( r ) )

if( failed ){
  console.error('\n✗ size budget exceeded — trim the bundle or justify a new budget in scripts/size-check.mjs')
  process.exit( 1 )
}
console.log('\n✓ all entries within budget')
