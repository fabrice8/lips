import { describe, it, expect, vi } from 'vitest'
import { signal, effect, untrack, reactive } from '../src/ir/signal'

describe('signal', () => {
  it('reads the initial value and writes back', () => {
    const [ read, write ] = signal( 10 )
    expect( read() ).toBe( 10 )

    write( 2 )
    expect( read() ).toBe( 2 )
  })

  it('skips notification when the value is unchanged (Object.is)', () => {
    const [ read, write ] = signal( 5 )
    const spy = vi.fn( () => read() )

    effect( spy )
    expect( spy ).toHaveBeenCalledTimes( 1 )

    write( 5 )
    expect( spy ).toHaveBeenCalledTimes( 1 )
  })

  it('touch() notifies without a value change', () => {
    const obj = { n: 1 }
    const [ read, , touch ] = signal( obj )
    const spy = vi.fn( () => read() )

    effect( spy )
    obj.n = 2            // mutated in place — no write
    expect( spy ).toHaveBeenCalledTimes( 1 )

    touch()
    expect( spy ).toHaveBeenCalledTimes( 2 )
  })
})

describe('effect', () => {
  it('re-runs when a tracked signal changes', () => {
    const [ read, write ] = signal( 0 )
    const seen: number[] = []

    effect( () => { seen.push( read() ) } )
    write( 1 )
    write( 2 )

    expect( seen ).toEqual([ 0, 1, 2 ])
  })

  it('tracks only signals actually read', () => {
    const [ a, setA ] = signal('a')
    const [ , setB ] = signal('b')
    const spy = vi.fn( () => a() )

    effect( spy )
    setB('bb')
    expect( spy ).toHaveBeenCalledTimes( 1 )

    setA('aa')
    expect( spy ).toHaveBeenCalledTimes( 2 )
  })

  it('stops re-running after dispose', () => {
    const [ read, write ] = signal( 0 )
    const spy = vi.fn( () => read() )

    const { dispose } = effect( spy )
    write( 1 )
    dispose()
    write( 2 )

    expect( spy ).toHaveBeenCalledTimes( 2 ) // initial + first write
  })

  it('re-tracks dependencies on every run (dynamic deps)', () => {
    const [ cond, setCond ] = signal( true )
    const [ a, setA ] = signal('a')
    const [ b, setB ] = signal('b')
    const seen: string[] = []

    effect( () => { seen.push( cond() ? a() : b() ) } )

    setCond( false )   // now depends on b
    setA('a2')         // must NOT re-run
    setB('b2')         // must re-run

    expect( seen ).toEqual([ 'a', 'b', 'b2' ])
  })
})

describe('untrack', () => {
  it('reads without subscribing', () => {
    const [ read, write ] = signal( 1 )
    const spy = vi.fn( () => untrack( () => read() ) )

    effect( spy )
    write( 2 )

    expect( spy ).toHaveBeenCalledTimes( 1 )
  })
})

describe('reactive', () => {
  it('tracks per key — unrelated writes do not re-run', () => {
    const store = reactive({ a: 1, b: 1 })
    const spy = vi.fn( () => store.a )

    effect( spy )
    store.b = 2
    expect( spy ).toHaveBeenCalledTimes( 1 )

    store.a = 2
    expect( spy ).toHaveBeenCalledTimes( 2 )
  })

  it('is idempotent when re-wrapped', () => {
    const store = reactive({ a: 1 })
    expect( reactive( store ) ).toBe( store )
  })

  it('ignores shallow nested mutation by default', () => {
    const store = reactive({ user: { name: 'Ada' } })
    const spy = vi.fn( () => store.user.name )

    effect( spy )
    store.user.name = 'Grace'
    expect( spy ).toHaveBeenCalledTimes( 1 )
  })

  it('propagates nested mutation in deep mode', () => {
    const store = reactive({ user: { name: 'Ada' }, list: [ 1 ] }, true )
    const seen: string[] = []

    effect( () => { seen.push( store.user.name ) } )
    store.user.name = 'Grace'
    expect( seen ).toEqual([ 'Ada', 'Grace' ])

    const lens = vi.fn( () => store.list.length )
    effect( lens )
    store.list.push( 2 )
    expect( lens ).toHaveBeenCalledTimes( 2 )
  })

  it('deletes keys reactively', () => {
    const store = reactive<{ a?: number }>({ a: 1 })
    const seen: any[] = []

    effect( () => { seen.push( store.a ) } )
    delete store.a

    expect( seen ).toEqual([ 1, undefined ])
  })
})
