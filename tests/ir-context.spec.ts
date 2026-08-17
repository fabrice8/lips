/**
 * Scoped context — `<context …>` (RFC-005 §4).
 *
 * The thing under test is a layer, not a store: a provided key shadows
 * the global one for the subtree, an unprovided key must keep falling
 * through AND stay reactive, and the nearest provider wins.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import Lips from '../src/lips'
import { compileTemplate } from '../src/ir/compiler'

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
const txt = ( sel: string ) => q( sel )?.textContent

let lips: any
beforeEach( () => {
  document.body.innerHTML = '<div id="app"></div>'
  lips = new Lips({ context: { theme: 'light', user: 'ada' } })
})

describe('<context> scoping', () => {
  it('shadows a global key for its subtree only', async () => {
    lips.render('t-shadow', {
      default: `<div>
        <b class="out">{context.theme}</b>
        <context theme="dark"><i class="in">{context.theme}</i></context>
      </div>`
    }).appendTo('#app')

    await settle( () => !!txt('.in') )

    expect( txt('.out') ).toBe('light')
    expect( txt('.in') ).toBe('dark')
  })

  it('leaves unprovided keys falling through to the global store', async () => {
    lips.render('t-fallthrough', {
      default: `<context theme="dark"><b class="u">{context.user}</b></context>`
    }).appendTo('#app')

    await settle( () => txt('.u') === 'ada' )
  })

  it('keeps fall-through keys REACTIVE inside the layer', async () => {
    lips.render('t-live', {
      default: `<context theme="dark"><b class="u">{context.user}</b></context>`
    }).appendTo('#app')

    await settle( () => txt('.u') === 'ada' )

    lips.setContext('user', 'grace')
    await settle( () => txt('.u') === 'grace' )
  })

  it('tracks a provided value that comes from state', async () => {
    const c = lips.render('t-reactive', {
      state: { tone: 'dark' },
      default: `<context theme=state.tone><b class="t">{context.theme}</b></context>`
    })
    c.appendTo('#app')

    await settle( () => txt('.t') === 'dark' )

    c.state.tone = 'solarized'
    await settle( () => txt('.t') === 'solarized' )
  })

  it('gives the nearest provider precedence when nested', async () => {
    lips.render('t-nested', {
      default: `<context theme="dark">
        <b class="mid">{context.theme}</b>
        <context theme="contrast"><i class="deep">{context.theme}</i></context>
      </context>`
    }).appendTo('#app')

    await settle( () => !!txt('.deep') )

    expect( txt('.mid') ).toBe('dark')
    expect( txt('.deep') ).toBe('contrast')
  })

  it('inherits an outer provision through an inner one', async () => {
    lips.render('t-chain', {
      default: `<context theme="dark">
        <context user="lovelace"><b class="b">{context.theme}/{context.user}</b></context>
      </context>`
    }).appendTo('#app')

    await settle( () => txt('.b') === 'dark/lovelace' )
  })

  it('reaches a child COMPONENT without threading inputs', async () => {
    lips.register('badge', { default: `<em class="badge">{context.theme}</em>` })

    lips.render('t-comp', {
      default: `<div>
        <badge/>
        <context theme="dark"><badge/></context>
      </div>`
    }).appendTo('#app')

    await settle( () => document.querySelectorAll('.badge').length === 2 )

    const seen = [ ...document.querySelectorAll('.badge') ].map( e => e.textContent )
    expect( seen ).toEqual([ 'light', 'dark' ])
  })

  it('gives each sibling subtree its own value', async () => {
    // The Modela shape: two canvases, one selection key, no collision
    lips.register('board', { default: `<u class="c">{context.selection}</u>` })

    lips.render('t-siblings', {
      default: `<div>
        <context selection="node-a"><board/></context>
        <context selection="node-b"><board/></context>
      </div>`
    }).appendTo('#app')

    await settle( () => document.querySelectorAll('.c').length === 2 )

    expect( [ ...document.querySelectorAll('.c') ].map( e => e.textContent ) )
      .toEqual([ 'node-a', 'node-b' ])
  })

  it('does not leak the provision into a sibling that follows it', async () => {
    lips.render('t-leak', {
      default: `<div>
        <context theme="dark"><i>x</i></context>
        <b class="after">{context.theme}</b>
      </div>`
    }).appendTo('#app')

    await settle( () => txt('.after') === 'light' )
  })

  it('emits no DOM element of its own', async () => {
    lips.render('t-transparent', {
      default: `<div class="w"><context theme="dark"><i>x</i></context></div>`
    }).appendTo('#app')

    await settle( () => !!q('.w i') )

    expect( document.querySelector('context') ).toBe( null )
  })
})

describe('<context> diagnostics', () => {
  it('rejects a spread — provided keys must be known at compile time', () => {
    const { diagnostics } = compileTemplate(`<context ...state.all><i>x</i></context>`)
    expect( diagnostics.some( d => d.code === 'LIPS-C016' ) ).toBe( true )
  })

  it('warns when it provides nothing', () => {
    const { diagnostics } = compileTemplate(`<context><i>x</i></context>`)
    expect( diagnostics.some( d => d.code === 'LIPS-C017' ) ).toBe( true )
  })
})
