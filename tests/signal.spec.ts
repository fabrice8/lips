import { describe, it, expect, vi } from 'vitest'
import { signal, effect, untrack, reactive, batch } from '../src/ir/signal'

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

describe('batch', () => {
  it('collapses many writes to one effect run', () => {
    const [ read, write ] = signal( 0 )
    let runs = 0
    effect( () => { read(); runs++ })

    expect( runs ).toBe( 1 )

    batch( () => { for( let i = 1; i <= 50; i++ ) write( i ) })

    expect( runs ).toBe( 2 )
    expect( read() ).toBe( 50 )
  })

  it('returns the callback value', () => {
    // A `return` inside the finally would silently discard this
    expect( batch( () => 42 ) ).toBe( 42 )
  })

  it('only flushes when the outermost batch exits', () => {
    const [ read, write ] = signal( 0 )
    let runs = 0
    effect( () => { read(); runs++ })

    batch( () => {
      write( 1 )
      batch( () => write( 2 ) )
      expect( runs ).toBe( 1 )   // still queued
    })

    expect( runs ).toBe( 2 )
  })

  it('collapses writes made by effects during the drain', () => {
    const [ readA, writeA ] = signal( 0 )
    const [ readB, writeB ] = signal( 0 )
    let bRuns = 0

    effect( () => { const a = readA(); a && writeB( a ) })
    effect( () => { readB(); bRuns++ })

    expect( bRuns ).toBe( 1 )

    batch( () => { writeA( 1 ); writeA( 2 ); writeA( 3 ) })

    expect( bRuns ).toBe( 2 )
    expect( readB() ).toBe( 3 )
  })

  it('flushes and resets depth when the callback throws', () => {
    const [ read, write ] = signal( 0 )
    let runs = 0
    effect( () => { read(); runs++ })

    expect( () => batch( () => { write( 1 ); throw new Error('boom') }) ).toThrow('boom')

    expect( runs ).toBe( 2 )   // queued work still flushed

    write( 2 )                 // and batching is not left switched on
    expect( runs ).toBe( 3 )
  })

  it('collapses nested writes on a deep-reactive list', () => {
    /**
     * The case that motivates it: a nested write force-notifies the TOP
     * key's subscribers, so N writes to N items cost N notifications
     * unbatched. See bench/reactivity-batch.html.
     */
    const store = reactive({ items: [ { x: 0 }, { x: 0 }, { x: 0 } ] }, true )
    let runs = 0
    effect( () => { ( store.items as any[] ).forEach( i => i.x ); runs++ })

    expect( runs ).toBe( 1 )

    ;( store.items as any[] ).forEach( i => i.x = 1 )
    expect( runs ).toBe( 4 )   // one notification per nested write

    runs = 0
    batch( () => ( store.items as any[] ).forEach( i => i.x = 2 ) )
    expect( runs ).toBe( 1 )   // collapsed
  })
})

describe('per-object signals', () => {
  it('a nested write notifies only the binding that read that key', () => {
    const store = reactive({ rows: [ { x: 0, y: 0 }, { x: 0, y: 0 } ] }, true )

    let listRuns = 0, xRuns = 0, yRuns = 0
    effect( () => { ( store.rows as any[] ).map( r => r ); listRuns++ })
    effect( () => { ( store.rows as any[] )[0].x; xRuns++ })
    effect( () => { ( store.rows as any[] )[0].y; yRuns++ })

    expect([ listRuns, xRuns, yRuns ]).toEqual([ 1, 1, 1 ])

    ;( store.rows as any[] )[0].x = 5

    // only the x binding — the list is NOT invalidated
    expect([ listRuns, xRuns, yRuns ]).toEqual([ 1, 2, 1 ])
  })

  it('write cost does not grow with list length', () => {
    /**
     * The property that matters. Before per-object channels a nested
     * write force-notified the top key, so the keyed <for> re-ran and
     * one write cost O(list). See bench/reactivity-batch.html.
     */
    const runs = ( n: number ) => {
      const store = reactive({ rows: Array.from({ length: n }, ( _, i ) => ({ i, v: 0 }) ) }, true )
      let listRuns = 0
      effect( () => { ( store.rows as any[] ).map( r => r.i ); listRuns++ })

      const before = listRuns
      ;( store.rows as any[] )[0].v = 1
      return listRuns - before
    }

    expect( runs( 10 ) ).toBe( 0 )
    expect( runs( 1000 ) ).toBe( 0 )
  })

  it('still wakes the list for a structural change', () => {
    const store = reactive({ rows: [ { id: 'a' } ] }, true )
    let listRuns = 0
    effect( () => { ( store.rows as any[] ).map( r => r.id ); listRuns++ })

    ;( store.rows as any[] ).push({ id: 'b' })
    expect( listRuns ).toBe( 2 )

    ;( store.rows as any[] ).splice( 0, 1 )
    expect( listRuns ).toBe( 3 )
  })

  it('runs a multi-channel subscriber once per structural change', () => {
    /**
     * A keyed <for> subscribes to `length` and every index. Firing each
     * channel separately would re-run it once per channel, which is the
     * cost the change exists to remove — the fan-out is batched.
     */
    const store = reactive({ rows: Array.from({ length: 50 }, ( _, i ) => ({ i }) ) }, true )
    let runs = 0
    effect( () => { ( store.rows as any[] ).map( r => r.i ); runs++ })

    ;( store.rows as any[] ).push({ i: 50 })

    expect( runs ).toBe( 2 )
  })

  it('tracks key addition and removal for object iteration', () => {
    const store = reactive({ map: { a: 1 } as Record<string, number> }, true )
    let runs = 0
    effect( () => { Object.keys( store.map ); runs++ })

    store.map.b = 2
    expect( runs ).toBe( 2 )

    delete store.map.b
    expect( runs ).toBe( 3 )

    // a value change on an existing key is not a key-set change
    store.map.a = 9
    expect( runs ).toBe( 3 )
  })

  it('shares one proxy across stores, so a write through either is seen', () => {
    /**
     * A parent's `state.rows` and a child's `input.rows` are the same
     * array. Per-store proxies would give each private channels, and a
     * write through one would be invisible to the other.
     */
    const rows = [ { n: 1 } ]
    const parent = reactive({ rows }, true )
    const child = reactive({ rows }, true )

    let seen = 0
    effect( () => { ( child.rows as any[] )[0].n; seen++ })

    ;( parent.rows as any[] )[0].n = 2

    expect( seen ).toBe( 2 )
    expect( ( child.rows as any[] )[0].n ).toBe( 2 )
  })

  it('does not notify on a no-op write', () => {
    const store = reactive({ o: { a: 1 } }, true )
    let runs = 0
    effect( () => { ( store.o as any ).a; runs++ })

    ;( store.o as any ).a = 1
    expect( runs ).toBe( 1 )

    ;( store.o as any ).a = 2
    expect( runs ).toBe( 2 )
  })
})
