/**
 * The reactivity core held to an established body of signal semantics:
 * glitches, diamonds, laziness, equality, dynamic dependencies, errors,
 * cycles, disposal, batching and `untrack`.
 *
 * Sources, adapted to Lips's API, with thanks:
 * - signal-polyfill, the TC39 Signals proposal's polyfill, `tests/`
 *   (https://github.com/proposal-signals/signal-polyfill), Apache-2.0.
 *   Its graph cases are in turn ported from the Solid, Preact and Vue
 *   reactivity tests (MIT), credited in place there and here.
 * - Preact Signals, `packages/core/test/signal.test.tsx`
 *   (https://github.com/preactjs/signals), MIT.
 * Changes: each case is rewritten onto `signal`, `computed`, `effect`,
 * `batch`, `untrack` and `reactive` as Lips has them (`state` and `memo`
 * below keep the shape of the originals); some cases are new, for Lips.
 *
 * Where Lips deliberately behaves otherwise, the case says so and asserts
 * what Lips does, so the difference is held as much as the rest. None is
 * skipped.
 */
import { describe, it, expect, vi } from 'vitest'
import { signal, effect, untrack, reactive, batch, computed } from '../src/ir/signal'

/** A source, shaped like the originals' `State` */
const state = <T>( value: T ) => {
  const [ get, set, touch ] = signal( value )
  return { get, set, touch }
}
/** A computed value, shaped like the originals' `Computed` */
const memo = <T>( fn: () => T ) => {
  const c = computed( fn )
  return { get: c.read, dispose: c.dispose }
}

describe('a source (signal)', () => {
  // signal-polyfill tests/Signal/state.test.ts
  it('reads what was written', () => {
    const s = state( 0 )
    expect( s.get() ).toBe( 0 )
    s.set( 10 )
    expect( s.get() ).toBe( 10 )
  })

  it('compares by Object.is: writing NaN over NaN changes nothing', () => {
    const s = state( NaN )
    let calls = 0
    const c = memo( () => ( calls++, s.get() ) )
    expect( c.get() ).toBe( NaN )
    s.set( NaN )
    expect( c.get() ).toBe( NaN )
    expect( calls ).toBe( 1 )
  })

  /**
   * Lips differs: a source takes no custom `equals`. What it has instead
   * is `touch()`, a change without a new value, for what is mutated in
   * place.
   */
  it('takes no custom equality; touch() tells of a change in place', () => {
    const s = state({ n: 1 })
    let calls = 0
    const c = memo( () => ( calls++, s.get().n ) )
    expect( c.get() ).toBe( 1 )
    s.get().n = 2
    s.touch()
    expect([ c.get(), calls ]).toEqual([ 2, 2 ])
  })

  // Preact: should notify other listeners of changes after one listener is disposed
  it('still notifies the others once one reader is disposed', () => {
    const s = state( 0 )
    const spy1 = vi.fn( () => { s.get() } ), spy2 = vi.fn( () => { s.get() } ), spy3 = vi.fn( () => { s.get() } )
    effect( spy1 )
    const { dispose } = effect( spy2 )
    effect( spy3 )
    dispose()
    s.set( 1 )
    expect([ spy1, spy2, spy3 ].map( s => s.mock.calls.length ) ).toEqual([ 2, 1, 2 ])
  })
})

describe('computed: laziness and equality', () => {
  // signal-polyfill tests/Signal/computed.test.ts
  it('is the value of what it reads', () => {
    const s = state( 1 ), c = memo( () => s.get() * 2 )
    expect( c.get() ).toBe( 2 )
    s.set( 5 )
    expect( c.get() ).toBe( 10 )
  })

  // signal-polyfill: should track Computed by Object.is
  it('wakes what reads it only when its value changed, by Object.is', () => {
    const s = state( 1 )
    let value = 5, calls = 0
    const c = memo( () => ( s.get(), value ) )
    const c2 = memo( () => ( calls++, c.get() ) )

    expect([ c2.get(), calls ]).toEqual([ 5, 1 ])
    s.set( 2 )
    expect([ c2.get(), calls ]).toEqual([ 5, 1 ])
    value = NaN
    expect([ c2.get(), calls ]).toEqual([ 5, 1 ])
    s.set( 3 )
    expect([ c2.get(), calls ]).toEqual([ NaN, 2 ])
    s.set( 4 )
    expect([ c2.get(), calls ]).toEqual([ NaN, 2 ])
  })

  /**
   * Lips differs: a computed takes no custom `equals`, and an object it
   * returns always counts as changed. Lips's stores mutate in place, so
   * the same reference can hold new contents; a computed that passes a
   * touched collection on must pass the touch on too.
   */
  it('counts an object it returns as changed, the same one or not', () => {
    const s = state( 5 ), same = {}
    let calls = 0
    const c1 = memo( () => ( s.get(), same ) )
    const c2 = memo( () => ( calls++, c1.get() ) )
    expect([ c2.get(), calls ]).toEqual([ same, 1 ])
    s.set( 10 )
    expect([ c2.get(), calls ]).toEqual([ same, 2 ])
  })

  it('passes a touched collection on to what reads it', () => {
    const store = reactive({ m: new Map<string, number>() }, true )
    const m = memo( () => store.m ), sizes: number[] = []
    effect( () => { sizes.push( m.get().size ) })
    store.m.set( 'a', 1 )
    expect( sizes ).toEqual([ 0, 1 ])
  })

  // signal-polyfill, ported from Preact: should be lazily computed on demand
  it('is computed on demand, not on write', () => {
    const a = state( 'a' ), b = state( 'b' )
    const spy = vi.fn( () => a.get() + b.get() ), c = memo( spy )
    expect( spy ).not.toHaveBeenCalled()
    c.get()
    expect( spy ).toHaveBeenCalledTimes( 1 )
    a.set( 'x' )
    b.set( 'y' )
    expect( spy ).toHaveBeenCalledTimes( 1 )
    c.get()
    expect( spy ).toHaveBeenCalledTimes( 2 )
  })

  // signal-polyfill, ported from Vue: should compute lazily
  it('is not computed again until read, nor twice for one change', () => {
    const s = state<{ foo?: number }>({})
    const getter = vi.fn( () => s.get().foo ), c = memo( getter )
    expect( getter ).not.toHaveBeenCalled()
    expect( c.get() ).toBe( undefined )
    c.get()
    expect( getter ).toHaveBeenCalledTimes( 1 )
    s.set({ foo: 1 })
    expect( getter ).toHaveBeenCalledTimes( 1 )
    expect( c.get() ).toBe( 1 )
    c.get()
    expect( getter ).toHaveBeenCalledTimes( 2 )
  })

  // Preact: should be computed only when a dependency has changed at some point
  it('is not computed again when a source is written with the value it has', () => {
    const a = state( 'a' ), spy = vi.fn( () => a.get() ), c = memo( spy )
    c.get()
    a.set( 'a' )
    c.get()
    expect( spy ).toHaveBeenCalledTimes( 1 )
  })

  // Preact: should run computeds once for multiple dep changes
  it('is computed once for several changes before it is read', () => {
    const a = state( 'a' ), b = state( 'b' )
    const compute = vi.fn( () => a.get() + b.get() ), c = memo( compute )
    expect( c.get() ).toBe( 'ab' )
    a.set( 'aa' )
    b.set( 'bb' )
    expect( c.get() ).toBe( 'aabb' )
    expect( compute ).toHaveBeenCalledTimes( 2 )
  })

  // signal-polyfill, ported from Preact: should support lazy branches
  it('supports lazy branches', () => {
    const a = state( 0 ), b = memo( () => a.get() )
    const c = memo( () => a.get() > 0 ? a.get() : b.get() )
    expect( c.get() ).toBe( 0 )
    a.set( 1 )
    expect( c.get() ).toBe( 1 )
    a.set( 0 )
    expect( c.get() ).toBe( 0 )
  })

  /**
   * signal-polyfill, ported from Vue: should work when chained (ref +
   * computed), and should be recomputed without being affected by side
   * effects. A computed that writes a source while it is computed: Lips,
   * like the polyfill, keeps what was computed and does not compute again
   * for that write (Vue and Preact do).
   */
  it('a write made while it is computed does not compute it again', () => {
    const v = state( 0 )
    const c1 = memo( () => { v.get() === 0 && v.set( 1 ); return 'foo' })
    const c2 = memo( () => v.get() + c1.get() )
    expect( c2.get() ).toBe( '0foo' )
    expect( c2.get() ).toBe( '0foo' )

    const w = state( 0 )
    const d1 = memo( () => { w.set( 1 ); return 0 })
    const d2 = memo( () => w.get() + ',' + d1.get() )
    expect( d2.get() ).toBe( '0,0' )
    w.set( 1 )
    expect( d2.get() ).toBe( '0,0' )

    // Preact: should recompute if a dependency changes during computation after becoming a dependency
    const a = state( 0 ), spy = vi.fn( () => { a.set( a.get() + 1 ) }), c = memo( spy )
    c.get()
    c.get()
    expect( spy ).toHaveBeenCalledTimes( 1 )
  })

  // Preact: should conditionally unsubscribe from signals
  it('reads again only the sources it read last', () => {
    const a = state( 'a' ), b = state( 'b' ), cond = state( true )
    const spy = vi.fn( () => cond.get() ? a.get() : b.get() ), c = memo( spy )
    expect( c.get() ).toBe( 'a' )
    b.set( 'bb' )
    expect( c.get() ).toBe( 'a' )
    expect( spy ).toHaveBeenCalledTimes( 1 )
    cond.set( false )
    expect( c.get() ).toBe( 'bb' )
    spy.mockClear()
    a.set( 'aaa' )
    expect( c.get() ).toBe( 'bb' )
    expect( spy ).not.toHaveBeenCalled()
  })

  // Preact: should propagate notifications even right after first subscription
  it('wakes a reader that subscribed after it was first computed', () => {
    const a = state( 0 ), b = memo( () => a.get() ), c = memo( () => b.get() )
    c.get()
    const spy = vi.fn( () => { c.get() })
    effect( spy )
    a.set( 1 )
    expect( spy ).toHaveBeenCalledTimes( 2 )
  })

  // Preact: should get marked as outdated right after first subscription
  it('is out of date for a reader that subscribes after the change', () => {
    const s = state( 0 ), c = memo( () => s.get() )
    c.get()
    s.set( 1 )
    effect( () => { c.get() })
    expect( c.get() ).toBe( 1 )
  })

  // Preact: should propagate notification to other listeners after one listener is disposed
  it('still wakes the others once one reader is disposed', () => {
    const s = state( 0 ), c = memo( () => s.get() )
    const spy1 = vi.fn( () => { c.get() }), spy2 = vi.fn( () => { c.get() }), spy3 = vi.fn( () => { c.get() })
    effect( spy1 )
    const { dispose } = effect( spy2 )
    effect( spy3 )
    dispose()
    s.set( 1 )
    expect([ spy1, spy2, spy3 ].map( s => s.mock.calls.length ) ).toEqual([ 2, 1, 2 ])
  })

  // Preact: should not recompute dependencies out of order (computed)
  it('does not compute a value a branch no longer reads', () => {
    const a = state( 1 ), b = state( 1 ), c = state( 1 )
    const spy = vi.fn( () => c.get() ), d = memo( spy )
    const e = memo( () => { if( a.get() > 0 ){ b.get(); d.get() } else b.get() })
    e.get()
    spy.mockClear()

    a.set( 2 ); b.set( 2 ); c.set( 2 )
    e.get()
    expect( spy ).toHaveBeenCalledTimes( 1 )
    spy.mockClear()

    a.set( -1 ); b.set( -1 ); c.set( -1 )
    e.get()
    expect( spy ).not.toHaveBeenCalled()
  })

  // Preact: should not recompute dependencies unnecessarily (computed)
  it('does not compute a value it will not read', () => {
    const spy = vi.fn(), a = state( 0 ), b = state( 0 )
    const c = memo( () => { b.get(); spy() })
    const d = memo( () => { a.get() === 0 && c.get() })
    d.get()
    batch( () => { b.set( 1 ); a.set( 1 ) })
    d.get()
    expect( spy ).toHaveBeenCalledTimes( 1 )
  })

  it('disposed, it keeps its last value, and is neither computed nor wakes', () => {
    const s = state( 1 ), fn = vi.fn( () => s.get() ), c = memo( fn )
    const spy = vi.fn( () => { c.get() })
    effect( spy )
    c.dispose()
    s.set( 2 )
    expect([ c.get(), fn.mock.calls.length, spy.mock.calls.length ]).toEqual([ 1, 1, 1 ])
  })
})

/**
 * signal-polyfill tests/behaviors/graph.test.ts, itself ported from the
 * Solid (https://github.com/solidjs/signals) and Preact graph tests.
 */
describe('graph', () => {
  it('drops X->A->X updates', () => {
    //     X
    //   / |
    //  A  |
    //   \ |
    //     B
    //     |
    //     C
    const x = state( 2 ), a = memo( () => x.get() - 1 ), b = memo( () => x.get() + a.get() )
    const compute = vi.fn( () => 'c: ' + b.get() ), c = memo( compute )
    expect( c.get() ).toBe( 'c: 3' )
    compute.mockClear()
    x.set( 4 )
    c.get()
    expect( compute ).toHaveBeenCalledTimes( 1 )
  })

  it('updates every value once (diamond)', () => {
    //     X
    //   /   \
    //  A     B
    //   \   /
    //     C
    const x = state( 'a' ), a = memo( () => x.get() ), b = memo( () => x.get() )
    const spy = vi.fn( () => a.get() + ' ' + b.get() ), c = memo( spy )
    expect( c.get() ).toBe( 'a a' )
    x.set( 'aa' )
    expect( c.get() ).toBe( 'aa aa' )
    expect( spy ).toHaveBeenCalledTimes( 2 )
  })

  it('updates every value once (diamond and tail)', () => {
    const x = state( 'a' ), a = memo( () => x.get() ), b = memo( () => x.get() )
    const c = memo( () => a.get() + ' ' + b.get() )
    const spy = vi.fn( () => c.get() ), d = memo( spy )
    expect( d.get() ).toBe( 'a a' )
    x.set( 'aa' )
    expect( d.get() ).toBe( 'aa aa' )
    expect( spy ).toHaveBeenCalledTimes( 2 )
  })

  it('bails out where a value is the same', () => {
    const x = state( 'a' ), a = memo( () => { x.get(); return 'foo' })
    const spy = vi.fn( () => a.get() ), b = memo( spy )
    expect( b.get() ).toBe( 'foo' )
    x.set( 'aa' )
    expect( b.get() ).toBe( 'foo' )
    expect( spy ).toHaveBeenCalledTimes( 1 )
  })

  it('updates every value once (jagged diamond and tails)', () => {
    //     X
    //   /   \
    //  A     B
    //  |     |
    //  |     C
    //   \   /
    //     D
    //   /   \
    //  E     F
    const x = state( 'a' ), a = memo( () => x.get() ), b = memo( () => x.get() ), c = memo( () => b.get() )
    const dSpy = vi.fn( () => a.get() + ' ' + c.get() ), d = memo( dSpy )
    const eSpy = vi.fn( () => d.get() ), e = memo( eSpy )
    const fSpy = vi.fn( () => d.get() ), f = memo( fSpy )
    expect([ e.get(), f.get() ]).toEqual([ 'a a', 'a a' ])

    for( const [ next, n ] of [ [ 'b', 2 ], [ 'c', 3 ] ] as const ){
      x.set( next )
      expect([ d.get(), e.get(), f.get() ]).toEqual( Array( 3 ).fill( next + ' ' + next ) )
      expect([ dSpy, eSpy, fSpy ].map( s => s.mock.calls.length ) ).toEqual([ n, n, n ])
    }
  })

  it('updates what reads two values though one of them is the same', () => {
    const x = state( 'a' ), a = memo( () => x.get() ), b = memo( () => { x.get(); return 'c' })
    const spy = vi.fn( () => a.get() + ' ' + b.get() ), c = memo( spy )
    expect( c.get() ).toBe( 'a c' )
    x.set( 'aa' )
    expect( c.get() ).toBe( 'aa c' )
    expect( spy ).toHaveBeenCalledTimes( 2 )
  })

  it('updates what reads three values though two of them are the same', () => {
    const x = state( 'a' ), b = memo( () => x.get() )
    const c = memo( () => { x.get(); return 'c' }), d = memo( () => { x.get(); return 'd' })
    const spy = vi.fn( () => b.get() + ' ' + c.get() + ' ' + d.get() ), e = memo( spy )
    expect( e.get() ).toBe( 'a c d' )
    x.set( 'aa' )
    expect( e.get() ).toBe( 'aa c d' )
    expect( spy ).toHaveBeenCalledTimes( 2 )
  })

  // Preact: should not update a sub if all deps unmark it
  it('does not update what reads only values that are the same', () => {
    const a = state( 'a' ), b = memo( () => { a.get(); return 'b' }), c = memo( () => { a.get(); return 'c' })
    const spy = vi.fn( () => b.get() + ' ' + c.get() ), d = memo( spy )
    expect( d.get() ).toBe( 'b c' )
    spy.mockClear()
    a.set( 'aa' )
    d.get()
    expect( spy ).not.toHaveBeenCalled()
  })

  /**
   * `equals: () => false` in the original: here each value is a new
   * object, which Lips always counts as changed.
   */
  it('propagates in topological order', () => {
    let seq = ''
    const a1 = state( false )
    const b1 = memo( () => { a1.get(); seq += 'b1'; return {} })
    const b2 = memo( () => { a1.get(); seq += 'b2'; return {} })
    const c1 = memo( () => { b1.get(); b2.get(); seq += 'c1'; return {} })
    c1.get()
    seq = ''
    a1.set( true )
    c1.get()
    expect( seq ).toBe( 'b1b2c1' )
  })

  it('propagates once with linear convergence', () => {
    const d = state( 0 ), fs = Array.from({ length: 5 }, () => memo( () => d.get() ) )
    let gcount = 0
    const g = memo( () => ( gcount++, fs.reduce( ( n, f ) => n + f.get(), 0 ) ) )
    g.get()
    gcount = 0
    d.set( 1 )
    expect( g.get() ).toBe( 5 )
    expect( gcount ).toBe( 1 )
  })

  it('propagates once with exponential convergence', () => {
    const d = state( 0 ), fs = Array.from({ length: 3 }, () => memo( () => d.get() ) )
    const gs = Array.from({ length: 3 }, () => memo( () => fs.reduce( ( n, f ) => n + f.get(), 0 ) ) )
    let hcount = 0
    const h = memo( () => ( hcount++, gs.reduce( ( n, g ) => n + g.get(), 0 ) ) )
    h.get()
    hcount = 0
    d.set( 1 )
    expect( h.get() ).toBe( 9 )
    expect( hcount ).toBe( 1 )
  })

  // `equals: () => false` on the source in the original: `touch()` here
  it('does not compute what is downstream unless a value changed', () => {
    const s1 = state( 1 )
    let order = ''
    const t1 = memo( () => { order += 't1'; return s1.get() })
    const t2 = memo( () => { order += 'c1'; t1.get() })
    t2.get()
    expect( order ).toBe( 'c1t1' )
    order = ''
    s1.touch()
    t2.get()
    expect( order ).toBe( 't1' )
    order = ''
    s1.set( 2 )
    t2.get()
    expect( order ).toBe( 't1c1' )
  })

  it('asks what a value read before computing it again, in the order it read them', () => {
    const s1 = state( 0 )
    let order = ''
    const t1 = memo( () => { order += 't1'; return s1.get() === 0 })
    const t2 = memo( () => { order += 'c1'; return s1.get() })
    const t3 = memo( () => { order += 'c2'; return t1.get() })
    t2.get()
    t3.get()
    expect( order ).toBe( 'c1c2t1' )
    order = ''
    s1.set( 1 )
    t2.get()
    t3.get()
    expect( order ).toBe( 'c1t1c2' )
  })

  it('updates pending values downstream, and one made inside another', () => {
    const s1 = state( 0 ), s2 = state( 0 )
    let order = ''
    const t1 = memo( () => { order += 't1'; return s1.get() === 0 })
    const t2 = memo( () => { order += 'c1'; return s1.get() })
    const t3 = memo( () => {
      order += 'c2'
      t1.get()
      return memo( () => { order += 'c2_1'; return s2.get() })
    })
    order = ''
    s1.set( 1 )
    t2.get()
    t3.get().get()
    expect( order ).toBe( 'c1c2t1c2_1' )
  })

  describe('with changing dependencies', () => {
    const init = () => {
      const i = state( true ), t = state( 1 ), e = state( 2 )
      const g = { fevals: 0 }
      const f = memo( () => ( g.fevals++, i.get() ? t.get() : e.get() ) )
      f.get()
      g.fevals = 0
      return { i, t, e, f, g }
    }

    it('updates on active dependencies', () => {
      const { t, f, g } = init()
      t.set( 5 )
      expect([ f.get(), g.fevals ]).toEqual([ 5, 1 ])
    })

    it('does not update on inactive dependencies', () => {
      const { e, f, g } = init()
      e.set( 5 )
      expect([ f.get(), g.fevals ]).toEqual([ 1, 0 ])
    })

    it('deactivates obsolete dependencies', () => {
      const { i, t, f, g } = init()
      i.set( false )
      f.get()
      g.fevals = 0
      t.set( 5 )
      f.get()
      expect( g.fevals ).toBe( 0 )
    })

    it('activates new dependencies', () => {
      const { i, e, f, g } = init()
      i.set( false )
      g.fevals = 0
      e.set( 5 )
      f.get()
      expect( g.fevals ).toBe( 1 )
    })

    it('updates new dependencies before what depends on them', () => {
      let order = ''
      const a = state( 0 )
      const b = memo( () => { order += 'b'; return a.get() + 1 })
      const c = memo( () => { order += 'c'; return b.get() || e.get() })
      const d = memo( () => a.get() )
      const e = memo( () => { order += 'd'; return d.get() + 10 })

      c.get(); e.get()
      expect( order ).toBe( 'cbd' )

      order = ''
      a.set( -1 )
      c.get(); e.get()
      expect( order ).toBe( 'bcd' )
      expect( c.get() ).toBe( 9 )

      order = ''
      a.set( 0 )
      c.get(); e.get()
      expect( order ).toBe( 'bcd' )
      expect( c.get() ).toBe( 1 )
    })
  })

  it('does not update pending values after a stale one', () => {
    const s1 = state( 1 ), s2 = state( false )
    let count = 0
    const t1 = memo( () => s1.get() > 0 ), t2 = memo( () => s1.get() > 0 ), c1 = memo( () => s1.get() )
    const t3 = memo( () => s1.get() && s2.get() )
    const c3 = memo( () => { t1.get(); t2.get(); c1.get(); t3.get(); count++ })
    c3.get()
    s2.set( true )
    c3.get()
    expect( count ).toBe( 2 )
    s1.set( 2 )
    c3.get()
    expect( count ).toBe( 3 )
  })

  // `equals: () => false` in the original: `touch()` on the source, a new object from c1
  it('computes stale values before what reads them where the others are the same', () => {
    const s1 = state( 1 )
    let order = ''
    const t1 = memo( () => { order += 't1'; return s1.get() > 2 })
    const t2 = memo( () => { order += 't2'; return s1.get() > 2 })
    const c1 = memo( () => { order += 'c1'; s1.get(); return {} })
    const c2 = memo( () => { order += 'c2'; t1.get(); t2.get(); c1.get() })
    c2.get()
    order = ''
    s1.touch()
    c2.get()
    expect( order ).toBe( 't1t2c1c2' )
    order = ''
    s1.set( 3 )
    c2.get()
    expect( order ).toBe( 't1c2t2c1' )
  })

  it('marks what is downstream out of date', () => {
    const s1 = state( 1 )
    let order = ''
    const t1 = memo( () => { order += 't1'; return s1.get() })
    const c1 = memo( () => { order += 'c1'; return t1.get() })
    const c2 = memo( () => { order += 'c2'; return c1.get() })
    const c3 = memo( () => { order += 'c3'; return c2.get() })
    c3.get()
    order = ''
    s1.set( 2 )
    c3.get()
    expect( order ).toBe( 't1c1c2c3' )
  })
})

// signal-polyfill tests/behaviors/pruning.test.ts
describe('pruning', () => {
  const chain = () => {
    const s = state( 0 ), n = [ 0, 0, 0 ]
    const c = memo( () => ( n[0]++, s.get() ) )
    const c2 = memo( () => ( n[1]++, c.get(), 5 ) )
    const c3 = memo( () => ( n[2]++, c2.get() ) )
    return { s, n, c3 }
  }

  it('computes again only until a value is the same', () => {
    const { s, n, c3 } = chain()
    expect( n ).toEqual([ 0, 0, 0 ])
    expect( c3.get() ).toBe( 5 )
    expect( n ).toEqual([ 1, 1, 1 ])
    s.set( 1 )
    expect( n ).toEqual([ 1, 1, 1 ])
    expect( c3.get() ).toBe( 5 )
    expect( n ).toEqual([ 2, 2, 1 ])
  })

  // The original watches c3 (`Watcher`); an effect reading it is Lips's live reader
  it('prunes as much with an effect reading the end of the chain', () => {
    const { s, n, c3 } = chain()
    const spy = vi.fn( () => { c3.get() })
    effect( spy )
    expect( n ).toEqual([ 1, 1, 1 ])
    s.set( 1 )
    expect( n ).toEqual([ 2, 2, 1 ])
    expect( spy ).toHaveBeenCalledTimes( 1 )
  })
})

/**
 * signal-polyfill tests/behaviors/dynamic-dependencies.test.ts. The
 * original reads the sources back (`introspectSources`), which Lips does
 * not expose: here what a source wakes says the same.
 */
describe('dynamic dependencies', () => {
  for( const live of [ false, true ] )
    it( live ? 'follows the sources it reads, read by an effect' : 'follows the sources it reads', () => {
      const states = Array.from( 'abcdefgh' ).map( s => state( s ) )
      const sources = state( states )
      let runs = 0
      const c = memo( () => { runs++; let str = ''; for( const s of sources.get() ) str += s.get(); return str })
      live && effect( () => { c.get() })
      const woken = ( s: ReturnType<typeof state<string>> ) => {
        const before = runs
        s.set( s.get() + '!' )
        c.get()
        s.set( s.get().slice( 0, -1 ) )
        c.get()
        return runs > before
      }

      expect( c.get() ).toBe( 'abcdefgh' )
      sources.set( states.slice( 0, 5 ) )
      expect( c.get() ).toBe( 'abcde' )
      expect([ woken( states[4] ), woken( states[5] ) ]).toEqual([ true, false ])

      sources.set( states.slice( 3 ) )
      expect( c.get() ).toBe( 'defgh' )
      expect([ woken( states[2] ), woken( states[3] ), woken( states[7] ) ]).toEqual([ false, true, true ])
    })
})

describe('errors', () => {
  // signal-polyfill tests/behaviors/errors.test.ts: are cached by computed signals
  it('are kept by a computed value, and thrown again until what it read changes', () => {
    const s = state( 'first' )
    let n = 0, n2 = 0
    const c = memo( () => { n++; throw s.get() })
    const c2 = memo( () => { n2++; return c.get() })
    expect( n ).toBe( 0 )
    expect( () => c.get() ).toThrow( 'first' )
    expect( () => c2.get() ).toThrow( 'first' )
    expect([ n, n2 ]).toEqual([ 1, 1 ])
    expect( () => c.get() ).toThrow( 'first' )
    expect( () => c2.get() ).toThrow( 'first' )
    expect([ n, n2 ]).toEqual([ 1, 1 ])
    s.set( 'second' )
    expect( () => c.get() ).toThrow( 'second' )
    expect( () => c2.get() ).toThrow( 'second' )
    expect([ n, n2 ]).toEqual([ 2, 2 ])
    s.set( 'second' )
    expect( n ).toBe( 2 )
  })

  // signal-polyfill: are cached by computed signals when watched
  it('are kept as much with an effect reading the value', () => {
    const s = state( 'first' )
    let n = 0
    const c = memo( () => { n++; throw s.get() })
    effect( () => { try { c.get() } catch {} })
    expect( n ).toBe( 1 )
    expect( () => c.get() ).toThrow( 'first' )
    expect( n ).toBe( 1 )
    s.set( 'second' )
    expect( () => c.get() ).toThrow( 'second' )
    expect( n ).toBe( 2 )
  })

  // Preact: should store thrown non-errors and recompute only after a dependency changes
  it('keeps what is thrown, an error or not', () => {
    const a = state( 0 ), spy = vi.fn()
    const c = memo( () => { a.get(); spy(); throw undefined })
    const thrown = () => { try { c.get() } catch( e ){ return { e } } }
    expect( thrown() ).toEqual({ e: undefined })
    expect( thrown() ).toEqual({ e: undefined })
    expect( spy ).toHaveBeenCalledTimes( 1 )
    a.set( 1 )
    expect( thrown() ).toEqual({ e: undefined })
    expect( spy ).toHaveBeenCalledTimes( 2 )
  })

  // signal-polyfill, ported from Preact: should not leak errors raised by dependencies
  it('what reads a value that threw can catch it, and is computed as usual', () => {
    const a = state( 0 )
    const b = memo( () => { a.get(); throw new Error('error') })
    const c = memo( () => { try { b.get() } catch { return 'ok' } })
    expect( c.get() ).toBe( 'ok' )
    a.set( 1 )
    expect( c.get() ).toBe( 'ok' )
  })

  // Preact: should keep graph consistent on errors during activation
  it('a value that throws leaves the others as they were', () => {
    const a = state( 0 ), b = memo( () => { throw new Error('fail') }), c = memo( () => a.get() )
    expect( () => b.get() ).toThrow( 'fail' )
    a.set( 1 )
    expect( c.get() ).toBe( 1 )
  })

  // Preact: should keep graph consistent on errors in computeds
  it('a value that threw is computed again, and what reads it too, once its source changes', () => {
    const a = state( 0 ), b = memo( () => { if( a.get() === 1 ) throw new Error('fail'); return a.get() })
    const c = memo( () => b.get() )
    expect( c.get() ).toBe( 0 )
    a.set( 1 )
    expect( () => b.get() ).toThrow( 'fail' )
    a.set( 2 )
    expect( c.get() ).toBe( 2 )
  })

  /**
   * Lips: the case a kept error exists for. A value that threw used to be
   * left out of date, so a later change to its source stopped at it, and
   * an effect that read it was never woken again.
   */
  it('an effect that read a value that threw is woken when its source changes', () => {
    const a = state( 0 ), b = memo( () => { if( a.get() === 1 ) throw new Error('fail'); return a.get() })
    const seen: any[] = []
    effect( () => { try { seen.push( b.get() ) } catch( e: any ){ seen.push( e.message ) } })
    a.set( 1 )
    a.set( 2 )
    expect( seen ).toEqual([ 0, 'fail', 2 ])
  })
})

describe('cycles', () => {
  // signal-polyfill tests/behaviors/cycles.test.ts; Preact: should detect simple/deep dependency cycles
  it('a value that reads itself throws', () => {
    const c: { get(): number } = memo( () => c.get() )
    expect( () => c.get() ).toThrow( 'reads itself' )
  })

  it('values that read one another throw', () => {
    const c: { get(): number } = memo( () => c2.get() )
    const c2: { get(): number } = memo( () => c.get() )
    const c3 = memo( () => c2.get() )
    expect( () => c3.get() ).toThrow()

    const a: { get(): number } = memo( () => b.get() ), b: { get(): number } = memo( () => d.get() )
    const d: { get(): number } = memo( () => a.get() )
    expect( () => a.get() ).toThrow()
  })

  // Preact: should not allow a computed signal to become a direct dependency of itself
  it('a value that catches reading itself is not its own reader', () => {
    const spy = vi.fn( () => { try { a.get() } catch {} })
    const a: { get(): void } = memo( spy )
    a.get()
    expect( () => effect( () => a.get() ) ).not.toThrow()
  })

  /**
   * Preact: should throw on cycles. Its effect writes NaN, which Lips
   * compares by Object.is and so writes once: here it counts up instead.
   * Outside a batch the effect runs again within its write, so the cycle
   * ends on the call stack; inside one, the drain gives up and says so.
   */
  it('effects that wake themselves for ever throw rather than hang', () => {
    const guard = ( fn: () => void ) => { let i = 0; return () => { if( i++ > 2e4 ) throw new Error('test failed'); fn() } }
    const a = state( 0 )
    expect( () => effect( guard( () => a.set( a.get() + 1 ) ) ) ).toThrow()

    const b = state( 0 )
    expect( () => batch( () => effect( guard( () => b.set( b.get() + 1 ) ) ) ) ).toThrow( 'a cycle' )
    // and batching is not left switched on
    const c = state( 0 ), runs = vi.fn( () => { c.get() })
    effect( runs )
    c.set( 1 )
    expect( runs ).toHaveBeenCalledTimes( 2 )
  })
})

// Preact packages/core/test/signal.test.tsx, `effect()`
describe('effect', () => {
  it('runs at once, and again when what it read changes', () => {
    const a = state( 'a' ), b = state( 'b' )
    const spy = vi.fn( () => a.get() + b.get() )
    effect( spy )
    expect( spy ).toHaveBeenCalledTimes( 1 )
    a.set( 'aa' )
    b.set( 'bb' )
    expect( spy ).toHaveBeenCalledTimes( 3 )
  })

  it('disposed, it no longer runs; disposed twice, nothing throws', () => {
    const a = state( 'a' ), spy = vi.fn( () => { a.get() })
    const { dispose } = effect( spy )
    dispose()
    expect( () => dispose() ).not.toThrow()
    a.set( 'aa' )
    expect( spy ).toHaveBeenCalledTimes( 1 )
  })

  it('reads again only the sources it read last', () => {
    const a = state( 'a' ), b = state( 'b' ), cond = state( true )
    const spy = vi.fn( () => { cond.get() ? a.get() : b.get() })
    effect( spy )
    b.set( 'bb' )
    expect( spy ).toHaveBeenCalledTimes( 1 )
    cond.set( false )
    expect( spy ).toHaveBeenCalledTimes( 2 )
    a.set( 'aaa' )
    expect( spy ).toHaveBeenCalledTimes( 2 )
  })

  // Preact: should not recompute if the effect has been notified about changes, but no direct dependency has actually changed
  it('does not run where what it read is computed again to the same value', () => {
    const s = state( 0 ), c = memo( () => { s.get(); return 0 })
    const spy = vi.fn( () => { c.get() })
    effect( spy )
    s.set( 1 )
    expect( spy ).toHaveBeenCalledTimes( 1 )
  })

  it('does not compute a value it will not read', () => {
    const spy = vi.fn(), a = state( 0 ), b = state( 0 )
    const c = memo( () => { b.get(); spy() })
    effect( () => { a.get() === 0 && c.get() })
    batch( () => { b.set( 1 ); a.set( 1 ) })
    expect( spy ).toHaveBeenCalledTimes( 1 )
  })

  it('does not compute a value a branch no longer reads', () => {
    const a = state( 1 ), b = state( 1 ), c = state( 1 )
    const spy = vi.fn( () => c.get() ), d = memo( spy )
    effect( () => { if( a.get() > 0 ){ b.get(); d.get() } else b.get() })
    spy.mockClear()
    batch( () => { a.set( 2 ); b.set( 2 ); c.set( 2 ) })
    expect( spy ).toHaveBeenCalledTimes( 1 )
    spy.mockClear()
    batch( () => { a.set( -1 ); b.set( -1 ); c.set( -1 ) })
    expect( spy ).not.toHaveBeenCalled()
  })

  // Preact: should recompute if a dependency changes during computation after becoming a dependency
  it('runs again for a write it made to what it read', () => {
    const a = state( 0 ), spy = vi.fn( () => { a.get() === 0 && a.set( 1 ) })
    effect( spy )
    expect( spy ).toHaveBeenCalledTimes( 2 )
  })

  /**
   * Preact: should batch writes. Lips differs: a write outside a batch
   * runs what it reaches when it is made, and a write an effect makes is
   * no exception. Writes that belong together go in a `batch()`.
   */
  it('runs what its own writes reach at each write, unless they are batched', () => {
    const a = state( 'a' ), spy = vi.fn( () => { a.get() })
    effect( spy )
    spy.mockClear()
    effect( () => { a.set( 'aa' ); a.set( 'aaa' ) })
    expect( spy ).toHaveBeenCalledTimes( 2 )

    spy.mockClear()
    effect( () => batch( () => { a.set( 'b' ); a.set( 'bb' ) }) )
    expect( spy ).toHaveBeenCalledTimes( 1 )
  })

  /**
   * Lips: once per change, though an effect that runs before it writes
   * what it reads. The run that write makes is the one it needed; it does
   * not run a second time for the change that woke both.
   */
  it('runs once for a change, though another it shares it with writes what it reads', () => {
    const a = state( 0 ), b = state( 0 ), seen: number[][] = []
    effect( () => { b.set( a.get() * 10 ) })
    effect( () => { seen.push([ a.get(), b.get() ]) })
    seen.length = 0
    a.set( 1 )
    expect( seen ).toEqual([ [ 1, 10 ] ])
  })

  // Preact: should allow disposing a running effect
  it('can be disposed while it runs', () => {
    const a = state( 0 ), spy = vi.fn()
    const handle = effect( () => { if( a.get() === 1 ){ handle.dispose(); spy() } })
    a.set( 1 )
    a.set( 2 )
    expect( spy ).toHaveBeenCalledTimes( 1 )
  })

  // Preact: should not run if it's first been triggered and then disposed in a batch (and triggered again)
  it('disposed in the batch that woke it, it does not run', () => {
    const a = state( 0 ), spy = vi.fn( () => { a.get() })
    const { dispose } = effect( spy )
    spy.mockClear()
    batch( () => { a.set( 1 ); dispose(); a.set( 2 ) })
    expect( spy ).not.toHaveBeenCalled()
  })

  /**
   * Preact: should not rerun an effect for a no-op batch assignment.
   * Lips differs: a batch queues what each write reaches, so a source
   * written and written back within one runs what read it once, and that
   * run reads the value as it is. Through a computed value it does not
   * run: that value is computed again and found the same.
   */
  it('a source written back within a batch runs its readers once; through a computed, not at all', () => {
    const foo = state( 42 ), double = memo( () => foo.get() * 2 )
    const direct = vi.fn( () => { foo.get() }), through = vi.fn( () => { double.get() })
    effect( direct )
    effect( through )
    batch( () => { foo.set( 0 ); foo.set( 42 ) })
    expect([ direct.mock.calls.length, through.mock.calls.length ]).toEqual([ 2, 1 ])
  })

  // Preact: should keep unsubscribed computeds coherent when they are read during a reverted batch
  it('a value read in a batch that writes its source back stays in step', () => {
    const foo = state( 'A' ), bang = memo( () => foo.get() + '!' )
    expect( bang.get() ).toBe( 'A!' )
    batch( () => {
      foo.set( 'B' )
      expect( bang.get() ).toBe( 'B!' )
      foo.set( 'A' )
    })
    foo.set( 'C' )
    expect( bang.get() ).toBe( 'C!' )
  })

  /**
   * Preact: should not rerun parent effect if a nested child effect's
   * signal's value changes. An effect made inside another is its own: it
   * is not disposed when the outer one runs again (Lips's runtime
   * disposes what it made itself, block by block).
   */
  it('an effect made inside another does not wake the outer one', () => {
    const parentSignal = state( 0 ), childSignal = state( 0 )
    const parentEffect = vi.fn( () => { parentSignal.get() }), childEffect = vi.fn( () => { childSignal.get() })
    effect( () => { parentEffect(); effect( childEffect ) })
    childSignal.set( 1 )
    expect([ parentEffect.mock.calls.length, childEffect.mock.calls.length ]).toEqual([ 1, 2 ])
    parentSignal.set( 1 )
    expect([ parentEffect.mock.calls.length, childEffect.mock.calls.length ]).toEqual([ 2, 3 ])
  })

  /**
   * Preact's cleanup cases (should call the cleanup callback before the
   * next run, …) do not apply: a Lips effect returns nothing to clean up
   * with. What an effect made is disposed by what made it.
   */
})

describe('glitches', () => {
  /**
   * Lips 0.6.2: a `<let>` was a source its own effect set, so an effect
   * that read it and what it was computed from, waking first, read it
   * stale. A computed value is never read as it was before the change.
   */
  it('an effect reading a source and a value computed from it sees them in step', () => {
    const n = state( 1 ), double = memo( () => n.get() * 2 ), seen: string[] = []
    effect( () => { seen.push( n.get() + ':' + double.get() ) })
    n.set( 2 )
    batch( () => { n.set( 3 ); n.set( 4 ) })
    expect( seen ).toEqual([ '1:2', '2:4', '4:8' ])
  })

  it('an effect at the bottom of a diamond runs once, and sees both sides in step', () => {
    const x = state( 1 ), a = memo( () => x.get() + 1 ), b = memo( () => x.get() * 10 ), seen: number[][] = []
    effect( () => { seen.push([ a.get(), b.get() ]) })
    x.set( 2 )
    expect( seen ).toEqual([ [ 2, 10 ], [ 3, 20 ] ])
  })

  it('a value read before and after a write in the same effect is the value as it is', () => {
    const s = state( 1 ), c = memo( () => s.get() * 2 ), seen: number[] = []
    effect( () => { seen.push( c.get() ); untrack( () => s.get() ) === 1 && s.set( 5 ); seen.push( c.get() ) })
    expect( seen.slice( 0, 2 ) ).toEqual([ 2, 10 ])
  })
})

// Preact packages/core/test/signal.test.tsx, `batch/transaction`
describe('batch', () => {
  it('returns what its callback returns, and throws what it throws', () => {
    expect( batch( () => 1 ) ).toBe( 1 )
    expect( () => batch( () => { throw new Error('hello') }) ).toThrow( 'hello' )
    expect( () => batch( () => { throw undefined }) ).toThrow()
  })

  it('delays what writes reach until the outermost batch is done', () => {
    const a = state( 'a' ), b = state( 'b' )
    const spy = vi.fn( () => { a.get(); b.get() })
    effect( spy )
    spy.mockClear()
    batch( () => {
      a.set( 'aa' )
      batch( () => b.set( 'bb' ) )
      expect( spy ).not.toHaveBeenCalled()
    })
    expect( spy ).toHaveBeenCalledTimes( 1 )
  })

  it('reads what was written in it, sources and computed values both', () => {
    const a = state( 'a' ), b = memo( () => a.get() )
    const spyC = vi.fn( () => b.get() ), c = memo( spyC )
    const spyD = vi.fn( () => c.get() ), d = memo( spyD )
    const spyE = vi.fn( () => d.get() ), e = memo( spyE )
    let result = ''
    batch( () => {
      a.set( 'aa' )
      result = c.get()
      // d is not read in the batch, so not computed in it
      expect( spyD ).not.toHaveBeenCalled()
    })
    expect([ result, d.get(), e.get() ]).toEqual([ 'aa', 'aa', 'aa' ])
    expect([ spyC, spyD, spyE ].map( s => s.mock.calls.length ) ).toEqual([ 1, 1, 1 ])
  })

  it('does not block writes after it', () => {
    const a = state( 'a' ), b = state( 'b' ), c = state( 'c' )
    const d = memo( () => a.get() + ' ' + b.get() + ' ' + c.get() )
    let result = ''
    effect( () => { result = d.get() })
    batch( () => { a.set( 'aa' ); b.set( 'bb' ) })
    c.set( 'cc' )
    expect( result ).toBe( 'aa bb cc' )
  })

  it('does not leave a value stale that was read in it, tracked or not', () => {
    for( const peek of [ false, true ] ){
      const invokes: number[][] = [], counter = state( 0 )
      const double = memo( () => counter.get() * 2 ), triple = memo( () => counter.get() * 3 )
      effect( () => { invokes.push([ double.get(), triple.get() ]) })
      batch( () => {
        counter.set( 1 )
        expect( peek ? untrack( double.get ) : double.get() ).toBe( 2 )
      })
      expect( invokes ).toEqual([ [ 0, 0 ], [ 2, 3 ] ])
    }
  })

  it('runs what it reached though its callback throws', () => {
    const a = state( 0 ), b = state( 1 )
    const spy1 = vi.fn( () => { a.get() }), spy2 = vi.fn( () => { b.get() })
    effect( spy1 )
    effect( spy2 )
    expect( () => batch( () => { a.set( 1 ); b.set( 2 ); throw new Error('hello') }) ).toThrow( 'hello' )
    expect([ spy1.mock.calls.length, spy2.mock.calls.length ]).toEqual([ 2, 2 ])
  })

  it('runs every effect it reached though some throw, then throws the first error', () => {
    const a = state( 0 )
    const thrower = ( n: number ) => () => { if( a.get() === 1 ) throw new Error( 'hello ' + n ) }
    const spy1 = vi.fn( () => { a.get() }), spy2 = vi.fn( () => { a.get() })
    effect( thrower( 1 ) ); effect( spy1 ); effect( thrower( 2 ) ); effect( spy2 ); effect( thrower( 3 ) )
    expect( () => batch( () => a.set( 1 ) ) ).toThrow( 'hello 1' )
    expect([ spy1.mock.calls.length, spy2.mock.calls.length ]).toEqual([ 2, 2 ])

    // Lips: and so does a write outside a batch
    expect( () => a.set( 2 ) ).not.toThrow()
    expect( () => a.set( 1 ) ).toThrow( 'hello 1' )
    expect([ spy1.mock.calls.length, spy2.mock.calls.length ]).toEqual([ 4, 4 ])
  })

  it('runs an effect made in it at once', () => {
    const spy = vi.fn()
    let calls = 0
    batch( () => { effect( spy ); calls = spy.mock.calls.length })
    expect( calls ).toBe( 1 )
  })
})

describe('untrack', () => {
  // signal-polyfill tests/Signal/subtle/untrack.test.ts
  it('reads in a computed value without subscribing it', () => {
    const s = state( 1 ), c = memo( () => untrack( () => s.get() ) ), d = memo( () => s.get() )
    expect([ c.get(), d.get() ]).toEqual([ 1, 1 ])
    s.set( 2 )
    expect([ c.get(), d.get() ]).toEqual([ 1, 2 ])
  })

  // Preact: should block tracking inside effects / even when run inside effect run inside untracked
  it('reads in an effect without subscribing it, where the effect was made too', () => {
    const a = state( 1 ), b = state( 2 )
    const spy = vi.fn( () => { a.get() + b.get() })
    effect( () => untrack( spy ) )
    untrack( () => effect( () => untrack( spy ) ) )
    a.set( 10 )
    b.set( 20 )
    expect( spy ).toHaveBeenCalledTimes( 2 )
  })

  // Preact: should not cause signal assignments throw
  it('may write what it reads', () => {
    const a = state( 1 ), changed = state( 0 )
    const { dispose } = effect( () => { a.get(); untrack( () => changed.set( changed.get() + 1 ) ) })
    expect( () => a.set( 2 ) ).not.toThrow()
    expect( changed.get() ).toBe( 2 )
    a.set( 3 )
    expect( changed.get() ).toBe( 3 )
    dispose()
  })

  // Preact: should block tracking inside computed signals
  it('in a computed value, keeps it from being computed again', () => {
    const a = state( 1 ), b = state( 2 ), spy = vi.fn( () => a.get() + b.get() )
    const c = memo( () => untrack( spy ) )
    expect( c.get() ).toBe( 3 )
    a.set( 10 ); c.get()
    b.set( 20 ); c.get()
    expect( spy ).toHaveBeenCalledTimes( 1 )
  })
})
