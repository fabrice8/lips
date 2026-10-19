/**
 * Phase 0 results → spike/phase0/RESULTS.md
 *
 *   node spike/phase0/report.mjs
 *
 * fit   mean overlap (IoU) of each region with where the sketch put it: 1 is exact
 * mode  mean overlap with where the text-only arm (C) put it: the model's default
 */

import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { iou, px } from './geometry.mjs'

const here = dirname( fileURLToPath( import.meta.url ) )
const dir = join( here, 'results' )
const all = await Promise.all( ( await readdir( dir ) ).filter( f => f.endsWith('.json') ).map( async f => JSON.parse( await readFile( join( dir, f ), 'utf8' ) ) ) )
const C = all.filter( r => r.app && !r.sketch ), runs = all.filter( r => r.sketch && !r.start.failed )

const mean = xs => xs.length ? xs.reduce( ( a, b ) => a + b, 0 ) / xs.length : NaN
const f2 = x => Number.isNaN( x ) ? '—' : x.toFixed( 2 )
const pct = x => Number.isNaN( x ) ? '—' : `${Math.round( x * 100 )}%`
const range = xs => xs.length ? `${f2( mean( xs ) )} (${f2( Math.min( ...xs ) )}–${f2( Math.max( ...xs ) )})` : '—'

/** Overlap with each of C's layouts for the app, averaged */
const mode = ( app, boxes ) => mean( C.filter( c => c.app === app && !c.start.failed ).map( c => {
  const ids = Object.keys( c.start.boxes )
  return mean( ids.map( id => iou( c.start.boxes[ id ], boxes[ id ] ) ) )
}) )
const score = v => ({ yes: 1, partly: 0.5, no: 0 })[ v?.verdict ] ?? NaN

const turns = which => [ 1, 2, 3, 4, 5 ].map( t => runs.map( r => ({ r, turn: r[ which ]?.turns[ t - 1 ] }) ).filter( x => x.turn ) )

const lines = []
const say = s => lines.push( s )
const usage = all.flatMap( r => [ r.start?.usage, ...[ 'A', 'B' ].flatMap( a => r[ a ]?.turns.map( t => t.usage ) || [] ) ] ).flat().filter( Boolean )

say('# Phase 0 results')
say('')
say(`Model ${all[ 0 ]?.model}. ${runs.length} sketch runs, ${C.length} text-only runs, ${usage.length} model calls besides the judge, ${Math.round( mean( usage.map( u => u.ms ) ) / 1000 )} s each on average.`)
say('')
say('## Turn 0: does the first generation follow the sketch?')
say('')
say('| App | fit to sketch | overlap with the text-only layout | text-only fit to the same sketch |')
say('|---|---|---|---|')
for( const app of [ ...new Set( runs.map( r => r.sketch.app ) ) ] ){
  const rs = runs.filter( r => r.sketch.app === app )
  say(`| ${app} | ${range( rs.map( r => r.start.fit ) )} | ${f2( mean( rs.map( r => mode( app, r.start.boxes ) ) ) )} | ${f2( mean( rs.map( r => mean( C.filter( c => c.app === app && !c.start.failed ).map( c => mean( r.sketch.regions.map( g => iou( px( g ), c.start.boxes[ g.id ] ) ) ) ) ) ) ) )} |`)
}
say('')
say('## Revisions: does the sketch hold, and does state survive?')
say('')
say('Fit to the sketch after each revision. A patches regions only; B returns the whole component. Both apply through `swap()` on the running instance.')
say('')
say('| Turn | Request | A fit | B fit | A mode | B mode | A state kept | B state kept | A done | B done |')
say('|---|---|---|---|---|---|---|---|---|---|')
const tA = turns('A'), tB = turns('B')
for( let t = 0; t < 5; t++ ){
  const kind = tA[ t ][ 0 ]?.turn.req.kind || tB[ t ][ 0 ]?.turn.req.kind
  const ok = xs => xs.filter( x => !x.turn.failed )
  say(`| ${t + 1} | ${kind} | ${range( ok( tA[ t ] ).map( x => x.turn.fit ) )} | ${range( ok( tB[ t ] ).map( x => x.turn.fit ) )} | ${f2( mean( ok( tA[ t ] ).map( x => mode( x.r.sketch.app, x.turn.boxes ) ) ) )} | ${f2( mean( ok( tB[ t ] ).map( x => mode( x.r.sketch.app, x.turn.boxes ) ) ) )} | ${pct( mean( ok( tA[ t ] ).map( x => +x.turn.survival.all ) ) )} | ${pct( mean( ok( tB[ t ] ).map( x => +x.turn.survival.all ) ) )} | ${pct( mean( ok( tA[ t ] ).map( x => score( x.turn.verdict ) ) ) )} | ${pct( mean( ok( tB[ t ] ).map( x => score( x.turn.verdict ) ) ) )} |`)
}
say('')
const failed = which => turns( which ).flat().filter( x => x.turn.failed ).length
const retried = which => turns( which ).flat().filter( x => x.turn.tries > 1 ).length
say(`Revisions that never applied: A ${failed('A')}, B ${failed('B')}. Applied after a retry: A ${retried('A')}, B ${retried('B')}.`)
say('')
say('## Drift: fit at turn 5 minus fit at turn 0, per run')
say('')
say('| Sketch | Run | A | B |')
say('|---|---|---|---|')
for( const r of runs ){
  const d = which => { const last = r[ which ]?.turns.filter( t => !t.failed ).at( -1 ); return last ? ( last.fit - r.start.fit ).toFixed( 2 ) : '—' }
  say(`| ${r.sketch.id} | ${r.run} | ${d('A')} | ${d('B')} |`)
}
say('')
say('## The CSS the revisions wrote, as patch operations')
say('')
for( const which of [ 'A', 'B' ] ){
  const ops = {}, features = {}
  for( const x of turns( which ).flat() ) if( !x.turn.failed ){
    for( const [ k, n ] of Object.entries( x.turn.css.ops ) ) ops[ k ] = ( ops[ k ] || 0 ) + n
    for( const k of x.turn.css.features ) features[ k ] = ( features[ k ] || 0 ) + 1
  }
  say(`- **${which}:** ${Object.entries( ops ).map( ( [ k, n ] ) => `${k} ${n}` ).join(', ') || 'none'}. Features in the resulting sheet: ${Object.entries( features ).map( ( [ k, n ] ) => `${k} (${n} turns)` ).join(', ') || 'none'}.`)
}
const dropped = turns('A').flat().reduce( ( s, x ) => s + ( x.turn.dropped || 0 ), 0 )
say(`- A's patches wrote ${dropped} rule(s) outside their own region, which the rig dropped.`)
say('')

await writeFile( join( here, 'RESULTS.md' ), lines.join('\n') + '\n' )
console.log( lines.join('\n') )

