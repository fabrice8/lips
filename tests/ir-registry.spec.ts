/**
 * The registry: what a name may be (`register`) and what a plugin
 * installs (`use`).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import Lips from '../src/lips'
import type { Plugin } from '../src/types'

const settle = ( check: () => boolean, timeout = 2000 ) => new Promise<void>( ( res, rej ) => {
  const t0 = Date.now()
  ;( function tick(){
    let ok = false
    try { ok = check() } catch {}
    if( ok ) return res()
    if( Date.now() - t0 > timeout ) return rej( new Error('settle timeout') )
    setTimeout( tick, 4 )
  })()
})
const q = ( s: string ) => document.querySelector( s )

let lips: any
beforeEach( () => {
  document.body.innerHTML = '<div id="app"></div>'
  lips = new Lips()
})

describe('register: a name the compiler reads as something else is refused', () => {
  it('an HTML element, in any case, an SVG element, a syntax tag', () => {
    for( const name of [ 'menu', 'Dialog', 'nav', 'circle', 'if', 'case', 'context', 'macro' ] )
      expect( () => lips.register( name, { default: '<p>x</p>' }), name ).toThrow( new RegExp(`<${name}> is an? `) )
    expect( lips.has('menu') ).toBe( false )
  })

  it('says why', () => {
    expect( () => lips.register( 'menu', { default: '<p>x</p>' }) ).toThrow('<menu> is an HTML or SVG element: the compiler reads the tag as one, so a component of that name never renders')
    expect( () => lips.register( 'for', { default: '<p>x</p>' }) ).toThrow('<for> is a template syntax tag')
  })


  it('any other name is a component', () => {
    expect( () => lips.register( 'popover-menu', { default: '<p>x</p>' }) ).not.toThrow()
    expect( () => lips.register( 'card', { default: '<p>x</p>' }) ).not.toThrow()
  })
})

describe('use: a plugin installs what it requires, its components and its setup', () => {
  const base: Plugin = { name: 'base', components: { 'x-base': { default: `<i class="base">{input.v}</i>` } } }
  const top: Plugin<{ tone: string }> = {
    name: 'top',
    requires: [ base ],
    components: { 'x-top': { default: `<b class="top"><x-base v="from top"/></b>` } },
    install( l, options ){ l.setContext( 'tone', options?.tone ) }
  }

  it('installs what it requires first, then its components, then runs its setup with the options', async () => {
    lips.use( top, { tone: 'warm' })
    expect( lips.has('x-base') && lips.has('x-top') ).toBe( true )
    expect( lips.getContext().tone ).toBe('warm')
    lips.render( 'app', { default: `<x-top/>` }).appendTo('#app')
    await settle( () => !!q('.top .base') )
    expect( q('.base')!.textContent ).toBe('from top')
  })

  it('once: used again, or required by another, it does nothing', () => {
    let runs = 0
    const once: Plugin = { name: 'once', install(){ runs++ } }
    const a: Plugin = { name: 'a', requires: [ once ] }
    const b: Plugin = { name: 'b', requires: [ once ] }
    lips.use( once ).use( a ).use( b ).use( once )
    expect( runs ).toBe( 1 )
  })

  it('ends a cycle', () => {
    const a: any = { name: 'a', components: { 'x-a': { default: '<p>a</p>' } } }
    const b: any = { name: 'b', requires: [ a ], components: { 'x-b': { default: '<p>b</p>' } } }
    a.requires = [ b ]
    expect( () => lips.use( a ) ).not.toThrow()
    expect( lips.has('x-a') && lips.has('x-b') ).toBe( true )
  })

  it('refuses another plugin of the same name', () => {
    lips.use( base )
    expect( () => lips.use({ name: 'base' }) ).toThrow('two plugins named <base>')
  })

  it('refuses a component name something else holds, and not one it holds itself', () => {
    lips.register( 'x-base', { default: '<p>mine</p>' })
    expect( () => lips.use( base ) ).toThrow('<x-base> of plugin <base> is registered already, by something else')

    const again = new Lips()
    again.register( 'x-base', base.components![ 'x-base' ] )
    expect( () => again.use( base ) ).not.toThrow()
  })

  it('returns the Lips, to chain', () => {
    expect( lips.use( base ) ).toBe( lips )
  })
})
