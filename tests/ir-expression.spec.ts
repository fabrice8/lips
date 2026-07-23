import { describe, it, expect } from 'vitest'
import {
  parseExpression,
  extractDeps,
  compileExpression,
  interpretExpression,
  type ExprEnv
} from '../src/ir/expression'

const makeEnv = (): ExprEnv => ({
  state: {
    count: 3,
    on: true,
    user: { name: 'Ada' },
    items: [ { label: 'a' }, { label: 'b' } ]
  },
  input: { max: 10, on: true },
  context: { theme: 'dark' },
  static: { factor: 2 },
  self: { double: ( n: number ) => n * 2 },
  scope: { i: 1, item: { label: 'x' } }
})

/** Evaluate through BOTH executors and assert they agree */
function both( src: string, env: ExprEnv = makeEnv(), scopeNames = Object.keys( env.scope || {} ) ){
  const { ast, diagnostics } = parseExpression( src )
  expect( diagnostics, `diagnostics for ${src}` ).toEqual( [] )

  const compiled = compileExpression( src, scopeNames ).run( env )
  const interpreted = interpretExpression( ast, env )

  expect( interpreted, `parity for ${src}` ).toEqual( compiled )
  return compiled
}

describe('parseExpression diagnostics', () => {
  it('parses valid expressions without diagnostics', () => {
    for( const src of [
      `state.count + 1`,
      `input.on ? 'yes' : 'no'`,
      `items[0].label`,
      `( a, b ) => a + b`,
      `{ a: 1, ...state.user }`
    ])
      expect( parseExpression( src ).diagnostics ).toEqual( [] )
  })

  it('reports unterminated strings', () => {
    const { diagnostics } = parseExpression(`'oops`)
    expect( diagnostics[0].code ).toBe('LIPS-E001')
    expect( diagnostics[0].loc.offset ).toBe( 0 )
  })

  it('reports trailing tokens with position', () => {
    const { diagnostics } = parseExpression(`1 2`)
    expect( diagnostics[0].code ).toBe('LIPS-E003')
    expect( diagnostics[0].loc.offset ).toBe( 2 )
  })

  it('reports invalid assignment targets', () => {
    expect( parseExpression(`5 = 2`).diagnostics.some( d => d.code === 'LIPS-E006' ) ).toBe( true )
  })

  it('reports dangling member access', () => {
    expect( parseExpression(`state.`).diagnostics.some( d => d.code === 'LIPS-E008' ) ).toBe( true )
  })

  it('never throws — error ASTs interpret to undefined', () => {
    const { ast } = parseExpression(`state.count ===`)
    expect( () => interpretExpression( ast, makeEnv() ) ).not.toThrow()
  })
})

describe('extractDeps', () => {
  const deps = ( src: string, scopeNames: string[] = [] ) =>
    extractDeps( parseExpression( src ).ast, scopeNames ).sort()

  it('collects metavar member paths', () => {
    expect( deps(`state.count + input.max`) ).toEqual([ 'input.max', 'state.count' ])
    expect( deps(`state.user.name`) ).toEqual([ 'state.user.name' ])
  })

  it('stops at computed boundaries and records index deps', () => {
    expect( deps(`state.items[i].label`, [ 'i' ]) ).toEqual([ 'i', 'state.items' ])
  })

  it('records bare scope variables', () => {
    expect( deps(`item.label + i`, [ 'item', 'i' ]) ).toEqual([ 'i', 'item' ])
  })

  it('arrow params shadow outer names', () => {
    expect( deps(`( item ) => item.x + state.y`, [ 'item' ]) ).toEqual([ 'state.y' ])
  })

  it('tracks self method paths', () => {
    expect( deps(`self.double( state.count )`) ).toEqual([ 'self.double', 'state.count' ])
  })

  it('ignores whitelisted globals', () => {
    expect( deps(`Math.max( 1, 2 )`) ).toEqual( [] )
  })

  it('deduplicates', () => {
    expect( deps(`state.count + state.count`) ).toEqual([ 'state.count' ])
  })
})

describe('compiled ⇔ interpreted parity', () => {
  it('literals, arithmetic, precedence', () => {
    expect( both(`1 + 2 * 3`) ).toBe( 7 )
    expect( both(`( 1 + 2 ) * 3`) ).toBe( 9 )
    expect( both(`10 % 3`) ).toBe( 1 )
    expect( both(`'a' + 'b'`) ).toBe('ab')
    expect( both(`"a\\nb"`) ).toBe('a\nb')
    expect( both(`1e3`) ).toBe( 1000 )
  })

  it('metavar access', () => {
    expect( both(`state.count`) ).toBe( 3 )
    expect( both(`state.user.name`) ).toBe('Ada')
    expect( both(`input.max - state.count`) ).toBe( 7 )
    expect( both(`context.theme`) ).toBe('dark')
    expect( both(`static.factor * state.count`) ).toBe( 6 )
  })

  it('scope variables and computed members', () => {
    expect( both(`item.label`) ).toBe('x')
    expect( both(`state.items[i].label`) ).toBe('b')
    expect( both(`state.items[0].label`) ).toBe('a')
    expect( both(`item.label + i`) ).toBe('x1')
  })

  it('logic, equality, ternary', () => {
    expect( both(`input.on && state.count`) ).toBe( 3 )
    expect( both(`false || state.count`) ).toBe( 3 )
    expect( both(`state.missing ?? 'fallback'`) ).toBe('fallback')
    expect( both(`state.count === 3 ? 'big' : 'small'`) ).toBe('big')
    expect( both(`state.count != '3'`) ).toBe( false ) // loose equality preserved
    expect( both(`!input.on`) ).toBe( false )
    expect( both(`-state.count`) ).toBe( -3 )
  })

  it('ternary before a decimal is not optional chaining', () => {
    expect( both(`input.on ? .5 : 1`) ).toBe( 0.5 )
  })

  it('optional chaining', () => {
    expect( both(`state.user?.name`) ).toBe('Ada')
    expect( both(`state.nope?.name`) ).toBe( undefined )
    expect( both(`state.nope?.deep?.er`) ).toBe( undefined )
  })

  it('calls with this-binding and globals', () => {
    expect( both(`self.double( state.count )`) ).toBe( 6 )
    expect( both(`state.items.length`) ).toBe( 2 )
    expect( both(`state.user.name.toUpperCase()`) ).toBe('ADA')
    expect( both(`Math.max( state.count, input.max )`) ).toBe( 10 )
    expect( both(`JSON.stringify( { n: state.count } )`) ).toBe('{"n":3}')
  })

  it('array and object literals with spread', () => {
    expect( both(`[ 1, state.count ]`) ).toEqual([ 1, 3 ])
    expect( both(`[ 0, ...state.items ]`) ).toEqual([ 0, { label: 'a' }, { label: 'b' } ])
    expect( both(`{ a: state.count, b: item.label }`) ).toEqual({ a: 3, b: 'x' })
    expect( both(`{ ...state.user, extra: true }`) ).toEqual({ name: 'Ada', extra: true })
    expect( both(`{ i }`) ).toEqual({ i: 1 }) // shorthand
  })

  it('arrow functions close over env identically', () => {
    const c = compileExpression(`( n ) => n + state.count`, []).run( makeEnv() )
    const i = interpretExpression( parseExpression(`( n ) => n + state.count`).ast, makeEnv() )

    expect( c( 2 ) ).toBe( 5 )
    expect( i( 2 ) ).toBe( 5 )
  })

  it('strings containing reserved words survive codegen', () => {
    expect( both(`'my arguments are static'`) ).toBe('my arguments are static')
  })
})

describe('mutation parity', () => {
  it('postfix increment mutates and returns old value', () => {
    const e1 = makeEnv(), e2 = makeEnv()

    const c = compileExpression(`state.count++`, []).run( e1 )
    const i = interpretExpression( parseExpression(`state.count++`).ast, e2 )

    expect( c ).toBe( 3 )
    expect( i ).toBe( 3 )
    expect( e1.state.count ).toBe( 4 )
    expect( e2.state.count ).toBe( 4 )
  })

  it('prefix increment returns new value', () => {
    const e = makeEnv()
    expect( interpretExpression( parseExpression(`++state.count`).ast, e ) ).toBe( 4 )
    expect( e.state.count ).toBe( 4 )
  })

  it('compound assignment', () => {
    const e1 = makeEnv(), e2 = makeEnv()

    compileExpression(`state.count += 5`, []).run( e1 )
    interpretExpression( parseExpression(`state.count += 5`).ast, e2 )

    expect( e1.state.count ).toBe( 8 )
    expect( e2.state.count ).toBe( 8 )
  })

  it('assignment through an arrow handler', () => {
    const e = makeEnv()
    const handler = interpretExpression( parseExpression(`( v ) => state.count = v`).ast, e )

    handler( 42 )
    expect( e.state.count ).toBe( 42 )
  })
})

describe('compile cache', () => {
  it('returns the identical compiled object for the same source+scope', () => {
    const a = compileExpression(`state.count + 1`, [ 'x' ])
    const b = compileExpression(`state.count + 1`, [ 'x' ])
    expect( a ).toBe( b )
  })

  it('differentiates by scope names', () => {
    const a = compileExpression(`state.count + 1`, [ 'x' ])
    const b = compileExpression(`state.count + 1`, [ 'y' ])
    expect( a ).not.toBe( b )
  })
})

describe('interpreter sandbox', () => {
  it('cannot reach non-whitelisted globals', () => {
    const env = makeEnv()
    expect( interpretExpression( parseExpression(`setTimeout`).ast, env ) ).toBe( undefined )
    expect( interpretExpression( parseExpression(`globalThis`).ast, env ) ).toBe( undefined )
    expect( interpretExpression( parseExpression(`window`).ast, env ) ).toBe( undefined )
  })

  it('reaches whitelisted globals', () => {
    expect( interpretExpression( parseExpression(`Math.floor( 1.9 )`).ast, makeEnv() ) ).toBe( 1 )
  })
})
