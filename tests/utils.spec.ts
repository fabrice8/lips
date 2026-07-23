import { describe, it, expect } from 'vitest'
import { isDiff, isEqual, deepClone, deepAssign } from '../src/utils'

describe('isDiff', () => {
  it('returns false for identical references and equal primitives', () => {
    const obj = { a: 1 }
    expect( isDiff( obj, obj ) ).toBe( false )
  })

  it('detects changed nested values', () => {
    expect( isDiff( { a: { b: 1 } }, { a: { b: 2 } } ) ).toBe( true )
    expect( isDiff( { a: { b: 1 } }, { a: { b: 1 } } ) ).toBe( false )
  })

  it('detects added/removed keys', () => {
    expect( isDiff( { a: 1 }, { a: 1, b: 2 } ) ).toBe( true )
    expect( isDiff( { a: 1, b: 2 }, { a: 1 } ) ).toBe( true )
  })

  it('compares arrays by position', () => {
    expect( isDiff( [ 1, 2, 3 ], [ 1, 2, 3 ] ) ).toBe( false )
    expect( isDiff( [ 1, 2, 3 ], [ 1, 3, 2 ] ) ).toBe( true )
    expect( isDiff( [ 1, 2 ], [ 1, 2, 3 ] ) ).toBe( true )
  })

  it('compares Maps and Sets', () => {
    expect( isDiff( new Map([[ 'a', 1 ]]), new Map([[ 'a', 1 ]]) ) ).toBe( false )
    expect( isDiff( new Map([[ 'a', 1 ]]), new Map([[ 'a', 2 ]]) ) ).toBe( true )
    expect( isDiff( new Set([ 1, 2 ]), new Set([ 1, 2 ]) ) ).toBe( false )
    expect( isDiff( new Set([ 1, 2 ]), new Set([ 1, 3 ]) ) ).toBe( true )
  })

  it('compares Dates and RegExps', () => {
    expect( isDiff( { d: new Date( 1000 ) }, { d: new Date( 1000 ) } ) ).toBe( false )
    expect( isDiff( { d: new Date( 1000 ) }, { d: new Date( 2000 ) } ) ).toBe( true )
    expect( isDiff( { r: /a/g }, { r: /a/g } ) ).toBe( false )
    expect( isDiff( { r: /a/g }, { r: /a/i } ) ).toBe( true )
  })
})

describe('isEqual', () => {
  it('handles primitives and NaN', () => {
    expect( isEqual( 1, 1 ) ).toBe( true )
    expect( isEqual( NaN, NaN ) ).toBe( true )
    expect( isEqual( 1, '1' ) ).toBe( false )
    expect( isEqual( null, undefined ) ).toBe( false )
  })

  it('deep-compares plain objects and arrays', () => {
    expect( isEqual( { a: [ 1, { b: 2 } ] }, { a: [ 1, { b: 2 } ] } ) ).toBe( true )
    expect( isEqual( { a: [ 1, { b: 2 } ] }, { a: [ 1, { b: 3 } ] } ) ).toBe( false )
  })

  it('compares TypedArrays byte-wise', () => {
    expect( isEqual( new Uint8Array([ 1, 2 ]), new Uint8Array([ 1, 2 ]) ) ).toBe( true )
    expect( isEqual( new Uint8Array([ 1, 2 ]), new Uint8Array([ 1, 3 ]) ) ).toBe( false )
  })
})

describe('deepClone', () => {
  it('clones nested structures without sharing references', () => {
    const src = { a: { b: [ 1, 2, { c: 3 } ] } }
    const out = deepClone( src )

    expect( out ).toEqual( src )
    expect( out.a ).not.toBe( src.a )
    expect( out.a.b[2] ).not.toBe( src.a.b[2] )
  })

  it('preserves Map/Set/Date/RegExp types', () => {
    const src = {
      m: new Map([[ 'k', { x: 1 } ]]),
      s: new Set([ 1, 2 ]),
      d: new Date( 12345 ),
      r: /abc/gi
    }
    const out = deepClone( src )

    expect( out.m ).toBeInstanceOf( Map )
    expect( out.m.get('k') ).toEqual({ x: 1 })
    expect( out.m.get('k') ).not.toBe( src.m.get('k') )
    expect( out.s ).toBeInstanceOf( Set )
    expect( out.d.getTime() ).toBe( 12345 )
    expect( out.r.source ).toBe('abc')
  })

  it('handles circular references', () => {
    const src: any = { name: 'root' }
    src.self = src

    const out = deepClone( src )
    expect( out.self ).toBe( out )
  })
})

describe('deepAssign', () => {
  it('sets values by dot-notation path without mutating the original', () => {
    const src = { a: { b: 1 }, keep: true }
    const out = deepAssign( src, { 'a.b': 2 } )

    expect( out.a.b ).toBe( 2 )
    expect( out.keep ).toBe( true )
    expect( src.a.b ).toBe( 1 )
  })

  it('creates intermediate objects and arrays', () => {
    const out: any = deepAssign( {}, { 'x.y[0].z': 'deep' } )
    expect( out.x.y[0].z ).toBe('deep')
    expect( Array.isArray( out.x.y ) ).toBe( true )
  })

  it('rejects invalid path formats', () => {
    expect( () => deepAssign( {}, { 'a b': 1 } ) ).toThrow()
  })
})
