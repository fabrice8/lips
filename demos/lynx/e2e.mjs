/**
 * RFC-006 L1–L3 exit checks, tier A: the demo built by Rspeedy, loaded by
 * Lynx for Web (`<lynx-view>`), driven in Chromium.
 *
 * Unlike the testing-environment spec, nothing here is emulated by us:
 * the bundle is the real build output, the threads are real (the
 * background runs in a worker), and events go through web-core's own
 * `__AddEventListener`. CSS is the browser's, so native style rules are
 * NOT proven at this tier (RFC-006 §6) — and neither is the native list's
 * virtualization: Lynx for Web builds every cell. What this tier has that
 * the headless engine lacks is real typing.
 *
 *   npm install && node e2e.mjs        (Playwright and Chromium must be available)
 */
import { execSync } from 'node:child_process'
import { createServer } from 'node:http'
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, extname, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const here = dirname( fileURLToPath( import.meta.url ) )
const require = createRequire( import.meta.url )

execSync( 'npx rspeedy build', { cwd: here, stdio: 'inherit' })

const dist = join( here, 'dist' )
const bundle = readdirSync( dist ).find( f => f.endsWith('.web.bundle') )
if( !bundle ) throw new Error(`no .web.bundle in ${dist}: ${readdirSync( dist )}`)

const client = join( here, 'node_modules/@lynx-js/web-core/dist/client_prod' )
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.wasm': 'application/wasm', '.bundle': 'application/octet-stream' }

const PAGE = `<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="/web-core/static/css/client.css">
<script type="module" src="/web-core/static/js/client.js"></script>
<lynx-view style="width: 400px; height: 600px; display: block" url="/${bundle}"></lynx-view>`

const server = createServer( ( req, res ) => {
  const url = decodeURIComponent( req.url.split('?')[ 0 ] )
  if( url === '/' ){
    res.writeHead( 200, { 'content-type': 'text/html' })
    return res.end( PAGE )
  }
  if( url === '/favicon.ico' ){
    res.writeHead( 204 )
    return res.end()
  }
  const file = url.startsWith('/web-core/') ? join( client, url.slice( 10 ) ) : join( dist, url )
  if( !existsSync( file ) || statSync( file ).isDirectory() ){
    res.writeHead( 404 )
    return res.end()
  }
  res.writeHead( 200, { 'content-type': TYPES[ extname( file ) ] || 'application/octet-stream' })
  res.end( readFileSync( file ) )
}).listen( 0 )

const { port } = server.address()
const { chromium } = require( process.env.PLAYWRIGHT || 'playwright' )
const browser = await chromium.launch( process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {} )
const page = await browser.newPage()

const errors = []
page.on( 'pageerror', e => errors.push( e.message ) )
page.on( 'console', m => m.type() === 'error' && errors.push( m.text() ) )

let failed = 0
const check = ( name, ok, detail = '' ) => {
  console.log( `${ok ? '✓' : '✗'} ${name}${ok ? '' : `  ${detail}`}` )
  ok || failed++
}

/** Text of the rendered lynx-view, through its shadow root */
const text = () => page.evaluate( () => document.querySelector('lynx-view')?.shadowRoot?.textContent?.replace( /\s+/g, ' ' ).trim() || '' )
const waitText = ( needle, timeout = 15000 ) =>
  page.waitForFunction( n => ( document.querySelector('lynx-view')?.shadowRoot?.textContent || '' ).includes( n ), needle, { timeout })
      .then( () => true, () => false )

try {
  await page.goto( `http://localhost:${port}/` )

  check( 'first render arrives from the background thread', await waitText('Count: 0'), await text() )
  check( 'keyed list renders in order', /one\s*two/.test( await text() ), await text() )

  const tap = async k => page.locator(`lynx-view [data-k="${k}"]`).first().click()

  await tap('inc')
  check( 'tap round-trips: main → background → main', await waitText('Count: 1'), await text() )
  await tap('inc')
  check( 'second tap', await waitText('Count: 2'), await text() )

  await tap('add')
  check( 'keyed insert', await waitText('row 3'), await text() )

  await tap('rev')
  await page.waitForTimeout( 300 )
  const order = await page.evaluate( () =>
    [ ...document.querySelector('lynx-view').shadowRoot.querySelectorAll('[data-id]') ].map( e => e.textContent.trim() ) )
  check( 'keyed reverse moves rows', JSON.stringify( order ) === JSON.stringify([ 'row 3', 'two', 'one' ]), JSON.stringify( order ) )

  // The Lips sheet (app.lips.css): scoped rules, and binds written as variables
  const style = k => page.evaluate( k => {
    const el = document.querySelector('lynx-view').shadowRoot.querySelector(`[data-k="${k}"]`)
    const cs = getComputedStyle( el )
    return { color: cs.color, background: cs.backgroundColor, width: cs.width, radius: cs.borderTopLeftRadius, size: cs.fontSize }
  }, k )

  const before = { count: await style('count'), inc: await style('inc'), swatch: await style('swatch') }
  check( 'scoped sheet applies (.title 20px, .btn background)',
    before.count.size === '20px' && before.inc.background === 'rgb(226, 232, 240)', JSON.stringify( before ) )
  check( 'variable binds apply (accent, radius 6px)',
    before.count.color === 'rgb(225, 29, 72)' && before.inc.radius === '6px', JSON.stringify( before ) )

  await tap('theme')
  await page.waitForTimeout( 300 )
  const after = { count: await style('count'), inc: await style('inc'), swatch: await style('swatch') }
  check( 'a state change rewrites the variables',
    after.count.color === 'rgb(37, 99, 235)' && after.inc.radius === '12px'
    && parseFloat( after.swatch.width ) > parseFloat( before.swatch.width ), JSON.stringify( after ) )

  // RFC-006 L3: the vocabulary pass, inputs, the scroll view, the list
  const inShadow = ( fn, arg ) => page.evaluate( ( [ fn, arg ] ) =>
    new Function( 'r', 'arg', `return (${fn})( r, arg )` )( document.querySelector('lynx-view').shadowRoot, arg ), [ fn.toString(), arg ] )

  check( 'bare text in a button renders: wrapped in a text element at compile time',
    await inShadow( r => r.querySelector('[data-k="fill"] > x-text')?.textContent === 'fill' ) )

  await page.locator('lynx-view [data-k="field"] input').click()
  await page.keyboard.type('abc')
  check( 'typing reaches the background as e.target.value', await waitText('Typed: abc'), await text() )

  await tap('fill')
  const filled = await page.waitForFunction( () =>
    document.querySelector('lynx-view').shadowRoot.querySelector('[data-k="field"]').shadowRoot.querySelector('input').value === 'hello',
    null, { timeout: 5000 }).catch( () => false )
  check( 'a value change goes in through setValue', !!filled )

  await inShadow( r => { r.querySelector('[data-k="scroller"]').scrollTop = 120 } )
  check( 'a bare scroll-y scrolls, and scroll events reach the background', await waitText('Top: 120'), await text() )

  const cells = () => inShadow( r => [ ...r.querySelectorAll('[data-cell]') ].map( c => c.textContent ) )
  const all = await cells()
  check( 'the list holds its cells, in order', all.length === 40 && all[ 0 ] === 'item 1', JSON.stringify( all.slice( 0, 3 ) ) )
  await tap('shuffle')
  await page.waitForTimeout( 300 )
  const shuffled = await cells()
  check( 'a reordered list reorders its cells', shuffled[ 0 ] === 'item 40' && shuffled[ 39 ] === 'item 1', JSON.stringify( shuffled.slice( 0, 3 ) ) )

  await page.screenshot({ path: join( here, 'dist/e2e.png' ) })
  check( 'no page errors', !errors.length, errors.join(' | ') )
}
finally {
  await browser.close()
  server.close()
}

console.log( failed ? `\n${failed} check(s) failed` : '\nall checks passed' )
process.exit( failed ? 1 : 0 )
