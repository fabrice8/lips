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
 */
const BUDGETS = {
  'dist/lips.min.js': 23,        // full: runtime + parser/compiler + stylis + router
  'dist/runtime.min.js': 14,     // precompiled-only: no compiler, no stylis, no router
  'dist/precompile.min.js': 10   // build-time: parser + compiler + stylis
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
