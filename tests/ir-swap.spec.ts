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

  it('a skeleton rebuild salvages the components inside it', () => {
    /**
     * Static attrs live in the skeleton, so changing one rebuilds
     * the whole block. The components inside are released into the
     * fresh render and re-homed rather than recreated: state, DOM
     * and lifecycle all carry over.
     */
    const lifecycle: string[] = []
    const stepper2 = {
      ir: irOf(`<span><b class="n2">{state.n}</b><button class="up2" on-click( up )>+</button></span>`),
      state: { n: 0 },
      handlers: {
        up( this: any ){ this.state.n++ },
        onMount(){ lifecycle.push('mount') },
        onDestroy(){ lifecycle.push('destroy') }
      }
    }

    const { inst } = mount(`<div><h2>{state.t}</h2><stepper2/></div>`,
      { state: { t: 'x' } }, { components: { stepper2 } })

    ;( q('.up2') as HTMLButtonElement ).click()
    expect( q('.n2')?.textContent ).toBe('1')
    const el = q('.n2')!

    const report = inst.swap( irOf(`<div><h2 class="fancy">{state.t}</h2><stepper2/></div>`) )

    expect( report.changes ).toEqual([ { kind: 'skeleton', path: 'root' } ])
    expect( report.salvaged ).toEqual([ 'stepper2' ])
    expect( q('h2')?.getAttribute('class') ).toBe('fancy') // the revision landed
    expect( q('.n2') ).toBe( el )            // same node, not a rebuild
    expect( q('.n2')?.textContent ).toBe('1') // same state
    expect( lifecycle ).toEqual([ 'mount' ])  // never destroyed, never remounted

    // ...and it still works where it landed
    ;( q('.up2') as HTMLButtonElement ).click()
    expect( q('.n2')?.textContent ).toBe('2')
  })

  it('salvages across a rebuild that moves the component', () => {
    const box = {
      ir: irOf(`<i class="box" on-click( bump )>{state.n}</i>`),
      state: { n: 0 },
      handlers: { bump( this: any ){ this.state.n++ } }
    }

    const { inst } = mount(`<div><span class="a"><box/></span><p/></div>`,
      {}, { components: { box } })

    const el = q('.box') as HTMLElement
    el.click(); el.click()
    expect( el.textContent ).toBe('2')

    // The revision relocates the component to a different parent element
    inst.swap( irOf(`<section><p/><footer><box/></footer></section>`) )

    expect( q('footer > .box') ).toBe( el ) // re-homed, same node
    expect( el.textContent ).toBe('2')      // same state
    el.click()
    expect( el.textContent ).toBe('3')      // still reactive where it landed
  })

  it('salvages components rendered inside control flow', () => {
    const dot = {
      ir: irOf(`<i class="dot" on-click( bump )>{input.id}{state.n}</i>`),
      state: { n: 0 },
      handlers: { bump( this: any ){ this.state.n++ } }
    }

    const V1 = `<div class="v1"><if( state.on )><for [x] in=state.ids by="."><dot key=x id=x/></for></if></div>`
    const V2 = `<div class="v2"><if( state.on )><for [x] in=state.ids by="."><dot key=x id=x/></for></if></div>`

    const { inst } = mount( V1, { state: { on: true, ids: [ 'a', 'b' ] } }, { components: { dot } })

    const dots = qa('.dot') as HTMLElement[]
    dots[1].click(); dots[1].click()
    expect( dots.map( n => n.textContent ) ).toEqual([ 'a0', 'b2' ])

    const report = inst.swap( irOf( V2 ) )

    expect( report.changes ).toEqual([ { kind: 'skeleton', path: 'root' } ])
    expect( report.salvaged ).toEqual([ 'dot', 'dot' ])
    expect( qa('.dot') ).toEqual( dots )                        // same nodes
    expect( qa('.dot').map( n => n.textContent ) ).toEqual([ 'a0', 'b2' ])
  })

  it('salvages a component together with its slotted body', () => {
    const frame = {
      ir: irOf(`<div class="frame"><{input.renderer}/></div>`)
    }
    const knob = {
      ir: irOf(`<i class="knob" on-click( bump )>{state.n}</i>`),
      state: { n: 0 },
      handlers: { bump( this: any ){ this.state.n++ } }
    }

    const { inst } = mount(`<div class="v1"><frame><knob/></frame></div>`,
      {}, { components: { frame, knob } })

    const el = q('.knob') as HTMLElement
    el.click()
    expect( el.textContent ).toBe('1')

    inst.swap( irOf(`<div class="v2"><frame><knob/></frame></div>`) )

    expect( q('.frame > .knob') ).toBe( el )
    expect( el.textContent ).toBe('1')
  })

  it('destroys a component the revision dropped', () => {
    const events: string[] = []
    const gone = {
      ir: irOf(`<i class="gone"/>`),
      handlers: { onDestroy(){ events.push('destroy') } }
    }

    const { inst } = mount(`<div class="a"><gone/></div>`, {}, { components: { gone } })
    expect( q('.gone') ).toBeTruthy()

    const report = inst.swap( irOf(`<div class="b"><em/></div>`) )

    expect( report.salvaged ).toEqual( [] )
    expect( events ).toEqual([ 'destroy' ])
    expect( q('.gone') ).toBeNull()
  })

  it('re-wires inputs onto the salvaged instance and drops the ones removed', () => {
    const chip = {
      ir: irOf(`<i class="lb">{input.text}|{input.hint}|{state.n}</i>`),
      state: { n: 0 },
      handlers: { bump( this: any ){ this.state.n++ } }
    }

    const { inst, state } = mount(`<div class="v1"><chip text=state.a hint="H"/></div>`,
      { state: { a: 'one', b: 'two' } }, { components: { chip } })

    expect( q('.lb')?.textContent ).toBe('one|H|0')
    const el = q('.lb')!

    // New skeleton, new input expression, and `hint` dropped
    inst.swap( irOf(`<div class="v2"><chip text=state.b/></div>`) )

    expect( q('.lb') ).toBe( el )
    expect( q('.lb')?.textContent ).toBe('two||0')

    // The new binding is live, not a one-shot copy
    state.b = 'three'
    expect( q('.lb')?.textContent ).toBe('three||0')
  })

  it('keys decide identity when components are reordered', () => {
    const cell = {
      ir: irOf(`<i class="cell">{input.tag}</i>`),
      state: { n: 0 }
    }

    const { inst } = mount(`<div class="v1"><cell key="a" tag="a"/><cell key="b" tag="b"/></div>`,
      {}, { components: { cell } })

    // Mark each live instance so it can be traced through the swap
    const [ a, b ] = qa('.cell')
    a.setAttribute('data-id', 'A')
    b.setAttribute('data-id', 'B')

    inst.swap( irOf(`<div class="v2"><cell key="b" tag="b"/><cell key="a" tag="a"/></div>`) )

    // Instances followed their keys, not their positions
    expect( qa('.cell').map( n => n.getAttribute('data-id') ) ).toEqual([ 'B', 'A' ])
    expect( qa('.cell').map( n => n.textContent ) ).toEqual([ 'b', 'a' ])
  })

  it('salvages a component whose own call site changed', () => {
    const tally2 = {
      ir: irOf(`<button class="t2" on-click( up )>{input.label}:{state.n}</button>`),
      state: { n: 0 },
      handlers: { up( this: any ){ this.state.n++ } }
    }

    const { inst } = mount(`<div><tally2 label=state.a/></div>`,
      { state: { a: 'one', b: 'two' } }, { components: { tally2 } })

    ;( q('.t2') as HTMLButtonElement ).click()
    const el = q('.t2')!
    expect( el.textContent ).toBe('one:1')

    // Only the component child changed — no skeleton rebuild
    const report = inst.swap( irOf(`<div><tally2 label=state.b/></div>`) )

    expect( report.changes ).toEqual([ { kind: 'block', path: 'root/0' } ])
    expect( report.salvaged ).toEqual([ 'tally2' ])
    expect( q('.t2') ).toBe( el )
    expect( el.textContent ).toBe('two:1') // new input, same state

    ;( q('.t2') as HTMLButtonElement ).click()
    expect( q('.t2')?.textContent ).toBe('two:2')
  })

  it('re-stamps the scoped-style marker after a rebuild', () => {
    /**
     * The sheet is injected as `[rel="<nsp>"] { … }`, so rebuilt
     * element roots have to carry the marker or the component loses
     * its styles on the first revision.
     */
    const { inst } = mount(`<div class="v1">a</div>`,
      { stylesheet: `.v1 { color: red }`, nsp: 'scoped' })

    expect( q('.v1')?.getAttribute('rel') ).toBe('scoped')

    inst.swap( irOf(`<div class="v2">b</div>`) )

    expect( q('.v2')?.getAttribute('rel') ).toBe('scoped')
  })

  it('a salvaged component is destroyed by its new owner', () => {
    const events: string[] = []
    const leaf = {
      ir: irOf(`<i class="leaf"/>`),
      handlers: { onDestroy(){ events.push('destroy') } }
    }

    const { inst } = mount(`<div class="a"><leaf/></div>`, {}, { components: { leaf } })

    inst.swap( irOf(`<div class="b"><leaf/></div>`) ) // rebuild + salvage
    expect( events ).toEqual( [] )

    inst.dispose()
    expect( events ).toEqual([ 'destroy' ])
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
