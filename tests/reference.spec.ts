/**
 * docs/reference.md, run: every fenced example in it is checked as the
 * comment above it says, so the reference cannot describe a Lips that is
 * not the one shipped. An example with no such comment fails the suite.
 *
 *   <!-- renders "text" [after clicking "selector"] -->   a component
 *   <!-- register "name" -->                               a component the next ones use
 *   <!-- compiles -->                                      a template, no error
 *   <!-- reports LIPS-X000 -->                             a template, that diagnostic
 *   <!-- runs -->                                          code, against the section's `lips`
 *   <!-- from path -->                                     text copied from a file a demo runs
 *
 * One `lips` per `##` section, so a `runs` block can set up (a dictionary,
 * a context key) what the section's next example renders.
 */
import { describe, it, expect, vi } from 'vitest'
import Lips, { compileTemplate, signal, effect, untrack, reactive, batch } from '../src/lips'
import { precompile } from '../src/precompile'
import { untrusted, untrustedPolicy } from '../src/untrusted'

const DOC = Object.values( import.meta.glob( '../docs/reference.md', { query: '?raw', import: 'default', eager: true }) )[ 0 ] as string
const FILES = import.meta.glob( '../demos/**/*.ts', { query: '?raw', import: 'default', eager: true })

type Example = { section: string, marker: string, code: string, line: number }

const examples: Example[] = []
const unmarked: number[] = []
{
  let section = '', marker = '', fence: { lang: string, start: number, body: string[] } | null = null
  DOC.split('\n').forEach( ( text, i ) => {
    if( fence ){
      if( text.startsWith('```') ){
        fence.lang !== '' && ( marker ? examples.push({ section, marker, code: fence.body.join('\n'), line: fence.start }) : unmarked.push( fence.start ) )
        fence = null, marker = ''
      }
      else fence.body.push( text )
      return
    }
    const m = /^<!-- (.+) -->$/.exec( text.trim() )
    if( m ) return void ( marker = m[ 1 ] )
    if( text.startsWith('```') ) return void ( fence = { lang: text.slice( 3 ).trim(), start: i + 1, body: [] } )
    if( text.startsWith('## ') ) section = text.slice( 3 )
    text.trim() && ( marker = '' )
  })
}

const squash = ( s: string ) => s.replace( /\s+/g, ' ' ).trim()
const objectOf = ( code: string ) => new Function( `return (${code})` )()
const scope = { Lips, compileTemplate, precompile, untrusted, untrustedPolicy, signal, effect, untrack, reactive, batch, document }

describe('docs/reference.md: every example runs as it says', () => {
  it('has examples, and every one says how it is checked', () => {
    expect( examples.length ).toBeGreaterThan( 30 )
    expect( unmarked.map( l => `line ${l}` ) ).toEqual( [] )
  })

  const bySection = new Map<string, Example[]>()
  examples.forEach( e => bySection.set( e.section, [ ...( bySection.get( e.section ) || [] ), e ]) )

  for( const [ section, list ] of bySection )
    it( section, async () => {
      const lips: any = new Lips({ lang: 'en-US' })
      const errors: unknown[] = []
      const log = vi.spyOn( console, 'error' ).mockImplementation( ( ...a ) => { errors.push( a ) })

      try {
        for( const ex of list ){
          const where = `${ex.marker} (line ${ex.line})`
          document.body.innerHTML = '<div id="app"></div>'
          let m: RegExpExecArray | null

          if( ( m = /^renders "([^"]*)"(?: after clicking "([^"]*)")?$/.exec( ex.marker ) ) ){
            const c = lips.render( `ref-${ex.line}`, objectOf( ex.code ) ).appendTo('#app')
            await new Promise( r => setTimeout( r, 0 ) )
            if( m[ 2 ] ){
              ;( document.querySelector( m[ 2 ] ) as any ).click()
              await new Promise( r => setTimeout( r, 0 ) )
            }
            expect( squash( document.querySelector('#app')!.textContent || '' ), where ).toContain( m[ 1 ] )
            c.destroy()
          }
          else if( ( m = /^register "([^"]*)"$/.exec( ex.marker ) ) ) lips.register( m[ 1 ], objectOf( ex.code ) )
          else if( ex.marker === 'compiles' )
            expect( compileTemplate( ex.code ).diagnostics.filter( d => d.severity === 'error' ), where ).toEqual( [] )
          else if( ( m = /^reports (LIPS-\w+)$/.exec( ex.marker ) ) )
            expect( compileTemplate( ex.code ).diagnostics.map( d => d.code ), where ).toContain( m[ 1 ] )
          else if( ex.marker === 'runs' ){
            const body = ex.code.split('\n').filter( l => !/^\s*import /.test( l ) ).join('\n')
            // A block of its own, so an example may declare its own `lips`
            new Function( 'lips', ...Object.keys( scope ), `{\n${body}\n}` )( lips, ...Object.values( scope ) )
            await new Promise( r => setTimeout( r, 0 ) )
          }
          else if( ( m = /^from (.+)$/.exec( ex.marker ) ) ){
            const file = FILES[ `../${m[ 1 ]}` ]
            expect( file, `${where}: no such file` ).toBeTypeOf('string')
            expect( squash( file as string ), where ).toContain( squash( ex.code ) )
          }
          else throw new Error(`${where}: unknown marker`)
        }
        expect( errors, 'logged an error' ).toEqual( [] )
      }
      finally { log.mockRestore() }
    })
})
