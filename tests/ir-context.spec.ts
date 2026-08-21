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

describe('context ownership', () => {
  /**
   * A layer that can only be READ is half a provider. These cover the
   * write half: `setContext` from inside a subtree lands on the nearest
   * layer that declares the key, and dies with it.
   */
  it('writes to the nearest layer, not the global store', async () => {
    lips.register('writer', {
      handler: { bump( this: any ){ this.setContext('selection', 'local') } },
      default: `<div><u class="v">{context.selection}</u><button class="b" on-click( bump )>x</button></div>`
    })

    lips.render('t-own', {
      default: `<div>
        <b class="g">{context.selection}</b>
        <context selection="node-a"><writer/></context>
      </div>`
    }).appendTo('#app')

    await settle( () => txt('.v') === 'node-a' )
    ;( q('.b') as HTMLElement ).click()

    await settle( () => txt('.v') === 'local' )
    // the global store never saw it
    expect( lips.getContext().selection ).toBe( undefined )
    expect( txt('.g') ).toBe('')
  })

  it('keeps sibling layers from colliding on the same key', async () => {
    lips.register('writer2', {
      handler: { bump( this: any ){ this.setContext('selection', this.input.to ) } },
      default: `<div><u class="v">{context.selection}</u><button class="b" on-click( bump )>x</button></div>`
    })

    lips.render('t-own2', {
      default: `<div>
        <context selection="a"><writer2 to="A2"/></context>
        <context selection="b"><writer2 to="B2"/></context>
      </div>`
    }).appendTo('#app')

    await settle( () => document.querySelectorAll('.v').length === 2 )
    ;( document.querySelectorAll('.b')[0] as HTMLElement ).click()

    await settle( () => document.querySelectorAll('.v')[0].textContent === 'A2' )
    expect( document.querySelectorAll('.v')[1].textContent ).toBe('b')
  })

  it('still reaches the global store when no layer claims the key', async () => {
    lips.register('writer3', {
      handler: { bump( this: any ){ this.setContext('theme', 'dark') } },
      default: `<button class="b" on-click( bump )>x</button>`
    })

    lips.render('t-global', {
      default: `<div><b class="g">{context.theme}</b><writer3/></div>`
    }).appendTo('#app')

    await settle( () => txt('.g') === 'light' )
    ;( q('.b') as HTMLElement ).click()

    await settle( () => txt('.g') === 'dark' )
    expect( lips.getContext().theme ).toBe('dark')
  })

  it('writes past a layer that does not declare the key', async () => {
    lips.register('writer4', {
      handler: { bump( this: any ){ this.setContext('user', 'grace') } },
      default: `<button class="b" on-click( bump )>x</button>`
    })

    lips.render('t-past', {
      default: `<context theme="dark"><b class="u">{context.user}</b><writer4/></context>`
    }).appendTo('#app')

    await settle( () => txt('.u') === 'ada' )
    ;( q('.b') as HTMLElement ).click()

    await settle( () => txt('.u') === 'grace' )
    expect( lips.getContext().user ).toBe('grace')
  })

  it('re-syncs a DERIVED key when its source changes', async () => {
    lips.register('writer5', {
      handler: { bump( this: any ){ this.setContext('theme', 'local') } },
      default: `<div><u class="v">{context.theme}</u><button class="b" on-click( bump )>x</button></div>`
    })

    const c = lips.render('t-derived', {
      state: { tone: 'dark' },
      default: `<context theme=state.tone><writer5/></context>`
    })
    c.appendTo('#app')

    await settle( () => txt('.v') === 'dark' )

    // a local write holds…
    ;( q('.b') as HTMLElement ).click()
    await settle( () => txt('.v') === 'local' )

    // …until the source it derives from moves again
    c.state.tone = 'solarized'
    await settle( () => txt('.v') === 'solarized' )
  })

  it('tears ownership down with the block', async () => {
    lips.register('writer6', {
      handler: { bump( this: any ){ this.setContext('selection', 'local') } },
      default: `<button class="b" on-click( bump )>x</button>`
    })

    const c = lips.render('t-teardown', {
      state: { on: true },
      default: `<if( state.on )><context selection="a"><writer6/></context></if>`
    })
    c.appendTo('#app')

    await settle( () => !!q('.b') )
    c.state.on = false
    await settle( () => !q('.b') )

    // nothing leaked into the global store on the way out
    expect( lips.getContext().selection ).toBe( undefined )
  })
})

describe('onContext under a layer', () => {
  it('fires for a scoped override, not just a global write', async () => {
    const seen: string[] = []
    lips.register('obs', {
      watchContext: ['theme'],
      handler: { onContext( this: any ){ seen.push( this.context.theme ) } },
      default: `<i class="o">{context.theme}</i>`
    })

    const c = lips.render('t-onctx', {
      state: { tone: 'dark' },
      default: `<context theme=state.tone><obs/></context>`
    })
    c.appendTo('#app')

    await settle( () => txt('.o') === 'dark' )

    c.state.tone = 'solarized'
    await settle( () => seen.includes('solarized') )
  })

  it('still fires for a global write when nothing shadows the key', async () => {
    const seen: string[] = []
    lips.register('obs2', {
      watchContext: ['user'],
      handler: { onContext( this: any ){ seen.push( this.context.user ) } },
      default: `<i class="o2">{context.user}</i>`
    })

    lips.render('t-onctx2', { default: `<obs2/>` }).appendTo('#app')
    await settle( () => txt('.o2') === 'ada' )

    lips.setContext('user', 'grace')
    await settle( () => seen.includes('grace') )
  })

  it('does not fire for a context field it did not declare', async () => {
    const seen: string[] = []
    lips.register('obs3', {
      watchContext: ['user'],
      handler: { onContext( this: any ){ seen.push('fired') } },
      default: `<i class="o3">{context.theme}</i>`
    })

    lips.render('t-onctx3', { default: `<obs3/>` }).appendTo('#app')
    await settle( () => txt('.o3') === 'light' )

    lips.setContext('theme', 'dark')
    await settle( () => txt('.o3') === 'dark' )
    expect( seen ).toEqual( [] )
  })

  it('accepts the deprecated `context` spelling', async () => {
    const seen: string[] = []
    lips.register('obs4', {
      context: ['user'],
      handler: { onContext( this: any ){ seen.push( this.context.user ) } },
      default: `<i class="o4">{context.user}</i>`
    })

    lips.render('t-onctx4', { default: `<obs4/>` }).appendTo('#app')
    await settle( () => txt('.o4') === 'ada' )

    lips.setContext('user', 'grace')
    await settle( () => seen.includes('grace') )
  })
})
