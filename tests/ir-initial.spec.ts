/**
 * `initial`: an instance's own copy of what its template declares.
 */
import { describe, it, expect } from 'vitest'
import { initial } from '../src/ir/initial'

describe('initial', () => {
  it('copies data deeply: objects, arrays, Map, Set, Date, RegExp, typed arrays', () => {
    const src = { a: [ { b: 1 } ], m: new Map([ [ 'k', { v: 1 } ] ]), s: new Set([ 1 ]), d: new Date( 5 ), r: /x/g, t: new Uint8Array([ 1, 2 ]) }
    const out = initial( src )
    expect( out ).toEqual( src )
    expect( out.a ).not.toBe( src.a ); expect( out.a[ 0 ] ).not.toBe( src.a[ 0 ] )
    expect( out.m.get('k') ).not.toBe( src.m.get('k') )
    expect( out.s ).not.toBe( src.s ); expect( out.d ).not.toBe( src.d ); expect( out.r ).not.toBe( src.r ); expect( out.t ).not.toBe( src.t )
  })

  it('keeps a cycle a cycle', () => {
    const src: any = { name: 'a' }
    src.self = src
    const out = initial( src )
    expect( out.self ).toBe( out )
  })

  it('keeps a getter a getter, computing from the copy', () => {
    const src = { n: 2, get double(){ return this.n * 2 } }
    const out = initial( src )
    out.n = 5
    expect( out.double ).toBe( 10 )
    expect( src.double ).toBe( 4 )
  })

  it('keeps what is not data as it is: a class instance, a function', () => {
    class Client { #token = 't'; get token(){ return this.#token } }
    const client = new Client(), fn = () => 1
    const out = initial({ client, fn })
    expect( out.client ).toBe( client )
    expect( out.fn ).toBe( fn )
  })
})
