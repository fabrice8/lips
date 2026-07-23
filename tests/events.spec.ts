import { describe, it, expect, vi } from 'vitest'
import Events from '../src/events'

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
