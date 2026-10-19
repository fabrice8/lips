/**
 * RFC-003 Phase 0: does a sketched layout survive successive AI revisions
 * of a running Lips component, with its live state intact?
 *
 *   node spike/phase0/run.mjs [--only inbox-a,shop-b] [--runs 3] [--jobs 4]
 *
 * Per sketch and run, one generated component is revised five times by
 * each arm: A patches regions only (spliced, then swap()), B returns the
 * whole component (then swap()). C generates each app from text alone:
 * the layout the model reaches for. Results go to spike/phase0/results/.
 */

import { createServer } from 'node:http'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, extname, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '../../demos/lynx/node_modules/playwright/index.mjs'
import { APPS, SKETCHES, VIEW } from './sketches.mjs'
import { iou, fit } from './geometry.mjs'
import { SYSTEM, JUDGE, generate, reviseWhole, revisePatch, judge } from './prompt.mjs'
import { ask, MODEL } from './model.mjs'

const here = dirname( fileURLToPath( import.meta.url ) )
const root = join( here, '../..' )
const arg = ( name, dflt ) => { const i = process.argv.indexOf( `--${name}` ); return i > 0 ? process.argv[ i + 1 ] : dflt }
const RUNS = +arg( 'runs', 3 ), JOBS = +arg( 'jobs', 4 ), ONLY = arg( 'only', '' ).split(',').filter( Boolean )
const OUT = join( here, 'results' )
const TYPED = 'persist-42'

// ------------------------------------------------------------- the page
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.map': 'application/json' }
const server = createServer( async ( req, res ) => {
  try {
    const body = await readFile( join( root, decodeURIComponent( new URL( req.url, 'http://x' ).pathname ) ) )
    res.writeHead( 200, { 'content-type': MIME[ extname( req.url ) ] || 'application/octet-stream' }).end( body )
  }
  catch { res.writeHead( 404 ).end() }
}).listen( 0 )
const PAGE = `http://localhost:${server.address().port}/spike/phase0/page.html`

const browser = await chromium.launch()
async function open(){
  const page = await browser.newPage({ viewport: VIEW })
  await page.goto( PAGE )
  await page.waitForFunction( () => window.ready )
  return page
}
const rig = ( page, fn, ...args ) => page.evaluate( ( [ fn, args ] ) => window.rig[ fn ]( ...args ), [ fn, args ] )

// ------------------------------------------------------------ measuring
/** Set live state the way a user would; what changed is what must survive */
async function probe( page ){
  const before = await rig( page, 'state' )
  // Typing last: a search box can filter the picks away
  const picks = page.locator('[data-probe="pick"]')
  const n = await picks.count()
  n && await picks.nth( Math.min( 1, n - 1 ) ).click()
  const toggle = page.locator('[data-probe="toggle"]').first()
  await toggle.count() && await toggle.click()
  const text = page.locator('[data-probe="text"]').first()
  await text.count() && await text.fill( TYPED )
  const after = await rig( page, 'state' )
  const set = Object.keys( after ).filter( k => JSON.stringify( after[ k ] ) !== JSON.stringify( before[ k ] ) )
  return { found: { text: !!await text.count(), picks: n, toggle: !!await toggle.count() }, set, values: Object.fromEntries( set.map( k => [ k, after[ k ] ] ) ) }
}

/** The probed state still holds, the UI still reads it, and the typed text still shows */
async function survives( page, p, comp ){
  const now = await rig( page, 'state' )
  const src = comp.template + JSON.stringify( comp.handlers || {} )
  const keys = p.set.map( k => ({
    key: k,
    held: JSON.stringify( now[ k ] ) === JSON.stringify( p.values[ k ] ),
    read: new RegExp( `state\\.${k}\\b` ).test( src )
  }) )
  const text = page.locator('[data-probe="text"]').first()
  const shown = await text.count() ? await text.inputValue() === TYPED : false
  return { keys, shown, all: keys.every( k => k.held && k.read ) && ( !p.found.text || shown ) }
}

/** Crude CSS → { 'at-prelude|selector': { prop: value } }; enough to diff */
function rules( css, at = '' ){
  const out = {}
  let i = 0
  css = ( css || '' ).replace( /\/\*[\s\S]*?\*\//g, '' )
  while( i < css.length ){
    const open = css.indexOf( '{', i )
    if( open < 0 ) break
    const pre = css.slice( i, open ).trim()
    let depth = 1, j = open + 1
    while( j < css.length && depth ) css[ j ] === '{' ? depth++ : css[ j ] === '}' && depth--, j++
    const body = css.slice( open + 1, j - 1 )
    if( pre.startsWith('@') && /^@(media|supports|container|layer)/.test( pre ) ) Object.assign( out, rules( body, pre ) )
    else if( pre.startsWith('@') ) out[ `${pre}` ] = { '@': body.trim() }
    else for( const sel of pre.split(',') )
      out[ `${at}|${sel.trim()}` ] = Object.fromEntries( body.split(';').map( d => d.split(':') ).filter( d => d.length > 1 ).map( ( [ p, ...v ] ) => [ p.trim(), v.join(':').trim() ] ) )
    i = j
  }
  return out
}
/** What a revision did to the CSS, as patch operations */
function cssOps( before, after ){
  const a = rules( before ), b = rules( after ), ops = {}
  const add = k => ops[ k ] = ( ops[ k ] || 0 ) + 1
  for( const k in b ) if( !( k in a ) ) add( k.startsWith('@') ? `add ${k.split(/\s/)[ 0 ]}` : 'add rule' )
  for( const k in a ) if( !( k in b ) ) add( 'remove rule' )
  for( const k in b ) if( k in a ) for( const p in b[ k ] )
    p in a[ k ] ? a[ k ][ p ] !== b[ k ][ p ] && add( 'change declaration' ) : add( 'add declaration' )
  const features = new Set()
  for( const k in b ){
    k.startsWith('@media') && features.add('@media')
    ;/::/.test( k ) && features.add('pseudo-element')
    ;/:(has|is|where|nth-child|hover|focus)/.test( k ) && features.add( k.match( /:(has|is|where|nth-child|hover|focus)/ )[ 0 ] )
    for( const v of Object.values( b[ k ] ) ) /gradient\(/.test( v ) && features.add('gradient')
    for( const p in b[ k ] ) /^(transition|animation|backdrop-filter|box-shadow)$/.test( p ) && features.add( p )
  }
  return { ops, features: [ ...features ] }
}

// --------------------------------------------------------------- model
const regionsOf = app => Object.keys( APPS[ app ].regions )
const asIs = async json => ({ comp: json })

/**
 * Ask, build, apply with `method` ('load' or 'revise'). A compile error,
 * a runtime error or a failed `check` goes back to the model, twice at most.
 */
async function attempt( page, prompt, method, build = asIs, check = async () => null ){
  const usage = []
  let msg = prompt
  for( let i = 1; i <= 3; i++ ){
    const r = await ask( SYSTEM, msg )
    usage.push( r.usage )
    let built, res
    try { built = await build( r.json ); res = await rig( page, method, built.comp ) }
    catch( e ){ res = { ok: false, runtime: e.message } }
    const problem = !res.ok ? res.diagnostics || res.runtime
      : ( await rig( page, 'errors' ) ).join('; ') || await check( page )
    if( !problem ) return { ...built, res, tries: i, usage }
    msg = `${prompt}\n\nYour last reply did not work:\n${JSON.stringify( problem ).slice( 0, 2000 )}\nFix it and reply again.`
  }
  return { comp: null, usage }
}

/** Arm A: splice each region's new element in; keep only CSS scoped to it */
async function patch( page, json, comp, base, styles, app ){
  let template = comp.template, dropped = 0
  const next = { ...styles }
  for( const p of json.patches || [] ){
    if( !regionsOf( app ).includes( p.region ) ) throw new Error(`no region "${p.region}"`)
    template = await rig( page, 'splice', template, p.region, p.template )
    if( !template ) throw new Error(`region "${p.region}" is missing from the template`)
    if( !await rig( page, 'region', template, p.region ) ) throw new Error(`the patch for "${p.region}" lost its data-region`)
    const scope = `[data-region="${p.region}"]`
    const kept = Object.entries( rules( p.style ) ).filter( ( [ k ] ) => k.split('|')[ 1 ]?.startsWith( scope ) || !++dropped )
    next[ p.region ] = kept.map( ( [ k, d ] ) => {
      const [ at, sel ] = k.split('|'), decl = Object.entries( d ).map( ( [ p, v ] ) => `${p}: ${v}` ).join('; ')
      return at ? `${at} { ${sel} { ${decl} } }` : `${sel} { ${decl} }`
    }).join('\n')
  }
  return {
    comp: { state: { ...comp.state, ...json.state }, handlers: { ...comp.handlers, ...json.handlers }, template, style: [ base, ...Object.values( next ) ].join('\n') },
    styles: next, dropped
  }
}

// ----------------------------------------------------------------- runs
/** Turn 0 must have every region and every probe, or it goes back */
async function generation( page, app, sketch ){
  const check = async page => {
    const boxes = await rig( page, 'measure' )
    const missing = regionsOf( app ).filter( id => !boxes[ id ] )
    const probes = await page.evaluate( () => [ 'text', 'pick', 'toggle' ].filter( p => !document.querySelector(`[data-probe="${p}"]`) ) )
    return missing.length || probes.length ? `missing data-region: ${missing.join(', ') || 'none'}; missing data-probe: ${probes.join(', ') || 'none'}` : null
  }
  const g = await attempt( page, generate( app, sketch ), 'load', asIs, check )
  return g.comp ? { comp: g.comp, tries: g.tries, usage: g.usage, boxes: await rig( page, 'measure' ) } : { failed: true, usage: g.usage }
}

/** Fills `out` turn by turn, calling `save` after each so a viewer can follow along */
async function arm( which, start, sketch, app, out, save ){
  const page = await open()
  await rig( page, 'load', start.comp )
  const p = out.probe = await probe( page )
  let comp = start.comp, styles = {}
  const turns = out.turns = []
  for( const req of APPS[ app ].requests ){
    const made = which === 'A'
      ? await attempt( page, revisePatch( comp, req, regionsOf( app ) ), 'revise', json => patch( page, json, comp, start.comp.style, styles, app ) )
      : await attempt( page, reviseWhole( comp, req ), 'revise' )
    if( !made.comp ){ turns.push({ req, failed: true, usage: made.usage }); await save(); continue }
    if( which === 'A' ) styles = made.styles
    const boxes = await rig( page, 'measure' )
    const judged = await ask( JUDGE, judge( req, comp, made.comp ) ).catch( e => ({ json: { verdict: 'error', why: e.message } }) )
    const verdict = judged.json
    turns.push({
      req, tries: made.tries, usage: made.usage, boxes,
      fit: fit( sketch, boxes ),
      swap: { changes: made.res.report.changes.length, salvaged: made.res.report.salvaged.length },
      survival: await survives( page, p, made.comp ),
      css: cssOps( comp.style, made.comp.style ),
      dropped: made.dropped || 0, verdict, judgeUsage: judged.usage,
      component: made.comp
    })
    comp = made.comp
    await save()
    console.log(`  ${sketch.id} ${which}${turns.length} ${req.kind}: fit ${turns.at( -1 ).fit.toFixed( 2 )}, done ${turns.at( -1 ).verdict.verdict}`)
  }
  await page.close()
}

async function job( sketch, run ){
  const file = join( OUT, `${sketch.id}.${run}.json` )
  const page = await open()
  const start = await generation( page, sketch.app, sketch )
  await page.close()
  const result = { model: MODEL, sketch, run, start: { ...start, fit: start.boxes && fit( sketch, start.boxes ) } }
  const save = () => writeFile( file, JSON.stringify( result, null, 1 ) )
  await save()
  if( !start.failed ){
    await arm( 'A', start, sketch, sketch.app, result.A = {}, save )
    await arm( 'B', start, sketch, sketch.app, result.B = {}, save )
  }
  console.log(`✓ ${sketch.id} run ${run}: start fit ${result.start.fit?.toFixed( 2 )}`)
}

async function textOnly( app, run ){
  const page = await open()
  const start = await generation( page, app, null )
  await page.close()
  await writeFile( join( OUT, `C.${app}.${run}.json` ), JSON.stringify({ model: MODEL, app, run, start }, null, 1 ) )
  console.log(`✓ C ${app} run ${run}`)
}

// ------------------------------------------------------------------ main
/** The rig alone, no model: the prompt's example loads, probes, splices and survives a swap */
if( process.argv.includes('--smoke') ){
  const { EXAMPLE } = await import('./prompt.mjs')
  const page = await open(), ok = ( what, v ) => console.log(`${v ? '✓' : '✗'} ${what}`)
  ok( 'the example compiles and mounts', ( await rig( page, 'load', EXAMPLE ) ).ok && !( await rig( page, 'errors' ) ).length )
  const boxes = await rig( page, 'measure' )
  ok( 'both regions measure', boxes.list?.w > 0 && boxes.detail?.w > 0 )
  const p = await probe( page )
  ok( `probing sets state (${p.set.join(', ')})`, p.set.includes('query') && p.set.includes('open') && p.set.includes('pinned') )
  const template = await rig( page, 'splice', EXAMPLE.template, 'detail', '<main class="main" data-region="detail"><h2>Patched {state.open}</h2></main>' )
  ok( 'splice replaces one region only', template && template.includes('Patched') && template.includes( await rig( page, 'region', EXAMPLE.template, 'list' ) ) )
  const res = await rig( page, 'revise', { ...EXAMPLE, template })
  ok( 'the patched template swaps in', res.ok && res.report.changes.length > 0 )
  ok( 'the new region renders live state', ( await page.textContent('[data-region="detail"]') ).includes('Patched 2') )
  const s = await survives( page, p, { ...EXAMPLE, template })
  ok( `typed text and state survive (${JSON.stringify( s.keys.map( k => k.key + ( k.held ? '' : '!held' ) + ( k.read ? '' : '!read' ) ) )})`, s.shown && s.keys.every( k => k.held ) )
  ok( 'a dropped key is caught as no longer read', !s.all )
  const notes = EXAMPLE.state.notes.map( n => ({ ...n, title: n.title.toUpperCase() }) )
  await rig( page, 'revise', { ...EXAMPLE, state: { ...EXAMPLE.state, notes, query: 'authored' } })
  const merged = await rig( page, 'state' )
  ok( 'an authored change to an untouched key applies', merged.notes[ 0 ].title === 'GROCERIES' )
  ok( 'a key the user changed keeps the live value', merged.query === TYPED )
  ok( 'iou of identical boxes is 1', iou( boxes.list, boxes.list ) === 1 )
  console.log( 'css ops:', JSON.stringify( cssOps( EXAMPLE.style, EXAMPLE.style + '\n.main h2 { color: red }\n.side { gap: 4px }\n@media (max-width: 600px) { .side { display: none } }' ) ) )
  await browser.close(); server.close(); process.exit( 0 )
}

await mkdir( OUT, { recursive: true })
const sketches = SKETCHES.filter( s => !ONLY.length || ONLY.includes( s.id ) )
const apps = [ ...new Set( sketches.map( s => s.app ) ) ]
const queue = [
  ...apps.flatMap( app => Array.from({ length: RUNS }, ( _, r ) => () => textOnly( app, r + 1 ) ) ),
  ...sketches.flatMap( s => Array.from({ length: RUNS }, ( _, r ) => () => job( s, r + 1 ) ) )
]
console.log(`Phase 0: ${MODEL}, ${sketches.length} sketches × ${RUNS} runs, ${JOBS} at a time`)
await Promise.all( Array.from({ length: JOBS }, async () => {
  while( queue.length ) await queue.shift()().catch( e => console.log(`✗ ${e.message}`) )
}) )
await browser.close()
server.close()
