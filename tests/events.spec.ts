import { describe, it, expect, vi } from 'vitest'
import Events from '../src/events'
import Lips from '../src/lips'

describe('Events', () => {
  it('invokes registered listeners with emitted params', () => {
    const e = new Events()
    const spy = vi.fn()

    e.on('ping', spy)
    e.emit('ping', 1, 'two')

    expect( spy ).toHaveBeenCalledWith( 1, 'two' )
  })

  it('off(event, fn) removes only that listener', () => {
    const e = new Events()
    const keep = vi.fn()
    const drop = vi.fn()

    e.on('x', keep)
    e.on('x', drop)
    e.off('x', drop)
    e.emit('x')

    expect( keep ).toHaveBeenCalledTimes( 1 )
    expect( drop ).not.toHaveBeenCalled()
  })

  it('off(event) removes all listeners of the event', () => {
    const e = new Events()
    const a = vi.fn()
    const b = vi.fn()

    e.on('x', a)
    e.once('x', b)
    e.off('x')
    e.emit('x')

    expect( a ).not.toHaveBeenCalled()
    expect( b ).not.toHaveBeenCalled()
  })

  it('once listeners fire a single time', () => {
    const e = new Events()
    const spy = vi.fn()

    e.once('tick', spy)
    e.emit('tick')
    e.emit('tick')

    expect( spy ).toHaveBeenCalledTimes( 1 )
  })

  it('emits null/undefined params without crashing', () => {
    const e = new Events()
    const spy = vi.fn()

    e.on('n', spy)
    expect( () => e.emit('n', null, undefined, 0 ) ).not.toThrow()
    expect( spy ).toHaveBeenCalledWith( null, undefined, 0 )
  })

  it('does not mutate emitted plain objects', () => {
    const e = new Events()
    const payload = { nested: { toJSON: () => ({ unwrapped: true }) } }

    let received: any
    e.on('data', p => received = p)
    e.emit('data', payload)

    // Listener sees the unwrapped clone…
    expect( received.nested ).toEqual({ unwrapped: true })
    // …the original argument is untouched
    expect( typeof payload.nested.toJSON ).toBe('function')
  })

  it('passes class instances through by identity', () => {
    const e = new Events()
    const error = new Error('boom')

    let received: any
    e.on('err', p => received = p)
    e.emit('err', error)

    expect( received ).toBe( error )
  })
})

describe('the component bus is bidirectional', () => {
  const build = ( seen: string[] ) => {
    const lips = new Lips()
    const c = lips.render('bus', {
      state: { n: 0 },
      default: `<i class="a">{state.n}</i>`,
      handler: {
        onCreate( this: any ){
          this.on('reset', () => { seen.push('inside'); this.state.n = 0 })
          this.on('bump', ( by: number ) => seen.push(`inside:${by}`) )
          this.on('save', () => this.emit('saved', { id: 1 }) )
        },

      }
    })
    c.appendTo( document.body )
    return c
  }

  it('round trip: a command in, an event out', () => {
    /**
     * The shape this unlocks — the holder sends a command, the component
     * answers on the same bus. No state mutation, no internals touched.
     */
    const seen: string[] = []
    const c = build( seen )
    c.on('saved', ( payload: any ) => seen.push(`outside:${payload.id}`) )

    c.emit('save')

    expect( seen ).toEqual([ 'outside:1' ])
  })

  it('inward: an external emit reaches a listener registered inside', () => {
    const seen: string[] = []
    const c = build( seen )

    c.emit('reset')

    expect( seen ).toEqual([ 'inside' ])
    expect( c.state.n ).toBe( 0 )
  })

  it('carries arguments inward', () => {
    const seen: string[] = []
    const c = build( seen )

    c.emit('bump', 3 )

    expect( seen ).toEqual([ 'inside:3' ])
  })

  it('does NOT deliver an internal emit to the local bus twice', () => {
    /**
     * The failure mode this override invites: an internal `this.emit`
     * already drives the local bus, so if it also routed through the
     * facade's emit the component would hear itself twice.
     */
    const seen: string[] = []
    const lips = new Lips()
    const c = lips.render('echo', {
      default: `<i/>`,
      handler: {
        onCreate( this: any ){
          this.on('ping', () => seen.push('local') )
          this.on('fire', () => this.emit('ping') )
        }
      }
    })
    c.appendTo( document.body )
    c.on('ping', () => seen.push('external') )

    c.emit('fire')

    // 'fire' has no external listener; 'ping' hits local then external — once each
    expect( seen ).toEqual([ 'local', 'external' ])
  })

  it('reaches both buses from outside, in one call', () => {
    const seen: string[] = []
    const c = build( seen )
    c.on('reset', () => seen.push('outside') )

    c.emit('reset')

    expect( seen ).toEqual([ 'inside', 'outside' ])
  })

  it('is inert for an event nobody listens to', () => {
    const seen: string[] = []
    const c = build( seen )

    expect( () => c.emit('nobody-home') ).not.toThrow()
    expect( seen ).toEqual([])
  })

  it('survives destroy without throwing', () => {
    const seen: string[] = []
    const c = build( seen )
    c.destroy()

    expect( () => c.emit('reset') ).not.toThrow()
  })
})
