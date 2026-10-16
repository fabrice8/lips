/**
 * A/B benchmark: two or more builds of the IR engine, the same keyed-list
 * ops, interleaved in one headless Chromium page.
 *
 *   node bench/ab.mjs [--rows 10000] [--iters 25] [--json] <build> <build>...
 *
 * A build is a path to a `lips.min.js` (or a directory holding one), or a
 * git ref, which is built in a temporary worktree and cached by commit.
 * `label=` names a build: `node bench/ab.mjs master dist/lips.min.js`, or
 * `base=master new=dist`. The first build is the baseline; every other
 * column also shows its ratio to it.
 *
 * Why this and not `index.html`: the page is cross-origin isolated (COOP and
 * COEP), so `performance.now()` resolves to ~5 µs rather than 100 µs; GC
 * runs before every op (`--expose-gc`), so one build's garbage is not billed
 * to the next; and the builds take turns in a rotating order, so drift
 * (thermal, JIT, background load) spreads evenly over all of them.
 *
 * Needs Playwright and a Chromium: set PLAYWRIGHT to the package path and
 * CHROMIUM to the browser executable if they are not resolvable from here.
 */
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync, statSync, readFileSync, mkdirSync, copyFileSync, rmSync, symlinkSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const repo = resolve( dirname( fileURLToPath( import.meta.url ) ), '..' )
const require = createRequire( import.meta.url )

const opts = { rows: 1000, iters: 25, json: false }
const specs = []
const argv = process.argv.slice( 2 )
for( let i = 0; i < argv.length; i++ ){
  const a = argv[ i ]
  if( a === '--json' ) opts.json = true
  else if( a === '--rows' || a === '--iters' ) opts[ a.slice( 2 ) ] = +argv[ ++i ]
  else specs.push( a )
}
if( specs.length < 2 ){
  console.error('usage: node bench/ab.mjs [--rows N] [--iters N] [--json] <build> <build>...')
  process.exit( 1 )
}

const git = ( ...args ) => execFileSync( 'git', args, { cwd: repo, encoding: 'utf8' }).trim()

/** A git ref → its `lips.min.js`, built once per commit */
function buildRef( ref ){
  const sha = git( 'rev-parse', '--verify', `${ref}^{commit}` )
  const cache = join( tmpdir(), 'lips-ab' )
  const out = join( cache, `${sha}.min.js` )
  if( existsSync( out ) ) return out

  const tree = join( cache, `tree-${sha}` )
  mkdirSync( cache, { recursive: true })
  rmSync( tree, { recursive: true, force: true })
  git( 'worktree', 'add', '--detach', tree, sha )
  try {
    symlinkSync( join( repo, 'node_modules' ), join( tree, 'node_modules' ) )
    console.error(`building ${ref} (${sha.slice( 0, 7 )})…`)
    execFileSync( 'bun', [ 'run', 'build' ], { cwd: tree, stdio: 'ignore' })
    copyFileSync( join( tree, 'dist/lips.min.js' ), out )
  }
  finally { git( 'worktree', 'remove', '--force', tree ) }
  return out
}

const builds = specs.map( spec => {
  const eq = spec.indexOf('=')
  const label = eq > 0 ? spec.slice( 0, eq ) : spec
  const target = eq > 0 ? spec.slice( eq + 1 ) : spec
  const path = existsSync( target )
    ? statSync( target ).isDirectory() ? join( target, 'lips.min.js' ) : target
    : buildRef( target )
  return { label, path: resolve( path ) }
})

const TEMPLATE = `<div><for [row] in=state.rows by="id"><div class="{ state.selected === row.id ? 'row danger' : 'row' }"><span class="c1">{row.id}</span><a class="c2" on-click( select, row.id )>{row.label}</a></div></for></div>`

const PAGE = `<!doctype html><meta charset="utf-8"><body><div id="root"></div>
<script type="module">
${builds.map( ( _, i ) => `import * as E${i} from '/build/${i}.js'` ).join('\n')}
const engines = [ ${builds.map( ( _, i ) => `E${i}` ).join(', ')} ]
const N = ${opts.rows}
const TEMPLATE = ${JSON.stringify( TEMPLATE )}
let nid = 1
const data = n => Array.from({ length: n }, () => ({ id: nid++, label: 'row ' + nid }))
const root = document.querySelector('#root')

const ops = L => {
  const { ir } = L.compileTemplate( TEMPLATE )
  let inst
  return {
    create(){
      inst = L.renderIR( ir, { state: { rows: data( N ), selected: null }, handlers: { select( id ){ this.state.selected = id } } })
      inst.mount( root )
    },
    replace(){ inst.state.rows = data( N ) },
    update(){ inst.state.rows = inst.state.rows.map( ( r, i ) => i % 10 ? r : { ...r, label: r.label + ' !' } ) },
    select(){ inst.state.selected = inst.state.rows[ N >> 1 ].id },
    swap(){ const r = [ ...inst.state.rows ]; [ r[ 1 ], r[ N - 2 ] ] = [ r[ N - 2 ], r[ 1 ] ]; inst.state.rows = r },
    remove(){ inst.state.rows = inst.state.rows.filter( ( _, k ) => k !== ( N >> 1 ) ) },
    append(){ inst.state.rows = [ ...inst.state.rows, ...data( N ) ] },
    clear(){ inst.dispose(); root.textContent = '' }
  }
}
const runners = engines.map( ops )
const OPS = Object.keys( runners[ 0 ] )
const tick = () => new Promise( r => setTimeout( r, 0 ) )

window.run = async iters => {
  const times = runners.map( () => Object.fromEntries( OPS.map( op => [ op, [] ] ) ) )
  for( let it = 0; it < iters; it++ )
    for( let k = 0; k < runners.length; k++ ){
      // Rotate who goes first, so drift lands on every build alike
      const b = ( k + it ) % runners.length
      for( const op of OPS ){
        await tick(); window.gc?.()
        const t0 = performance.now()
        runners[ b ][ op ]()
        times[ b ][ op ].push( performance.now() - t0 )
      }
    }
  return { isolated: crossOriginIsolated, ops: OPS, times }
}
</script>`

const server = createServer( ( req, res ) => {
  const url = req.url.split('?')[ 0 ]
  const m = url.match( /^\/build\/(\d+)\.js$/ )
  const body = url === '/' ? PAGE : m && builds[ +m[ 1 ] ] ? readFileSync( builds[ +m[ 1 ] ].path ) : null
  if( body === null ){ res.writeHead( 404 ); return res.end() }
  res.writeHead( 200, {
    'content-type': url === '/' ? 'text/html' : 'text/javascript',
    // Cross-origin isolation: fine-grained timers
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-embedder-policy': 'require-corp'
  })
  res.end( body )
}).listen( 0 )
await new Promise( r => server.once( 'listening', r ) )

const { chromium } = require( process.env.PLAYWRIGHT || 'playwright' )
const browser = await chromium.launch({
  ...( process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {} ),
  args: [ '--js-flags=--expose-gc' ]
})
let result
try {
  const page = await browser.newPage()
  const errors = []
  page.on( 'pageerror', e => errors.push( e.message ) )
  await page.goto(`http://localhost:${server.address().port}/`)
  await page.waitForFunction( () => typeof window.run === 'function', null, { timeout: 30000 })
    .catch( () => { throw new Error(`the bench page did not start: ${errors.join('; ') || 'no error reported'}`) })
  result = await page.evaluate( n => window.run( n ), opts.iters )
  if( errors.length ) throw new Error(`page errors: ${errors.join('; ')}`)
}
finally {
  await browser.close()
  server.close()
}

const median = a => { const s = [ ...a ].sort( ( x, y ) => x - y ); return s[ s.length >> 1 ] }
const table = result.ops.map( op => {
  const meds = result.times.map( t => median( t[ op ] ) )
  return { op, ms: meds, ratio: meds.map( m => m / meds[ 0 ] ) }
})

if( opts.json ){
  console.log( JSON.stringify({ rows: opts.rows, iters: opts.iters, isolated: result.isolated, builds: builds.map( b => b.label ), table }) )
}
else {
  if( !result.isolated ) console.error('warning: the page is not cross-origin isolated; timers are coarse')
  const head = [ 'op', ...builds.map( ( b, i ) => i ? `${b.label} (×)` : b.label ) ]
  const lines = table.map( ({ op, ms, ratio }) => [
    op,
    ...ms.map( ( m, i ) => i ? `${m.toFixed( 3 )} (${ratio[ i ].toFixed( 3 )})` : m.toFixed( 3 ) )
  ])
  const width = head.map( ( h, c ) => Math.max( h.length, ...lines.map( l => l[ c ].length ) ) )
  const fmt = cells => cells.map( ( s, c ) => c ? s.padStart( width[ c ] ) : s.padEnd( width[ c ] ) ).join('  ')
  console.log(`median ms per op, ${opts.rows} rows, ${opts.iters} iterations\n`)
  console.log( fmt( head ) )
  for( const l of lines ) console.log( fmt( l ) )
}
