/**
 * RFC-006 L1 exit check, tier A: the demo built by Rspeedy, loaded by Lynx
 * for Web (`<lynx-view>`), driven in Chromium.
 *
 * Unlike the testing-environment spec, nothing here is emulated by us:
 * the bundle is the real build output, the threads are real (the
 * background runs in a worker), and events go through web-core's own
 * `__AddEventListener`. CSS is the browser's, so native style rules are
 * NOT proven at this tier (RFC-006 §6).
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

  await page.screenshot({ path: join( here, 'dist/e2e.png' ) })
  check( 'no page errors', !errors.length, errors.join(' | ') )
}
finally {
  await browser.close()
  server.close()
}

console.log( failed ? `\n${failed} check(s) failed` : '\nall checks passed' )
process.exit( failed ? 1 : 0 )
