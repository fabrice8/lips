import { describe, it, expect, beforeEach, vi } from 'vitest'
import Lips from '../src/lips'

/**
 * Slots, component events, full lifecycle and reactive context
 * on the IR engine — the parity blockers before the default flip.
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
const tick = () => new Promise( r => setTimeout( r, 0 ) )
const q = ( sel: string ) => document.querySelector( sel )
const qa = ( sel: string ) => [ ...document.querySelectorAll( sel ) ]

let lips: any
beforeEach( () => {
  document.body.innerHTML = '<div id="app"></div>'
  lips = new Lips({ engine: 'ir' } as any )
})

describe('slots', () => {
  it('renders slotted body inside the child, in parent scope', async () => {
    lips.register('panel', {
      default: `<section class="panel"><h3>{input.title}</h3><{input.renderer}/></section>`
    })

    const c = lips.render('slot-basic', {
      state: { name: 'Ada', title: 'Profile' },
      default: `<div><panel title=state.title><b class="slotted">Hello {state.name}</b></panel></div>`
    })
    c.appendTo('#app')

    await settle( () => !!q('.panel .slotted') )
    expect( q('.panel h3')?.textContent ).toBe('Profile')
    // Slot content closes over the PARENT's state
    expect( q('.slotted')?.textContent ).toBe('Hello Ada')
  })

  it('keeps slot content reactive to parent state', async () => {
    lips.register('box', { default: `<div class="box"><{input.renderer}/></div>` })

    const c = lips.render('slot-reactive', {
      state: { n: 1 },
      default: `<box><i class="v">{state.n}</i></box>`
    })
    c.appendTo('#app')
    await settle( () => q('.v')?.textContent === '1' )

    c.state.n = 42
    await settle( () => q('.v')?.textContent === '42' )
  })

  it('passes slot arguments from the child placement', async () => {
    lips.register('list', {
      state: { items: [ 'a', 'b' ] },
      default: `<ul><for [item] in=state.items><li><{input.renderer} entry=item/></li></for></ul>`
    })

    const c = lips.render('slot-args', {
      default: `<list [entry]><span class="cell">[{entry}]</span></list>`
    })
    c.appendTo('#app')

    await settle( () => qa('.cell').length === 2 )
    expect( qa('.cell').map( e => e.textContent ) ).toEqual([ '[a]', '[b]' ])
  })
})

describe('component events', () => {
  it('delivers emitted arguments to the parent handler', async () => {
    const seen: any[] = []

    lips.register('picker', {
      handler: {
        choose( this: any ){ this.emit('picked', 'red', 7 ) }
      },
      default: `<button class="pick" on-click( choose )>pick</button>`
    })

    const c = lips.render('evt-basic', {
      handler: {
        onPicked( this: any, ...args: any[] ){ seen.push( args ) }
      },
      default: `<div><picker on-picked( onPicked )/></div>`
    })
    c.appendTo('#app')

    await settle( () => !!q('.pick') )
    ;( q('.pick') as HTMLButtonElement ).click()

    expect( seen ).toEqual([ [ 'red', 7 ] ])
  })

  it('appends emitted args after declared args', async () => {
    let got: any[] = []

    lips.register('emitter', {
      handler: { fire( this: any ){ this.emit('go', 'B' ) } },
      default: `<button class="fire" on-click( fire )>f</button>`
    })

    const c = lips.render('evt-args', {
      state: { tag: 'A' },
      handler: { onGo( this: any, ...args: any[] ){ got = args } },
      default: `<div><emitter on-go( onGo, state.tag )/></div>`
    })
    c.appendTo('#app')

    await settle( () => !!q('.fire') )
    ;( q('.fire') as HTMLButtonElement ).click()

    expect( got ).toEqual([ 'A', 'B' ])
  })
})

describe('lifecycle', () => {
  it('fires create → input → mount → render in order', async () => {
    const order: string[] = []

    lips.register('lc', {
      handler: {
        onCreate(){ order.push('create') },
        onInput(){ order.push('input') },
        onMount(){ order.push('mount') },
        onRender(){ order.push('render') }
      },
      default: `<i class="lc">{input.v}</i>`
    })

    lips.render('lc-host', { default: `<div><lc v="1"/></div>` }).appendTo('#app')
    await settle( () => !!q('.lc') )

    expect( order ).toEqual([ 'create', 'input', 'mount', 'render' ])
  })

  it('fires onUpdate/onRender after state changes (batched)', async () => {
    let updates = 0
    let renders = 0

    const c = lips.render('lc-update', {
      state: { a: 1, b: 1 },
      handler: {
        onUpdate(){ updates++ },
        onRender(){ renders++ }
      },
      default: `<p>{state.a}-{state.b}</p>`
    })
    c.appendTo('#app')

    expect( updates ).toBe( 0 )   // not during initial render
    expect( renders ).toBe( 1 )   // initial render counted once

    c.state.a = 2
    c.state.b = 2                 // two writes, one microtask flush
    await tick()

    expect( updates ).toBe( 1 )
    expect( renders ).toBe( 2 )
  })

  it('fires onAttach on mount and onDetach on destroy', async () => {
    const order: string[] = []

    lips.register('att', {
      handler: {
        onAttach(){ order.push('attach') },
        onDetach(){ order.push('detach') },
        onDestroy(){ order.push('destroy') }
      },
      default: `<i class="att">x</i>`
    })

    const c = lips.render('att-host', { default: `<div><att/></div>` })
    expect( order ).toEqual( [] )   // not attached before mount

    c.appendTo('#app')
    await settle( () => order.includes('attach') )

    c.destroy()
    expect( order ).toEqual([ 'attach', 'detach', 'destroy' ])
  })

  it('routes render errors to onError instead of throwing', async () => {
    const errors: any[] = []
    const spy = vi.spyOn( console, 'error' ).mockImplementation( () => {} )

    lips.render('lc-error', {
      state: { n: 0 },
      handler: {
        boom(){ throw new Error('handler exploded') },
        onError( e: Error ){ errors.push( e.message ) }
      },
      default: `<div><button class="bx" on-click( boom )>x</button></div>`
    }).appendTo('#app')

    // Errors thrown inside lifecycle land on onError
    const c2 = lips.render('lc-error2', {
      handler: {
        onMount(){ throw new Error('mount exploded') },
        onError( e: Error ){ errors.push( e.message ) }
      },
      default: `<i>y</i>`
    })
    c2.appendTo('#app')

    expect( errors ).toContain('mount exploded')
    spy.mockRestore()
  })
})

describe('reactive context', () => {
  it('fires onContext only for declared fields', async () => {
    const hits: string[] = []

    lips.setContext({ theme: 'dark', lang: 'en', unrelated: 1 })

    lips.register('ctx', {
      context: [ 'theme' ],
      handler: {
        onContext( this: any ){ hits.push( this.context.theme ) }
      },
      default: `<i class="ctx">{context.theme}</i>`
    })

    lips.render('ctx-host', { default: `<div><ctx/></div>` }).appendTo('#app')
    await settle( () => !!q('.ctx') )
    expect( hits ).toEqual( [] )

    lips.setContext('unrelated', 2 )
    await tick()
    expect( hits ).toEqual( [] )      // undeclared field → no fire

    lips.setContext('theme', 'light')
    await tick()
    expect( hits ).toEqual([ 'light' ])
  })

  it('re-renders bindings that read context', async () => {
    lips.setContext({ theme: 'dark' })

    lips.render('ctx-bind', { default: `<b class="t">{context.theme}</b>` }).appendTo('#app')
    await settle( () => q('.t')?.textContent === 'dark' )

    lips.setContext('theme', 'light')
    await settle( () => q('.t')?.textContent === 'light' )
  })

  it('useContext delivers the declared slice', async () => {
    lips.setContext({ a: 1, b: 2 })

    const seen: any[] = []
    lips.useContext([ 'a' ], ( ctx: any ) => seen.push( ctx ) )

    lips.setContext('b', 99 )
    await tick()
    expect( seen ).toEqual( [] )

    lips.setContext('a', 5 )
    await tick()
    expect( seen ).toEqual([ { a: 5 } ])
  })
})
