import { describe, it, expect, beforeEach } from 'vitest'
import { compileTemplate } from '../src/ir/compiler'
import { renderIR, type RenderSetup, type RuntimeOptions } from '../src/ir/runtime'

function mount( src: string, setup: RenderSetup = {}, options: RuntimeOptions = {} ){
  const { ir, diagnostics } = compileTemplate( src )
  expect( diagnostics ).toEqual( [] )

  const app = document.createElement('div')
  document.body.appendChild( app )

  const inst = renderIR( ir, setup, options )
  inst.mount( app )
  return { inst, app, state: inst.state }
}

function irOf( src: string ){
  const { ir, diagnostics } = compileTemplate( src )
  expect( diagnostics ).toEqual( [] )
  return ir
}

beforeEach( () => { document.body.innerHTML = '' } )
const q = ( sel: string ) => document.querySelector( sel )
const qa = ( sel: string ) => [ ...document.querySelectorAll( sel ) ]

describe('swap: no-op', () => {
  it('identical templates produce an empty report and zero DOM churn', () => {
    const SRC = `
      <div class="card">
        <h2>{state.title}</h2>
        <for [x] in=state.list by="id"><i>{x.id}</i></for>
      </div>`
    const { inst } = mount( SRC, { state: { title: 'T', list: [ { id: 'a' }, { id: 'b' } ] } })

    const h2 = q('h2')!
    const items = qa('i')

    const report = inst.swap( irOf( SRC ) )

    expect( report.changes ).toEqual( [] )
    expect( q('h2') ).toBe( h2 )
    expect( qa('i')[0] ).toBe( items[0] )
    expect( qa('i')[1] ).toBe( items[1] )
  })
})

describe('swap: bind-only changes', () => {
  it('rewires a text expression onto the same nodes', () => {
    const { inst, state } = mount(`<p class="msg">{state.a}</p>`, { state: { a: 'AAA', b: 'BBB' } })
    const p = q('.msg')!
    const textNode = p.firstChild?.nextSibling // anchor, then inserted text node

    const report = inst.swap( irOf(`<p class="msg">{state.b}</p>`) )

    expect( report.changes ).toEqual([ { kind: 'binds', path: 'root' } ])
    expect( q('.msg') ).toBe( p )                 // element identity preserved
    expect( p.textContent ).toBe('BBB')           // new expression live
    expect( p.firstChild?.nextSibling ).toBe( textNode ) // text node reused

    state.b = 'B2'
    expect( p.textContent ).toBe('B2')            // new wiring is reactive
  })

  it('adds a new attribute bind to an element that already had one', () => {
    const { inst, state } = mount(`<div id=state.x>c</div>`, { state: { x: 'a', y: 'why' } })
    const el = q('#a')!

    const report = inst.swap( irOf(`<div id=state.x data-y=state.y>c</div>`) )

    expect( report.changes ).toEqual([ { kind: 'binds', path: 'root' } ])
    expect( q('#a') ).toBe( el )
    expect( el.getAttribute('data-y') ).toBe('why')

    state.y = 'zz'
    expect( el.getAttribute('data-y') ).toBe('zz')
  })

  it('rewires event instructions live', () => {
    const calls: any[] = []
    const { inst } = mount(`<button on-click( pick, 1 )>go</button>`, {
      handlers: { pick( n: number ){ calls.push( n ) } }
    })

    ;( q('button') as HTMLButtonElement ).click()
    inst.swap( irOf(`<button on-click( pick, 2 )>go</button>`) )
    ;( q('button') as HTMLButtonElement ).click()

    expect( calls ).toEqual([ 1, 2 ])
  })
})

describe('swap: skeleton changes', () => {
  it('re-renders in place and state survives by construction', () => {
    const { inst, state } = mount(`<p>{state.count}</p>`, { state: { count: 5 } })

    const report = inst.swap( irOf(`<section class="wrapped"><p>n = {state.count}</p></section>`) )

    expect( report.changes ).toEqual([ { kind: 'skeleton', path: 'root' } ])
    expect( q('.wrapped p')?.textContent ).toBe('n = 5') // value survived the rebuild

    state.count = 6
    expect( q('.wrapped p')?.textContent ).toBe('n = 6') // and stays reactive
  })

  it('remains swappable after a rebuild', () => {
    const { inst } = mount(`<p>{state.a}</p>`, { state: { a: 'x' } })

    inst.swap( irOf(`<div><p>{state.a}</p></div>`) )
    const report = inst.swap( irOf(`<div><p>{state.a}!</p></div>`) )

    expect( report.changes.length ).toBeGreaterThan( 0 )
    expect( q('p')?.textContent ).toBe('x!')
  })
})

describe('swap: child subtrees', () => {
  it('re-executes only the changed control block, keeping siblings', () => {
    const SRC_A = `
      <div>
        <p class="keep">{state.msg}</p>
        <if( state.on )><b class="arm">old-arm</b></if>
      </div>`
    const SRC_B = `
      <div>
        <p class="keep">{state.msg}</p>
        <if( state.on )><b class="arm">new-arm</b></if>
      </div>`

    const { inst } = mount( SRC_A, { state: { msg: 'hi', on: true } })
    const keep = q('.keep')!

    const report = inst.swap( irOf( SRC_B ) )

    expect( report.changes ).toEqual([ { kind: 'block', path: 'root/0' } ])
    expect( q('.keep') ).toBe( keep )                 // sibling untouched
    expect( q('.arm')?.textContent ).toBe('new-arm')  // block re-rendered
  })

  it('keeps identical sibling blocks wholesale', () => {
    const SRC_A = `
      <div>
        <for [x] in=state.list by="id"><i>{x.id}</i></for>
        <if( state.on )><b>A</b></if>
      </div>`
    const SRC_B = `
      <div>
        <for [x] in=state.list by="id"><i>{x.id}</i></for>
        <if( state.on )><b>B</b></if>
      </div>`

    const { inst } = mount( SRC_A, { state: { list: [ { id: 'k' } ], on: true } })
    const item = q('i')!

    const report = inst.swap( irOf( SRC_B ) )

    expect( report.changes ).toEqual([ { kind: 'block', path: 'root/1' } ])
    expect( q('i') ).toBe( item )   // the <for> subtree was kept — node identity intact
    expect( q('b')?.textContent ).toBe('B')
  })
})

describe('swap: the Modela scenario', () => {
  it('component internal state survives revisions around it', () => {
    const stepper = {
      ir: irOf(`<span class="stepper"><b class="n">{state.n}</b><button class="up" on-click( up )>+</button></span>`),
      state: { n: 0 },
      handlers: { up( this: any ){ this.state.n++ } }
    }

    const CARD_V1 = `
      <div class="card">
        <h2>{state.title}</h2>
        <if( state.promo )><b class="promo">SALE</b></if>
        <stepper/>
      </div>`
    // Revision: the promo block changed — the stepper region is untouched
    const CARD_V2 = `
      <div class="card">
        <h2>{state.title}</h2>
        <if( state.promo )><b class="promo">MEGA SALE</b></if>
        <stepper/>
      </div>`

    const { inst } = mount( CARD_V1, { state: { title: 'Product', promo: true } }, { components: { stepper } })

    // User tests the stepper up to 3
    const up = q('.up') as HTMLButtonElement
    up.click(); up.click(); up.click()
    expect( q('.n')?.textContent ).toBe('3')

    const report = inst.swap( irOf( CARD_V2 ) )

    // Only the promo block re-rendered; the stepper subtree was kept
    expect( report.changes ).toEqual([ { kind: 'block', path: 'root/0' } ])
    expect( q('.promo')?.textContent ).toBe('MEGA SALE')
    expect( q('.n')?.textContent ).toBe('3') // stepper still at 3

    // ...and the stepper still works after the swap
    ;( q('.up') as HTMLButtonElement ).click()
    expect( q('.n')?.textContent ).toBe('4')
  })

  it('v1 limitation: a skeleton rebuild remounts contained components', () => {
    /**
     * Static attrs live in the skeleton, so changing one rebuilds
     * the whole block — components INSIDE the rebuilt region are
     * remounted and their internal state resets. Store-state
     * survives; component-internal state inside the rebuilt range
     * does not. Follow-up: instance salvage across rebuilds.
     */
    const stepper2 = {
      ir: irOf(`<span><b class="n2">{state.n}</b><button class="up2" on-click( up )>+</button></span>`),
      state: { n: 0 },
      handlers: { up( this: any ){ this.state.n++ } }
    }

    const { inst } = mount(`<div><h2>{state.t}</h2><stepper2/></div>`,
      { state: { t: 'x' } }, { components: { stepper2 } })

    ;( q('.up2') as HTMLButtonElement ).click()
    expect( q('.n2')?.textContent ).toBe('1')

    const report = inst.swap( irOf(`<div><h2 class="fancy">{state.t}</h2><stepper2/></div>`) )

    expect( report.changes ).toEqual([ { kind: 'skeleton', path: 'root' } ])
    expect( q('.n2')?.textContent ).toBe('0') // remounted — documented v1 behavior
  })

  it('bind-level revision leaves the component instance itself intact', () => {
    const tally = {
      ir: irOf(`<button class="tally" on-click( up )>{state.n}</button>`),
      state: { n: 0 },
      handlers: { up( this: any ){ this.state.n++ } }
    }

    const V1 = `<div><p class="lbl">{state.a}</p><tally/></div>`
    const V2 = `<div><p class="lbl">{state.b}</p><tally/></div>`

    const { inst } = mount( V1, { state: { a: 'one', b: 'two' } }, { components: { tally } })

    ;( q('.tally') as HTMLButtonElement ).click()
    ;( q('.tally') as HTMLButtonElement ).click()
    const tallyEl = q('.tally')!
    expect( tallyEl.textContent ).toBe('2')

    const report = inst.swap( irOf( V2 ) )

    expect( report.changes ).toEqual([ { kind: 'binds', path: 'root' } ])
    expect( q('.lbl')?.textContent ).toBe('two')
    expect( q('.tally') ).toBe( tallyEl )       // same component instance
    expect( tallyEl.textContent ).toBe('2')     // same internal state
  })
})
