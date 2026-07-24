import { describe, it, expect, beforeEach } from 'vitest'
import Lips from '../src/lips'

/**
 * Scoped component stylesheets. jsdom does not run the CSS cascade, so
 * these assert the WIRING that makes scoping work — `rel` stamped on
 * component roots and an injected `[rel="<nsp>"]` sheet that matches it,
 * plus reference-counted cleanup. Actual style application is verified
 * in the browser (bench/smoke.html).
 */
function settle( check: () => boolean, timeout = 3000 ){
  return new Promise<void>( ( resolve, reject ) => {
    const t0 = Date.now()
    ;( function tick(){
      let ok = false
      try { ok = check() } catch( e ){ /* keep polling */ }
      if( ok ) return resolve()
      if( Date.now() - t0 > timeout ) return reject( new Error('settle timeout') )
      setTimeout( tick, 4 )
    } )()
  })
}
const q = ( sel: string ) => document.querySelector( sel )
const styleFor = ( nsp: string ) => document.head.querySelector<HTMLStyleElement>(`style[rel="${nsp}"]`)

let lips: any
beforeEach( () => {
  document.body.innerHTML = '<div id="app"></div>'
  document.head.querySelectorAll('style[rel]').forEach( s => s.remove() )
  lips = new Lips()
})

describe('scoped stylesheets', () => {
  it('stamps rel on the root and injects a matching scoped sheet', async () => {
    const c = lips.render('card', {
      default: `<div class="card"><b class="title">hi</b></div>`,
      stylesheet: `.title { color: red; }`
    })
    c.appendTo('#app')

    await settle( () => !!styleFor('card') )

    // root carries the scope marker the sheet selects on
    expect( q('.card')?.getAttribute('rel') ).toBe('card')

    // injected sheet is scoped to [rel="card"]
    const css = styleFor('card')!.textContent || ''
    expect( css ).toContain('[rel="card"]')
    expect( css ).toContain('.title')
  })

  it('injects a nested registered component’s own scoped sheet', async () => {
    lips.register('chip', {
      default: `<em class="chip">{input.label}</em>`,
      stylesheet: `.chip { font-weight: bold; }`
    })

    lips.render('host', { default: `<div><chip label="x"/></div>` }).appendTo('#app')

    await settle( () => !!styleFor('chip') )
    expect( q('.chip')?.getAttribute('rel') ).toBe('chip')
    expect( styleFor('chip')!.textContent ).toContain('[rel="chip"]')
  })

  it('reference-counts shared sheets across instances', async () => {
    lips.register('tag', {
      default: `<em class="tag">t</em>`,
      stylesheet: `.tag { color: green; }`
    })

    const c = lips.render('multi', {
      state: { items: [ 1, 2 ] },
      default: `<div><for [i] in=state.items><tag/></for></div>`
    })
    c.appendTo('#app')

    await settle( () => document.querySelectorAll('.tag').length === 2 )

    // one shared <style>, refcount at 1 (two instances → dindex 0→1)
    expect( document.head.querySelectorAll('style[rel="tag"]') ).toHaveLength( 1 )
    expect( styleFor('tag')?.getAttribute('dindex') ).toBe('1')

    // drop to one instance → sheet stays
    c.state.items = [ 1 ]
    await settle( () => document.querySelectorAll('.tag').length === 1 )
    expect( styleFor('tag') ).not.toBeNull()

    // drop to none → sheet removed
    c.state.items = []
    await settle( () => document.querySelectorAll('.tag').length === 0 )
    expect( styleFor('tag') ).toBeNull()
  })

  it('removes the sheet when the root component is destroyed', async () => {
    const c = lips.render('leaf', {
      default: `<div class="leaf">x</div>`,
      stylesheet: `.leaf { color: blue; }`
    })
    c.appendTo('#app')
    await settle( () => !!styleFor('leaf') )

    c.destroy()
    await settle( () => styleFor('leaf') === null )
  })

  it('does not stamp rel when the component has no stylesheet', async () => {
    lips.render('plain', { default: `<div class="plain">x</div>` }).appendTo('#app')
    await settle( () => !!q('.plain') )
    expect( q('.plain')?.hasAttribute('rel') ).toBe( false )
  })
})
