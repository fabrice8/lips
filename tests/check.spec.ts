// @vitest-environment node
/**
 * `lips-check`: templates type-checked against their components. One run
 * over `tests/check/`, a project of its own; each refusal is found by the
 * text it is written beside, and held to its place, code and message.
 * `clean.ts` writes every construct correctly and draws nothing.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { checkTemplates, formatDiagnostic, shadowTemplate } from '../src/check'
import type { CheckDiagnostic } from '../src/check'

const fixtures = import.meta.glob( './check/*', { query: '?raw', import: 'default', eager: true })
let found: CheckDiagnostic[] = []

beforeAll( () => {
  // Paths from the repository's root, where the suite runs
  found = checkTemplates({ project: 'tests/check/tsconfig.json', lips: './src/types' })
}, 60_000 )

/** Line and column of `mark` in a fixture: the `n`th match, at `pick` within it */
const where = ( file: string, mark: string, pick = 0, n = 0 ) => {
  const text = fixtures[ './check/' + file ]
  let at = -1
  for( let i = 0; i <= n; i++ ) at = text.indexOf( mark, at + 1 )
  if( at < 0 ) throw new Error(`no "${ mark }" in ${ file }`)
  const before = text.slice( 0, at + pick ).split('\n')
  return { line: before.length, col: before[ before.length - 1 ].length + 1 }
}

const of = ( file: string ) => found.filter( d => d.file.endsWith( '/' + file ) )

/** The one diagnostic at `mark` (`pick` characters in) */
const at = ( file: string, mark: string, pick = 0, n = 0 ) => {
  const { line, col } = where( file, mark, pick, n )
  const here = of( file ).filter( d => d.loc.line === line && d.loc.col === col )
  expect( here, `${ file }:${ line }:${ col } (${ mark })\n` + of( file ).map( d => formatDiagnostic( d ) ).join('\n') ).toHaveLength( 1 )
  return here[ 0 ]
}

describe('lips-check: what it finds nothing in', () => {
  it('every construct, written as its component types it', () => {
    expect( of('clean.ts').map( d => formatDiagnostic( d ) ) ).toEqual([])
  })
})

describe('lips-check: an expression that does not type-check (LIPS-T001)', () => {
  const t001 = ( mark: string, pick: number, hint: string, message: RegExp | string, n = 0 ) => {
    const d = at( 'refusals.ts', mark, pick, n )
    expect([ d.code, d.severity, d.hint ]).toEqual([ 'LIPS-T001', 'error', hint ])
    expect( d.message ).toMatch( message )
  }

  it('a field the state does not have', () => t001( '{state.cuont}', 7, 'TS2551', /'cuont' does not exist.*Did you mean 'count'/ ) )
  it('a root that is not in scope', () => t001( '{stat.count}', 1, 'TS2552', /Cannot find name 'stat'/ ) )
  it('a field a <for> item does not have', () => t001( '{item.labl}', 6, 'TS2551', /'labl' does not exist on type 'Item'/ ) )
  it('a <for> binding more than the runtime gives', () => t001( 'extra] in=', 0, 'TS2493', /no element at index '2'/ ) )
  it('a <let> read as what it is not', () => t001( '{twice.length}', 7, 'TS2339', /'length' does not exist on type 'number'/ ) )
  it('a <let> written', () => t001( 'twice = 1', 0, 'TS2588', /Cannot assign to 'twice' because it is a constant/ ) )
  it('an optional input read as if it were there', () => t001( '{input.size.toFixed()}', 1, 'TS18048', /'input.size' is possibly 'undefined'/ ) )
  it('a handler called with what it does not take', () => t001( "'one')>arg", 0, 'TS2345', /'string' is not assignable to type 'number'/ ) )
  it('a <case> that can never match', () => t001( 'is="c"', 0, 'TS2345', /'"c"' is not assignable/ ) )
  it('a field the awaited value does not have', () => t001( '{u.nmae}', 3, 'TS2339', /'nmae' does not exist/ ) )
  it('`static` read for a field it does not have, named as written', () => t001( '{static.limt}', 8, 'TS2551', /'limt' does not exist on type '\{ limit: number; \}'/ ) )
  it('in a macro body, located in the macros', () => t001( '{item.lable}', 6, 'TS2551', /'lable' does not exist on type 'Item'/ ) )
  it('in a component written in a register() call', () => t001( '{state.opne}', 7, 'TS2339', /'opne' does not exist/ ) )
})

describe('lips-check: a handler the component does not have (LIPS-T002)', () => {
  it('in a component whose handlers are inferred, said plainly', () => {
    const d = at( 'refusals.ts', 'stpe, 1' )
    expect([ d.code, d.message ]).toEqual([ 'LIPS-T002', "The component has no handler named 'stpe'" ])
  })

  it('in a module whose handlers are typed by hand, where every name reads as any', () => {
    const d = at( 'module.ts', 'rest)' )
    expect([ d.code, d.message ]).toEqual([ 'LIPS-T002', "The component has no handler named 'rest'" ])
  })
})

describe('lips-check: a module component, its handler typed by hand', () => {
  it("holds an event's arguments to the handler's own parameters", () => {
    const d = at( 'module.ts', "'two'" )
    expect([ d.code, d.hint ]).toEqual([ 'LIPS-T001', 'TS2345' ])
    expect( d.message ).toMatch( /'string' is not assignable to type 'number'/ )
  })

  it('reads the input it declares', () => {
    expect( at( 'module.ts', '{input.stpe}', 7 ).message ).toMatch( /'stpe' does not exist on type 'Input'/ )
  })

  it('finds nothing else', () => expect( of('module.ts') ).toHaveLength( 3 ) )
})

describe('lips-check: a .lips file', () => {
  it('its template, against the script beside it', () => {
    expect( at( 'card.lips', 'true)' ).message ).toMatch( /'boolean' is not assignable to type 'number'/ )
    expect( at( 'card.lips', '{state.likez}', 7 ).message ).toMatch( /'likez' does not exist on type 'State'/ )
  })

  it('and its script, which nothing else type-checks', () => {
    const d = at( 'card.lips', 'unused' )
    expect([ d.code, d.message ]).toEqual([ 'TS2322', "Type 'string' is not assignable to type 'number'." ])
  })

  it('finds nothing else', () => expect( of('card.lips') ).toHaveLength( 3 ) )
})

describe('lips-check: what it cannot check, and says so (LIPS-T003)', () => {
  it('a template built with ${…}', () => {
    const d = at( 'refusals.ts', '`<p>${ page }' )
    expect([ d.code, d.severity, d.message ]).toEqual([ 'LIPS-T003', 'warning', 'This template is not type-checked: its template is built with ${…}' ])
  })

  it('a handler not written in place', () => {
    const d = at( 'refusals.ts', '`<p>{state.a}</p>` })\n', 0, 0 )
    expect([ d.code, d.message ]).toEqual([ 'LIPS-T003', 'This template is not type-checked: its handler is not written in place' ])
  })
})

describe('lips-check: a template that does not compile', () => {
  it("reports the compiler's own error", () => {
    expect( at( 'refusals.ts', '{ state.count + }', 14 ).code ).toBe('LIPS-E012')
  })

  it('and nothing in refusals.ts it did not mean to', () => expect( of('refusals.ts') ).toHaveLength( 17 ) )
})

describe('shadowTemplate', () => {
  it('copies each expression verbatim, `static` renamed to a name of its length', () => {
    const { body, spans } = shadowTemplate('<p>{static.max + state.n}</p>')
    const span = spans.find( s => s.exact )!
    expect( body.slice( span.at, span.at + span.length ) ).toBe('$tatic.max + state.n')
    expect([ span.from, span.size ]).toEqual([ 4, 20 ])
  })

  it('declares a <let> before what reads it, wherever each is written', () => {
    const { body } = shadowTemplate('<p>{b}</p><let b={ a + 1 }/><let a={ 1 }/>')
    expect( body.indexOf('const a') ).toBeLessThan( body.indexOf('const b') )
    expect( body.indexOf('const b') ).toBeLessThan( body.indexOf('( b )') )
  })

  it('reads a handler where the component keeps its own', () => {
    expect( shadowTemplate( '<b on-click(go, 1)/>', '', { ref: 'handler', names: [ 'go' ] }).body ).toContain('__lips_on( handler.go, ( 1 ) )')
    expect( shadowTemplate('<b on-click(go, 1)/>').body ).toContain('__lips_on( this.go, ( 1 ) )')
  })
})
