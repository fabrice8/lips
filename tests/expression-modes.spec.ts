/**
 * The two execution modes are one language. `'interpreted'` exists so a
 * template runs under a CSP without `unsafe-eval`; it must mean what
 * `'compiled'` means, and both what JS means: a `?.` ends the whole chain,
 * and a `.` on nothing throws. Each case is run three ways, and all three
 * must agree, value for value and throw for throw.
 */
import { describe, it, expect } from 'vitest'
import { compileExpression, interpretExpression, parseExpression } from '../src/ir/expression'

const env = () => ({
  state: {
    u: null as any,
    user: { name: 'Ada', tags: [ 'a', 'b' ], greet( this: any, x: string ){ return `${x} ${this.name}` } },
    list: [ 1, 2, 3 ],
    n: 2,
    fn: undefined as any
  }
})

type Outcome = { value?: unknown, threw?: string }

const run = ( f: () => unknown ): Outcome => {
  try { return { value: f() } }
  catch( e: any ){ return { threw: e?.constructor?.name } }
}
const native = ( src: string ) => run( () => new Function( 'state', `return (${src})` )( env().state ) )
const compiled = ( src: string ) => run( () => compileExpression( src ).run( env() ) )
const interpreted = ( src: string ) => run( () => interpretExpression( parseExpression( src ).ast, env() ) )

const CASES = [
  // optional chains end as a whole
  'state.u?.name',
  'state.u?.profile.name',
  'state.u?.profile.name.first',
  'state.u?.f()',
  'state.u?.f().x',
  'state.u?.[ "k" ].x',
  'state.fn?.()',
  'state.fn?.().x',
  'state.user?.name',
  'state.user?.tags.length',
  // a plain `.` on nothing throws
  'state.u.name',
  'state.missing.x',
  'state.u?.a + state.u.b',
  'state.fn()',
  'state.user.nope()',
  // calls keep `this`, through chains too
  'state.user.greet( "Hi" )',
  'state.user?.greet( "Hi" )',
  'state.user.tags.map( t => t.toUpperCase() ).join( "-" )',
  'state.list.filter( x => x > 1 ).length',
  // grouping still groups
  '( state.n + 1 ) * 2',
  '( state.u ?? state.user ).name',
  '( 1 ).toFixed( 1 )',
  '[ 1, 2 ].concat( [ 3 ] ).length',
  '( x => x * 2 )( state.n )',
  '!state.u?.name',
  'state.u?.name ?? "none"'
]

describe('expression modes agree with each other and with JS', () => {
  for( const src of CASES )
    it( src, () => {
      const js = native( src )
      expect( compiled( src ), 'compiled' ).toEqual( js )
      expect( interpreted( src ), 'interpreted' ).toEqual( js )
    })
})
