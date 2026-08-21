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
 * feared cost — "nested CSS silently not working" — turned out not to
 * exist: the scope wrap IS CSS nesting, which browsers have resolved
 * natively since 2023, so dropping the preprocessor changes the emitted
 * text and not the rendered result. The compiler now hoists the at-rules
 * that cannot legally nest (@keyframes, @font-face, …) out of the wrap
 * itself, which is the one job Stylis was doing that native nesting does
 * not.
 *
 * The budget comes DOWN rather than staying loose: a ratchet that keeps
 * slack it no longer needs stops being a ratchet.
 *
 * Remaining lever: the `<router>` builtin is registered eagerly in
 * lips.ts, so it cannot tree-shake for apps that never route.
 */
const BUDGETS = {
  'dist/lips.min.js': 26,        // full: runtime + parser/compiler + style compiler + router
  'dist/runtime.min.js': 15,     // precompiled-only: none of the above
  'dist/precompile.min.js': 13,  // build-time: parser + compiler + style compiler
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
    gz.toFixed( 1 ),
    budget.toFixed( 1 ),
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
