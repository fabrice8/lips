/**
 * The public surface no other spec held on the DOM: the Lips instance's
 * own methods (dispose, watchContext, unregister, debug), event modifiers,
 * element references, the lifecycle events on a component's bus, and
 * focus across a swap.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Lips from '../src/lips'
import { compileTemplate } from '../src/ir/compiler'

const turn = () => new Promise( r => setTimeout( r, 0 ) )
const q = ( s: string ) => document.querySelector( s ) as any

let lips: any
beforeEach( () => {
  document.body.innerHTML = '<div id="app"></div>'
  lips = new Lips()
})

describe('the Lips instance', () => {
  it('dispose() destroys the root that root() rendered', () => {
    const onDestroy = vi.fn()
    lips.root({ handler: { onDestroy }, default: '<p id="r">r</p>' }, '#app')
    expect( q('#r') ).toBeTruthy()

    lips.dispose()
    expect( onDestroy ).toHaveBeenCalledTimes( 1 )
    expect( q('#r') ).toBeNull()
  })

  it('watchContext() runs on a change of a listed field only, until stopped', () => {
    lips.setContext({ theme: 'light', user: 'a' })
    const fn = vi.fn()
    const stop = lips.watchContext([ 'theme' ], fn )

    lips.setContext('user', 'b')
    expect( fn ).not.toHaveBeenCalled()
    lips.setContext('theme', 'dark')
    expect( fn ).toHaveBeenCalledTimes( 1 )

    stop()
    lips.setContext('theme', 'light')
    expect( fn ).toHaveBeenCalledTimes( 1 )
  })

  it('unregister() removes a name: a tag rendered after it is an element', () => {
    lips.register('x-card', { default: '<b>card</b>' })
    expect( lips.has('x-card') ).toBe( true )

    lips.unregister('x-card')
    expect( lips.has('x-card') ).toBe( false )
    lips.render('api-unreg', { default: '<x-card></x-card>' }).appendTo('#app')
    expect( q('x-card') ).toBeTruthy()
    expect( q('b') ).toBeNull()
  })

  it('debug: a stable key no dictionary answers is warned about', () => {
    const warn = vi.spyOn( console, 'warn' ).mockImplementation( () => {} )
    const loud = new Lips({ debug: true, lang: 'fr' })
    loud.i18n.setDictionary('fr', {})
    loud.render('api-debug', { default: '<h1 i18n="hero.title">Welcome</h1>' }).appendTo('#app')

    expect( warn.mock.calls.some( c => String( c[ 0 ] ).includes('hero.title') ) ).toBe( true )
    warn.mockRestore()
  })
})

describe('event modifiers on the DOM', () => {
  it('.stop keeps the event from the elements above', () => {
    const row = vi.fn(), remove = vi.fn()
    lips.render('api-stop', { handler: { row, remove }, default: '<div class="row" on-click(row)><button on-click.stop(remove)>×</button></div>' }).appendTo('#app')

    q('button').click()
    expect( remove ).toHaveBeenCalledTimes( 1 )
    expect( row ).not.toHaveBeenCalled()
  })

  it('.capture has it on the way down, before its target', () => {
    const order: string[] = []
    lips.render('api-capture', {
      handler: { outer(){ order.push('outer') }, inner(){ order.push('inner') } },
      default: '<div on-click.capture(outer)><button on-click(inner)>b</button></div>'
    }).appendTo('#app')

    q('button').click()
    expect( order ).toEqual([ 'outer', 'inner' ])
  })

  it('.outside runs for a click anywhere but inside, even one a .stop hides', () => {
    const dismiss = vi.fn()
    document.body.insertAdjacentHTML('beforeend', '<span id="away"></span>')
    lips.render('api-outside', {
      handler: { dismiss, swallow(){} },
      default: '<div class="menu" on-click.outside(dismiss)><b>in</b></div><i on-click.stop(swallow)>x</i>'
    }).appendTo('#app')

    q('.menu b').click()
    expect( dismiss ).not.toHaveBeenCalled()
    q('#away').click()
    q('i').click()
    expect( dismiss ).toHaveBeenCalledTimes( 2 )
  })

  it('.capture.stop combine', () => {
    const outer = vi.fn(), inner = vi.fn()
    lips.render('api-both', { handler: { outer, inner }, default: '<div on-click.capture.stop(outer)><button on-click(inner)>b</button></div>' }).appendTo('#app')

    q('button').click()
    expect( outer ).toHaveBeenCalledTimes( 1 )
    expect( inner ).not.toHaveBeenCalled()
  })
})

describe('@ref', () => {
  it('names the element on this.refs while it lives, under the name it has now', async () => {
    let self: any
    const c = lips.render('api-ref', {
      state: { on: true, name: 'search' },
      handler: { onCreate(){ self = this } },
      default: '<if( state.on )><input @ref=state.name/></if>'
    }).appendTo('#app')

    expect( self.refs.search ).toBe( q('input') )

    c.state.name = 'query'
    await turn()
    expect( self.refs.search ).toBeUndefined()
    expect( self.refs.query ).toBe( q('input') )

    c.state.on = false
    await turn()
    expect( self.refs.query ).toBeUndefined()
  })

  it('names a tag no component claims, too', () => {
    let self: any
    lips.render('api-ref-el', { handler: { onCreate(){ self = this } }, default: '<scroll-view @ref="pane"></scroll-view>' }).appendTo('#app')
    expect( self.refs.pane ).toBe( q('scroll-view') )
  })
})

describe('the lifecycle on the component\'s bus', () => {
  const EVENTS = [ 'component:mount', 'component:attached', 'component:detached', 'component:destroy' ]
  const listener = ( seen: string[] ) => ({ onCreate( this: any ){ for( const e of EVENTS ) this.on( e, () => seen.push( e ) ) } })

  it('a root, in order', () => {
    const seen: string[] = []
    lips.render('api-bus-root', { handler: listener( seen ), default: '<p/>' }).appendTo('#app').destroy()
    expect( seen ).toEqual( EVENTS )
  })

  it('a nested component, in order', () => {
    const seen: string[] = []
    lips.register('api-bus-kid', { handler: listener( seen ), default: '<p/>' })
    lips.render('api-bus-host', { default: '<div><api-bus-kid/></div>' }).appendTo('#app').destroy()
    expect( seen ).toEqual( EVENTS )
  })

  it('the handle\'s once() hears one emission', () => {
    const c = lips.render('api-once', { default: '<p/>' })
    const fn = vi.fn()
    c.once('ping', fn )
    c.emit('ping', 1 )
    c.emit('ping', 2 )
    expect( fn.mock.calls ).toEqual([ [ 1 ] ])
  })
})

describe('swap() keeps focus', () => {
  it('a focused input moved by a salvage pass has focus again after', () => {
    lips.register('api-field', { default: '<input class="f"/>' })
    const c = lips.render('api-swap', { default: '<div class="a"><api-field/></div>' }).appendTo('#app')

    const input = q('input.f') as HTMLInputElement
    input.focus()
    expect( document.activeElement ).toBe( input )

    const report = c.swap( compileTemplate('<section class="b"><api-field/></section>').ir )
    expect( report.salvaged ).toEqual([ 'api-field' ])
    expect( q('input.f') ).toBe( input )
    expect( document.activeElement ).toBe( input )
  })
})
