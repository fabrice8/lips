import { describe, it, expect, vi } from 'vitest'
import { signal, effect, batch, memo } from '../src/signal'

describe('signal', () => {
  it('reads the initial value', () => {
    const [ read ] = signal( 10 )
    expect( read() ).toBe( 10 )
  })

  it('writes and reads back a new value', () => {
    const [ read, write ] = signal( 1 )
    write( 2 )
    expect( read() ).toBe( 2 )
  })

  it('skips notification when value is unchanged (Object.is)', () => {
    const [ read, write ] = signal( 5 )
    const spy = vi.fn( () => read() )

    effect( spy )
    expect( spy ).toHaveBeenCalledTimes( 1 )

    write( 5 )
    expect( spy ).toHaveBeenCalledTimes( 1 )
  })

  it('supports undo/redo history', () => {
    const [ read, write, history ] = signal( 'a' )
    write('b')
    write('c')

    expect( history.canUndo() ).toBe( true )
    history.undo()
    expect( read() ).toBe('b')
    history.undo()
    expect( read() ).toBe('a')
    expect( history.canUndo() ).toBe( false )

    history.redo()
    expect( read() ).toBe('b')
  })

  it('drops redo branch after a write mid-history', () => {
    const [ read, write, history ] = signal( 1 )
    write( 2 )
    write( 3 )
    history.undo()          // back to 2
    write( 99 )             // new branch

    expect( read() ).toBe( 99 )
    expect( history.canRedo() ).toBe( false )
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
    const [ a, setA ] = signal( 'a' )
    const [ , setB ] = signal( 'b' )
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

    expect( spy ).toHaveBeenCalledTimes( 2 ) // initial + first write only
  })

  it('re-tracks dependencies on every run (dynamic deps)', () => {
    const [ cond, setCond ] = signal( true )
    const [ a, setA ] = signal('a')
    const [ b, setB ] = signal('b')
    const seen: string[] = []

    effect( () => { seen.push( cond() ? a() : b() ) } )

    setCond( false )     // now depends on b
    setA('a2')           // must NOT re-run
    setB('b2')           // must re-run

    expect( seen ).toEqual([ 'a', 'b', 'b2' ])
  })
})

describe('batch', () => {
  it('coalesces multiple writes into one effect run', () => {
    const [ a, setA ] = signal( 0 )
    const [ b, setB ] = signal( 0 )
    const spy = vi.fn( () => a() + b() )

    effect( spy )
    expect( spy ).toHaveBeenCalledTimes( 1 )

    batch( () => {
      setA( 1 )
      setB( 2 )
    })

    expect( spy ).toHaveBeenCalledTimes( 2 ) // one flush, not two
    expect( a() + b() ).toBe( 3 )
  })

  it('returns the callback result', () => {
    expect( batch( () => 42 ) ).toBe( 42 )
  })
})

describe('memo', () => {
  it('derives and updates a computed value', () => {
    const [ count, setCount ] = signal( 2 )
    const [ doubled ] = memo( () => count() * 2 )

    expect( doubled() ).toBe( 4 )
    setCount( 5 )
    expect( doubled() ).toBe( 10 )
  })
})
