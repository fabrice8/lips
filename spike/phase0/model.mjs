/**
 * One model call through the Claude Code CLI, headless: no tools, no
 * settings, no MCP, no session kept, from an empty directory so no
 * project CLAUDE.md is read. Our system prompt replaces the default one.
 */

import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, existsSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'

export const MODEL = process.env.PHASE0_MODEL || 'claude-sonnet-5-5'

/** CLAUDE_BIN, else `claude` on PATH, else the newest one the desktop app bundles */
function findClaude(){
  if( process.env.CLAUDE_BIN ) return process.env.CLAUDE_BIN
  try { return execFileSync( 'which', [ 'claude' ], { encoding: 'utf8' } ).trim() } catch {}
  const root = join( homedir(), 'Library/Application Support/Claude/claude-code' )
  const byVersion = ( a, b ) => a.localeCompare( b, undefined, { numeric: true })
  for( const v of existsSync( root ) ? readdirSync( root ).sort( byVersion ).reverse() : [] )
    for( const h of readdirSync( join( root, v ) ) ){
      const bin = join( root, v, h, 'claude.app/Contents/MacOS/claude' )
      if( existsSync( bin ) ) return bin
    }
  throw new Error('no claude CLI: set CLAUDE_BIN')
}

const BIN = findClaude()
const CWD = mkdtempSync( join( tmpdir(), 'phase0-' ) )

function call( system, prompt ){
  return new Promise( ( resolve, reject ) => {
    const p = spawn( BIN, [
      '-p', '--model', MODEL, '--system-prompt', system,
      '--tools', '', '--setting-sources', '', '--strict-mcp-config',
      '--no-session-persistence', '--output-format', 'json'
    ], { cwd: CWD, stdio: [ 'pipe', 'pipe', 'pipe' ], timeout: 10 * 60e3 })
    let out = '', err = ''
    p.stdout.on( 'data', d => out += d )
    p.stderr.on( 'data', d => err += d )
    p.on( 'close', () => {
      try {
        const r = JSON.parse( out )
        r.is_error ? reject( new Error( r.result ) ) : resolve( r )
      }
      catch { reject( new Error( `claude: ${err || out}`.slice( 0, 500 ) ) ) }
    })
    p.stdin.end( prompt )
  })
}

/** The reply's ```json block, parsed, plus what the call cost */
export async function ask( system, prompt, tries = 3 ){
  for( let i = 1; ; i++ ){
    try {
      const r = await call( system, prompt )
      const m = r.result.match( /```json\s*([\s\S]*?)```/ ) || [ , r.result ]
      return { json: JSON.parse( m[ 1 ] ), usage: { ms: r.duration_ms, usd: r.total_cost_usd, in: r.usage?.input_tokens, out: r.usage?.output_tokens } }
    }
    catch( e ){
      // A bad reply is retried as is; an auth or quota failure stops the run
      if( i >= tries || /authenticat|login|rate|limit|quota/i.test( e.message ) ) throw e
    }
  }
}
