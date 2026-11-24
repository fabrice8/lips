/**
 * RFC-006 L1 and L3 — the Lynx renderer, test tier A.
 *
 * Both threads run in one process through `@lynx-js/testing-environment`:
 * the Lips runtime on the background thread against the shadow-tree host,
 * the applier on the main thread against the environment's Element PAPI
 * (jsdom underneath). Every op crosses the environment's real thread
 * bridge, `lynx.getCoreContext()` ↔ `lynx.getJSContext()`.
 *
 * The central check is the protocol's invariant: after every step, the
 * main thread's element tree is EXACTLY the shadow tree's real nodes, in
 * order — markers, fragments and text outside `text` never crossed, and
 * nothing was left behind.
 *
 * Shims: the environment implements only the ReactLynx-era `__AddEvent`,
 * not `__AddEventListener` / `__RemoveEventListener`, which official
 * guidance requires (RFC-006 §5), and has no `__InvokeUIMethod`. The lines
 * below map the listeners onto the jsdom element's own, and record UI
 * method calls with the number of flushes before them. Real event binding
 * and UI methods are exercised by the Lynx for Web and native runs.
 *
 * A listener gets what the native engine hands a plain callback
 * (`LepusClosureEventListener::ConvertEventToLepusValue`): the event's
 * data — its own fields, `target` and `currentTarget` as `{ id, uid,
 * dataset }` — and `ref`, the event itself. A test event carries its
 * Lynx fields (`key`, `touches`, …) as own properties.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { LynxTestingEnv } from '@lynx-js/testing-environment'
import { compileLynxTemplate } from '../src/lynx/template'
import { compileLynxStyle } from '../src/lynx/style'
import { stylisPreprocessor } from '../src/stylis'
import { renderIR, type RenderSetup, type RuntimeOptions } from '../src/ir/runtime'
import { createBackgroundHost, connectBackground, type LynxNode, type BackgroundHost } from '../src/lynx/background'
import { connectMain } from '../src/lynx/main'
import * as OP from '../src/lynx/protocol'
import { WORDS } from '../src/lynx/a11y'

const G = globalThis as any

let env: LynxTestingEnv
/** UI method calls: element, method, params, and how many flushes came first */
let invoked: [ any, string, any, number ][]
let flushes = 0

beforeEach( () => {
  invoked = []
  flushes = 0
  // vitest's own jsdom window: the environment's elements live in its document
  env = new LynxTestingEnv({ window: window as any })
  // Its Element PAPI looks itself up here, as its vitest preset would install it
  G.lynxTestingEnv = env
  G.lynxEnv = env.env
  const wrapped = new WeakMap<any, any>()
  const where = ( t: any ) => t && { id: t.id, uid: env.mainThread.globalThis.__GetElementUniqueID( t ), dataset: { ...t.dataset } }
  const engine = ( fn: any ) => wrapped.get( fn ) || wrapped.set( fn, ( e: any ) =>
    fn({ ...e, type: e.type, detail: e.detail, target: where( e.target ), currentTarget: where( e.currentTarget ), ref: e }) ).get( fn )
  Object.assign( env.mainThread.globalThis, {
    __AddEventListener: ( el: any, name: string, fn: any ) => el.addEventListener( name, engine( fn ) ),
    __RemoveEventListener: ( el: any, name: string, fn: any ) => el.removeEventListener( name, engine( fn ) ),
    __InvokeUIMethod: ( el: any, method: string, params: any ) => { invoked.push([ el, method, params, flushes ]) },
    __FlushElementTree: () => { flushes++ }
  })
})

const tree = ( src: string ) => {
  const { ir, diagnostics } = compileLynxTemplate( src )
  expect( diagnostics, src ).toEqual( [] )
  return ir
}
const tick = () => new Promise<void>( r => setTimeout( r, 0 ) )
/** A flat batch as op tuples */
const opsOf = ( ops: any[] ) => {
  const out: any[][] = []
  for( let i = 0; i < ops.length; i += OP.ARITY[ ops[ i ] ] + 1 ) out.push( ops.slice( i, i + OP.ARITY[ ops[ i ] ] + 1 ) )
  return out
}

/**
 * The main thread's tree: tags and raw text, in order. A list's children
 * are the cells it has asked for, so lists are compared on their own.
 */
const snapPage = ( el: any ): any => el.nodeType === 3
  ? el.data
  : { t: el.localName, ...( el.childNodes.length && el.localName !== 'list' ? { c: [ ...el.childNodes ].map( snapPage ) } : {} ) }

/** What it must equal: the shadow tree's REAL nodes, in order */
function snapShadow( n: LynxNode ): any[] {
  const out: any[] = []
  for( let c = n.first; c; c = c.next ){
    if( !c.real ) continue
    const kids = c.type === 'list' ? [] : snapShadow( c )
    out.push( c.type === '#text' ? c.value : { t: c.type, ...( kids.length ? { c: kids } : {} ) } )
  }
  return out
}

/**
 * Boot both threads, render, flush. `check()` asserts the invariant;
 * `fire()` taps an element on the MAIN thread and lets the round trip
 * through the background settle.
 */
async function boot( src: string, setup: RenderSetup = {}, options: RuntimeOptions = {} ){
  env.switchToMainThread()
  const page = G.__CreatePage( '0', 0 )
  connectMain( page )

  env.switchToBackgroundThread()
  const bg = connectBackground()
  const inst = renderIR<LynxNode>( tree( src ), setup, { ...options, host: bg.host })
  inst.mount( bg.root )
  await tick()

  const check = () => expect( [ ...page.childNodes ].map( snapPage ) ).toEqual( snapShadow( bg.root ) )
  check()

  return {
    inst, bg, page, check,
    html: () => page.innerHTML,
    q: ( sel: string ) => page.querySelector( sel ),
    async fire( sel: string, name = 'tap' ){
      const el = page.querySelector( sel )
      expect( el, sel ).not.toBeNull()
      env.switchToMainThread()
      el.dispatchEvent( new env.env.window.Event( name ) )
      env.switchToBackgroundThread()
      await tick()
      check()
    },
    /** Dispatch an event `make` builds, from the main thread's window */
    async dispatch( sel: string, make: ( w: any ) => Event ){
      const el = page.querySelector( sel )
      expect( el, sel ).not.toBeNull()
      env.switchToMainThread()
      el.dispatchEvent( make( env.env.window ) )
      env.switchToBackgroundThread()
      await tick()
      check()
    },
    async act( fn: () => void ){
      fn()
      await tick()
      check()
    }
  }
}

// --------------------------------------------------------------- protocol
describe('background host: the op stream', () => {
  const record = () => {
    const batches: unknown[][] = []
    const bg = createBackgroundHost( ops => batches.push( ops ) )
    return { bg, batches }
  }
  /** Decode a flat batch into readable tuples */
  const decode = ( ops: any[] ) => {
    const out: any[][] = []
    for( let i = 0; i < ops.length; ){
      const n = OP.ARITY[ ops[ i ] ]
      out.push( ops.slice( i, i + n + 1 ) )
      i += n + 1
    }
    return out
  }

  it('sends one batch per microtask, elements and text under text only', async () => {
    const { bg, batches } = record()
    renderIR<LynxNode>( tree(`<div class="a"><p>Hi <b>{state.name}</b></p>\n</div>`), { state: { name: 'Ada' } }, { host: bg.host }).mount( bg.root )

    expect( batches ).toHaveLength( 0 )
    await tick()
    expect( batches ).toHaveLength( 1 )

    const ops = decode( batches[ 0 ] as any[] )
    const created = ops.filter( o => o[ 0 ] === OP.CREATE ).map( o => o[ 2 ] )
    const texts = ops.filter( o => o[ 0 ] === OP.TEXT ).map( o => o[ 2 ] )

    expect( created ).toEqual([ 'view', 'text', 'text' ]) // div → view, p and b → text
    expect( texts ).toEqual([ 'Hi ', 'Ada' ])              // '\n' under a view never crosses
    // the bind's first value rode in its TEXT op: no SET_TEXT on first render
    expect( ops.some( o => o[ 0 ] === OP.SET_TEXT ) ).toBe( false )
    // the page (id 1) receives exactly one child: the view
    expect( ops.filter( o => o[ 0 ] === OP.INSERT && o[ 1 ] === OP.PAGE_ID ) ).toHaveLength( 1 )
  })

  it('updates are surgical: one SET_TEXT for one changed binding', async () => {
    const { bg, batches } = record()
    const inst = renderIR<LynxNode>( tree(`<p><span>{state.a}</span> / <span>{state.b}</span></p>`), { state: { a: 1, b: 2 } }, { host: bg.host })
    inst.mount( bg.root )
    await tick()

    inst.state.a = 5
    await tick()
    expect( decode( batches[ 1 ] as any[] ) ).toEqual([ [ OP.SET_TEXT, expect.any( Number ), '5' ] ])
  })

  it('releases every real id of a destroyed subtree, and nothing it moved', async () => {
    const { bg, batches } = record()
    const inst = renderIR<LynxNode>( tree(`<if( state.on )><div><p>x</p></div></if>`), { state: { on: true } }, { host: bg.host })
    inst.mount( bg.root )
    await tick()

    inst.state.on = false
    await tick()
    const ops = decode( batches[ 1 ] as any[] )
    expect( ops.map( o => o[ 0 ] ) ).toEqual([ OP.REMOVE, OP.RELEASE, OP.RELEASE, OP.RELEASE ]) // text, p, div
  })
})

// ---------------------------------------------------------- both threads
describe('Lynx: both threads through the testing environment', () => {
  it('renders a counter and taps it', async () => {
    const app = await boot(
      `<div class="counter"><p data-k="n">{state.n}</p><button data-k="inc" on-click( inc )><span>+</span></button></div>`,
      { state: { n: 0 }, handlers: { inc( this: any ){ this.state.n++ } } } )

    expect( app.html() ).toBe(
      '<view class="counter"><text data-k="n">0</text>'
      + '<view data-k="inc" accessibility-element="true" accessibility-traits="button" accessibility-label="+"><text>+</text></view></view>' )

    await app.fire('[data-k="inc"]')
    await app.fire('[data-k="inc"]')
    expect( app.q('[data-k="n"]').textContent ).toBe('2')
  })

  it('keyed list: moves keep element identity, removals free the elements', async () => {
    const app = await boot(
      `<ul><for [row] in=state.rows by="id"><li data-id=row.id><span>{row.label}</span></li></for></ul>`,
      { state: { rows: [ { id: 1, label: 'a' }, { id: 2, label: 'b' }, { id: 3, label: 'c' } ] } } )

    const ids = () => [ ...app.page.querySelectorAll('[data-id]') ].map( ( e: any ) => e.dataset.id )
    const third = app.q('[data-id="3"]')

    await app.act( () => app.inst.state.rows = [ app.inst.state.rows[ 2 ], app.inst.state.rows[ 0 ], { id: 4, label: 'd' } ] )
    expect( ids() ).toEqual([ '3', '1', '4' ])
    expect( app.q('[data-id="3"]') ).toBe( third ) // moved, not re-created

    await app.act( () => app.inst.state.rows = [ { id: 4, label: 'D' } ] )
    expect( ids() ).toEqual([ '4' ])
    expect( app.q('[data-id="4"] text').textContent ).toBe('D')

    await app.act( () => app.inst.state.rows = [] )
    expect( app.html() ).toBe('<view></view>')
  })

  it('if / else and switch swap whole ranges', async () => {
    const app = await boot(
      `<div><if( state.k === 'a' )><p>A</p></if><else-if( state.k === 'b' )><p>B</p><p>B2</p></else-if><else><span>none</span></else></div>`,
      { state: { k: 'a' } } )

    await app.act( () => app.inst.state.k = 'b' )
    expect( app.html() ).toBe('<view><text>B</text><text>B2</text></view>')
    await app.act( () => app.inst.state.k = 'z' )
    await app.act( () => app.inst.state.k = 'a' )
    expect( app.html() ).toBe('<view><text>A</text></view>')
  })

  it('attributes route to their Element PAPI calls; null removes', async () => {
    const app = await boot(
      `<div class=state.cls id=state.id data-user-id=state.uid title=state.t><span>x</span></div>`,
      { state: { cls: 'a b', id: 'main', uid: '7', t: 'hello' } } )

    const el = app.q('view')
    expect( el.className ).toBe('a b')
    expect( el.id ).toBe('main')
    expect( el.dataset.userId ).toBe('7')
    expect( el.getAttribute('title') ).toBe('hello')

    await app.act( () => { app.inst.state.cls = 'c'; app.inst.state.t = null })
    expect( el.className ).toBe('c')
    expect( el.hasAttribute('title') ).toBe( false )
  })

  it('a component scope merges with its class, and style variables ride inline', async () => {
    const card = {
      ir: tree(`<div class="card"><span>{input.label}</span></div>`),
      stylesheet: compileLynxStyle(`.card { width: {input.w}px; color: {input.c} }`, { nsp: 'ui/card', preprocess: stylisPreprocessor }).ir
    }
    const app = await boot( `<card label=state.l w=state.w c=state.c/>`, { state: { l: 'L', w: 10, c: 'red' } }, { components: { card } } )

    // The scope class, cleaned as the compiled sheet's selector is
    const el = app.q('view')
    expect( el.className ).toBe('card lips-ui-card')
    expect( card.stylesheet.css ).toContain('.lips-ui-card .card{')

    // A unit-suffixed bind carries its unit: Lynx's calc() covers lengths only
    expect( el.getAttribute('style') ).toBe('--ui-card-1: red; --ui-card-0-px: 10px')

    await app.act( () => app.inst.state.w = 20 )
    expect( el.getAttribute('style') ).toBe('--ui-card-1: red; --ui-card-0-px: 20px')

    // Nullish removes the variable, so an ancestor's value shows through
    await app.act( () => app.inst.state.c = null )
    expect( el.getAttribute('style') ).toBe('--ui-card-0-px: 20px')
  })

  it('dynamic tags map through the same vocabulary', async () => {
    const app = await boot( `<div><{state.tag} data-x="1"><span>in</span></></div>`, { state: { tag: 'section' } } )
    expect( app.html() ).toBe('<view><view data-x="1"><text>in</text></view></view>')

    await app.act( () => app.inst.state.tag = 'p' )
    expect( app.html() ).toBe('<view><text data-x="1"><text>in</text></text></view>')
  })

  /**
   * Lynx's native background engine has no `queueMicrotask` (found at tier
   * B: the real engine reported `ReferenceError` from `notifyUpdate`). The
   * runtime must schedule with promise jobs only.
   */
  it('runs without queueMicrotask, as on the native background engine', async () => {
    const saved = G.queueMicrotask
    G.queueMicrotask = undefined
    try {
      let updates = 0
      const app = await boot( `<p data-k="n">{state.n}</p><button data-k="b" on-click( inc )><span>+</span></button>`,
        { state: { n: 0 }, handlers: { inc( this: any ){ this.state.n++ }, onUpdate(){ updates++ } } } )

      await app.fire('[data-k="b"]')
      expect( app.q('[data-k="n"]').textContent ).toBe('1')
      expect( updates ).toBe( 1 )
    }
    finally { G.queueMicrotask = saved }
  })

  it('dispose empties the page and stops listening', async () => {
    let taps = 0
    const app = await boot( `<button data-k="b" on-click( hit )><span>b</span></button>`,
      { handlers: { hit(){ taps++ } } } )

    const button = app.q('[data-k="b"]')
    await app.fire('[data-k="b"]')
    expect( taps ).toBe( 1 )

    await app.act( () => app.inst.dispose() )
    expect( app.html() ).toBe('')

    env.switchToMainThread()
    button.dispatchEvent( new env.env.window.Event('tap') )
    env.switchToBackgroundThread()
    await tick()
    expect( taps ).toBe( 1 )
  })
})

// ------------------------------------------------- L3: inputs, lists, words
describe('Lynx L3: inputs, lists, attributes', () => {
  /** What the list was told, batch by batch */
  const told = ( list: any ) => JSON.parse( list.getAttribute('update-list-info') || '[]' )
  /** Ask the list for the cell at `index`, as the native list does on scroll */
  const ask = ( list: any, index: number ) => {
    env.switchToMainThread()
    const uid = list.componentAtIndex( list, G.__GetElementUniqueID( list ), index, 0 )
    env.switchToBackgroundThread()
    return uid
  }
  const rows = ( ...ids: number[] ) => ids.map( id => ({ id, label: `r${id}` }) )
  const LIST = `<list><for [row] in=state.rows by="id"><list-item data-id=row.id>{row.label}</list-item></for></list>`

  it('a list is told its cells and builds none until asked', async () => {
    const app = await boot( LIST, { state: { rows: rows( 1, 2, 3 ) } } )
    const list = app.q('list')

    const [ first ] = told( list )
    expect( first.removeAction ).toEqual( [] )
    expect( first.insertAction.map( ( a: any ) => a.position ) ).toEqual([ 0, 1, 2 ])
    // Lynx renders no cell without an item-key
    expect( first.insertAction.every( ( a: any ) => typeof a['item-key'] === 'string' ) ).toBe( true )
    expect( list.children ).toHaveLength( 0 )

    const uid = ask( list, 1 )
    expect( list.children ).toHaveLength( 1 )
    expect( list.children[ 0 ].dataset.id ).toBe('2')
    expect( G.__GetElementUniqueID( list.children[ 0 ] ) ).toBe( uid )
    // the cell's text was wrapped: list-item is not a text element
    expect( list.children[ 0 ].innerHTML ).toBe('<text>r2</text>')
  })

  it('a reorder moves only what left its run; a removal detaches the cell', async () => {
    const app = await boot( LIST, { state: { rows: rows( 1, 2, 3, 4 ) } } )
    const list = app.q('list')
    ;[ 0, 1, 2, 3 ].forEach( i => ask( list, i ) )

    // 4 moves to the front: 1, 2, 3 stay where they are relative to each other
    await app.act( () => app.inst.state.rows = rows( 4, 1, 2, 3 ) )
    expect( told( list )[ 1 ] ).toMatchObject({ removeAction: [ 3 ], insertAction: [ { position: 0 } ] })

    // 2 goes: removed by its old position, and its element leaves the list
    await app.act( () => app.inst.state.rows = rows( 4, 1, 3 ) )
    expect( told( list )[ 2 ] ).toMatchObject({ removeAction: [ 2 ], insertAction: [] })
    expect( [ ...list.children ].map( ( c: any ) => c.dataset.id ).sort() ).toEqual([ '1', '3', '4' ])

    // an append is one insert, at the end
    await app.act( () => app.inst.state.rows = rows( 4, 1, 3, 5 ) )
    expect( told( list )[ 3 ] ).toMatchObject({ removeAction: [], insertAction: [ { position: 3 } ] })
    expect( app.q('[data-id="5"]') ).toBeNull() // not asked for yet
  })

  it('a reversal keeps one cell and moves the rest', async () => {
    const app = await boot( LIST, { state: { rows: rows( 1, 2, 3 ) } } )
    await app.act( () => app.inst.state.rows = rows( 3, 2, 1 ) )
    const { removeAction, insertAction } = told( app.q('list') )[ 1 ]
    expect( removeAction ).toHaveLength( 2 )
    expect( insertAction ).toHaveLength( 2 )
  })

  it('an input value: the attribute first, then setValue after the flush', async () => {
    const app = await boot( `<input data-k="in" value=state.v>`, { state: { v: 'a' } } )
    const input = app.q('[data-k="in"]')
    expect( input.getAttribute('value') ).toBe('a')
    expect( invoked ).toHaveLength( 0 )

    const before = flushes
    await app.act( () => app.inst.state.v = 'b' )
    expect( invoked ).toEqual([ [ input, 'setValue', { value: 'b' }, before + 1 ] ]) // after this batch's flush
    expect( input.getAttribute('value') ).toBe('a') // the attribute is the first value only
  })

  it('what the input reports is not written back; anything else is', async () => {
    const seen: any[] = []
    const app = await boot( `<input data-k="in" value=state.v on-input( onIn )>`, {
      state: { v: '' },
      handlers: { onIn( this: any, e: any ){ seen.push( e ); this.state.v = e.target.value } }
    })
    const input = app.q('[data-k="in"]')

    env.switchToMainThread()
    input.dispatchEvent( new env.env.window.CustomEvent( 'input', { detail: { value: 'hel', selectionStart: 3, selectionEnd: 3 } }) )
    env.switchToBackgroundThread()
    await tick()

    // DOM-shaped and Lynx-shaped reads both work
    expect( seen[ 0 ].target.value ).toBe('hel')
    expect( seen[ 0 ].detail ).toMatchObject({ value: 'hel', selectionStart: 3 })
    expect( app.inst.state.v ).toBe('hel')
    // the input already shows it: writing it back would race the next keystroke
    expect( invoked ).toHaveLength( 0 )

    await app.act( () => app.inst.state.v = '' )
    expect( invoked.map( i => i.slice( 1, 3 ) ) ).toEqual([ [ 'setValue', { value: '' } ] ])
  })

  it('a present attribute is true, as in HTML: Lynx reads empty as false', async () => {
    const app = await boot( `<scroll-view scroll-y><input placeholder="" value=""></scroll-view>` )
    expect( app.q('scroll-view').getAttribute('scroll-y') ).toBe('true')
    expect( app.q('input').getAttribute('placeholder') ).toBe('')
    expect( app.q('input').getAttribute('value') ).toBe('')
  })

  it('@text in an element that is not text gets a text of its own', async () => {
    const app = await boot( `<div data-k="d" @text=state.t></div><p data-k="p" @text=state.t></p>`, { state: { t: 'hi' } } )
    expect( app.q('[data-k="d"]').innerHTML ).toBe('<text>hi</text>')
    expect( app.q('[data-k="p"]').innerHTML ).toBe('hi')

    await app.act( () => app.inst.state.t = 'yo' )
    expect( app.q('[data-k="d"]').innerHTML ).toBe('<text>yo</text>')
  })

  it('bare text in a button renders: auto-wrapped at compile time', async () => {
    const app = await boot( `<button data-k="b" on-click( inc )>Count {state.n}</button>`,
      { state: { n: 0 }, handlers: { inc( this: any ){ this.state.n++ } } } )
    expect( app.q('[data-k="b"]').innerHTML ).toBe('<text>Count 0</text>')
    await app.fire('[data-k="b"]')
    expect( app.q('[data-k="b"]').innerHTML ).toBe('<text>Count 1</text>')
  })
})

// ----------------------------------------------------- RFC-006 §4.8: a11y
describe('Lynx events: what crosses is what a handler reads (#35)', () => {
  /** A Lynx event: its fields are its own, as the engine hands them over */
  const lynxEvent = ( w: any, type: string, fields: object, bubbles = false ) =>
    Object.assign( new w.Event( type, { bubbles }), fields )

  it('a key event carries its key and modifiers', async () => {
    const seen: any[] = []
    const app = await boot( `<input data-k="f" on-keydown( onKey )>`, { handlers: { onKey: ( e: any ) => seen.push( e ) } } )

    await app.dispatch( 'input', w => lynxEvent( w, 'keydown', { key: 'ArrowDown', repeat: false, shiftKey: true, ctrlKey: false, altKey: false, metaKey: false }) )
    expect( seen[ 0 ] ).toMatchObject({ type: 'keydown', key: 'ArrowDown', shiftKey: true, ctrlKey: false, repeat: false })

    // Where a platform sends it as a custom event, the fields are in its detail
    await app.dispatch( 'input', w => new w.CustomEvent( 'keydown', { detail: { key: 'Enter', metaKey: true } }) )
    expect( seen[ 1 ] ).toMatchObject({ key: 'Enter', metaKey: true })
  })

  it('a touch event carries its points', async () => {
    const seen: any[] = []
    const app = await boot( `<div data-k="pad" on-touchmove( onMove )></div>`, { handlers: { onMove: ( e: any ) => seen.push( e ) } } )
    const point = { identifier: 0, x: 1, y: 2, pageX: 3, pageY: 4, clientX: 12, clientY: 34 }

    await app.dispatch( 'view', w => lynxEvent( w, 'touchmove', { touches: [ point, { ...point, identifier: 1 } ], changedTouches: [ point ], detail: { x: 1, y: 2 } }) )
    expect( seen[ 0 ].touches ).toEqual([ point, { ...point, identifier: 1 } ])
    expect( seen[ 0 ].touches[ 0 ].clientX ).toBe( 12 )
    expect( seen[ 0 ].changedTouches ).toEqual([ point ])
    expect( seen[ 0 ].detail ).toEqual({ x: 1, y: 2 })
  })

  it('every event carries its target and current target, with their datasets', async () => {
    const seen: any[] = []
    const app = await boot( `<div data-row="7" on-click( onRow )><p data-part="label">x</p></div>`, { handlers: { onRow: ( e: any ) => seen.push( e ) } } )

    await app.dispatch( '[data-part]', w => lynxEvent( w, 'tap', {}, true ) )
    expect( seen[ 0 ].target.dataset ).toEqual({ part: 'label' })
    expect( seen[ 0 ].currentTarget.dataset ).toEqual({ row: '7' })
  })

  it("an input's value joins its target, beside its dataset", async () => {
    const seen: any[] = []
    const app = await boot( `<input data-k="f" on-input( onInput )>`, { handlers: { onInput: ( e: any ) => seen.push( e ) } } )
    await app.dispatch( 'input', w => new w.CustomEvent( 'input', { detail: { value: 'hi' } }) )
    expect( seen[ 0 ].target ).toMatchObject({ value: 'hi', dataset: { k: 'f' } })
  })

  it('what crosses is data: it clones, and holds no ref to the engine event', async () => {
    const wires: any[] = []
    env.switchToMainThread()
    const page = G.__CreatePage( '0', 0 )
    const apply = ( await import('../src/lynx/main') ).createApplier( page, w => wires.push( w ) )
    apply([ OP.CREATE, 2, 'view', OP.INSERT, 1, 2, 0, OP.LISTEN, 2, 'touchstart' ])
    page.firstChild.dispatchEvent( lynxEvent( env.env.window, 'touchstart', { touches: [ { identifier: 0, clientX: 1 } ] }) )
    env.switchToBackgroundThread()

    expect( wires ).toHaveLength( 1 )
    expect( () => structuredClone( wires[ 0 ] ) ).not.toThrow()
    expect( JSON.stringify( wires[ 0 ] ) ).not.toContain('ref')
    expect( 'ref' in wires[ 0 ].event ).toBe( false )
  })
})

describe('Lynx svg: one element, its markup in content (#34)', () => {
  const SRC = `<svg viewBox="0 0 24 24" class="icon"><path d=state.d fill=state.c/>`
            + `<for [p] in=state.dots><circle cx=p r="1"/></for><text x="2">{state.t}</text></svg>`
  const state = () => ({ d: 'M0 0', c: 'red', dots: [ 1, 2 ], t: 'a' })
  const svgOf = ( d: string, c: string, dots: number[], t: string ) =>
    `<svg viewBox="0 0 24 24"><path d="${d}" fill="${c}"></path>${dots.map( p => `<circle r="1" cx="${p}"></circle>` ).join('')}`
    + `<text x="2">${t}</text></svg>`

  it('reaches the main thread as ONE svg element, its subtree written into content', async () => {
    const app = await boot( SRC, { state: state() } )
    expect( app.html() ).toBe(`<svg class="icon" content="${svgOf( 'M0 0', 'red', [ 1, 2 ], 'a' ).replace( /"/g, '&quot;' )}"></svg>`)
    expect( app.q('svg').getAttribute('content') ).toBe( svgOf( 'M0 0', 'red', [ 1, 2 ], 'a' ) )
  })

  it('a change inside it writes content again: bound attributes, control flow, text', async () => {
    const app = await boot( SRC, { state: state() } )
    const content = () => app.q('svg').getAttribute('content')

    await app.act( () => { app.inst.state.d = 'M1 1'; app.inst.state.c = 'blue' })
    expect( content() ).toBe( svgOf( 'M1 1', 'blue', [ 1, 2 ], 'a' ) )
    await app.act( () => app.inst.state.dots = [ 3 ] )
    expect( content() ).toBe( svgOf( 'M1 1', 'blue', [ 3 ], 'a' ) )
    // Each on its own: a removal, a text
    await app.act( () => app.inst.state.dots = [] )
    expect( content() ).toBe( svgOf( 'M1 1', 'blue', [], 'a' ) )
    await app.act( () => app.inst.state.t = 'z' )
    expect( content() ).toBe( svgOf( 'M1 1', 'blue', [], 'z' ) )
    // Markup text is escaped: a value cannot end its attribute or open a tag
    await app.act( () => { app.inst.state.t = 'a<b & "c"'; app.inst.state.c = '"/><x y="' })
    expect( content() ).toBe( svgOf( 'M1 1', '&#34;/&#62;&#60;x y=&#34;', [], 'a&#60;b &#38; &#34;c&#34;' ) )
  })

  it('one ATTR content per flush, whatever changed inside, and none when nothing did', async () => {
    const batches: any[][] = []
    const bg = createBackgroundHost( ops => batches.push( ops ) )
    const inst = renderIR<LynxNode>( tree( SRC ), { state: state() }, { host: bg.host })
    inst.mount( bg.root )
    await tick()
    const contents = ( ops: any[] ) => opsOf( ops ).filter( o => o[ 0 ] === OP.ATTR && o[ 2 ] === 'content' ).map( o => o[ 3 ] )
    const creates = ( ops: any[] ) => opsOf( ops ).filter( o => o[ 0 ] === OP.CREATE ).map( o => o[ 2 ] )

    // The parts never cross, nor their text: the svg is the one element created
    expect( creates( batches[ 0 ] ) ).toEqual([ 'svg' ])
    expect( opsOf( batches[ 0 ] ).filter( o => o[ 0 ] === OP.TEXT ) ).toEqual( [] )
    expect( contents( batches[ 0 ] ) ).toHaveLength( 1 )

    inst.state.d = 'M5 5'; inst.state.t = 'b'; inst.state.dots = [ 9 ]
    await tick()
    expect( batches ).toHaveLength( 2 )
    expect( contents( batches[ 1 ] ) ).toEqual([ svgOf( 'M5 5', 'red', [ 9 ], 'b' ) ])
    expect( creates( batches[ 1 ] ) ).toEqual( [] )

    // The same markup again sends nothing
    inst.state.d = 'M6 6'; inst.state.d = 'M5 5'
    await tick()
    expect( batches ).toHaveLength( 2 )
  })

  /**
   * Tier B: Lynx sizes an svg by its style alone — with only the
   * attributes it laid out 368×0 and drew nothing — so `width` and
   * `height` size the element too, as on the DOM, under its own style.
   */
  it('width and height size the element too, under its style; data-* stays on it', async () => {
    const app = await boot( `<svg viewBox="0 0 8 8" width="24" height=state.h data-k="i" style="opacity: 0.5"><rect width="8" height="8"/></svg>`,
                            { state: { h: '2em' } } )
    const el = app.q('svg')
    expect( el.getAttribute('style') ).toBe('width: 24px; height: 2em; opacity: 0.5')
    expect( el.dataset.k ).toBe('i')
    expect( el.getAttribute('content') ).toBe('<svg viewBox="0 0 8 8" width="24" height="2em"><rect width="8" height="8"></rect></svg>')

    await app.act( () => app.inst.state.h = 30 )
    expect( el.getAttribute('style') ).toBe('width: 24px; height: 30px; opacity: 0.5')
  })

  it('a part has no events: listening on one sends nothing (LIPS-L108 says so at compile time)', async () => {
    const batches: any[][] = []
    const bg = createBackgroundHost( ops => batches.push( ops ) )
    const { ir, diagnostics } = compileLynxTemplate(`<svg><circle r="1" on-click( go )/></svg>`)
    expect( diagnostics.map( d => d.code ) ).toEqual([ 'LIPS-L108' ])
    renderIR<LynxNode>( ir, { handlers: { go(){} } }, { host: bg.host }).mount( bg.root )
    await tick()
    expect( opsOf( batches[ 0 ] ).filter( o => o[ 0 ] === OP.LISTEN ) ).toEqual( [] )
  })

  it('a destroyed svg is released and not drawn again', async () => {
    const app = await boot( `<if( state.on )>${SRC}</if>`, { state: { ...state(), on: true } } )
    await app.act( () => { app.inst.state.d = 'M9 9'; app.inst.state.on = false })
    expect( app.html() ).toBe('')
  })
})

describe('Lynx accessibility: ARIA read as Lynx attributes', () => {
  /** The Lynx accessibility attributes of an element on the main thread */
  const a11y = ( el: any ) => Object.fromEntries( [ ...el.attributes ]
    .filter( ( a: any ) => /^accessibility-|^focusable$/.test( a.name ) ).map( ( a: any ) => [ a.name, a.value ] ) )

  it('a button is a button named by its content, which it follows', async () => {
    const app = await boot( `<button data-k="b" on-click( inc )>Count {state.n}</button><h2 data-k="h">Title</h2><a data-k="a">Go</a>`,
      { state: { n: 0 }, handlers: { inc( this: any ){ this.state.n++ } } } )
    expect( a11y( app.q('[data-k="b"]') ) ).toEqual({
      'accessibility-element': 'true', 'accessibility-traits': 'button', 'accessibility-label': 'Count 0'
    })
    await app.fire('[data-k="b"]')
    expect( app.q('[data-k="b"]').getAttribute('accessibility-label') ).toBe('Count 1')
    // A text reads its own content: no label, and Android's heading flag
    expect( a11y( app.q('[data-k="h"]') ) ).toEqual({
      'accessibility-element': 'true', 'accessibility-traits': 'header', 'accessibility-heading': 'true'
    })
    expect( a11y( app.q('[data-k="a"]') ) ).toEqual({ 'accessibility-element': 'true', 'accessibility-traits': 'link' })
  })

  it('a tab: one trait for every platform, its state in words, roving tabindex as focusable', async () => {
    const app = await boot( `<div data-k="t" role="tab" aria-selected=state.sel tabindex=state.ti>Inbox</div>`,
      { state: { sel: 'true', ti: '0' } } )
    expect( a11y( app.q('[data-k="t"]') ) ).toEqual({
      'accessibility-element': 'true', 'accessibility-traits': 'button', 'accessibility-label': 'Inbox',
      'accessibility-role-description': 'tab', 'accessibility-value': 'selected', focusable: 'true'
    })
    await app.act( () => Object.assign( app.inst.state, { sel: 'false', ti: '-1' }) )
    expect( a11y( app.q('[data-k="t"]') ) ).toMatchObject({ focusable: 'false' })
    expect( app.q('[data-k="t"]').hasAttribute('accessibility-value') ).toBe( false )
    // ARIA itself never crosses: Lynx would ignore it
    expect( app.html() ).not.toMatch( /role=|aria-|tabindex/ )
  })

  it('states read as words, in order; "false" and "mixed" have their own', async () => {
    const app = await boot( `<div data-k="c" role="checkbox" aria-checked=state.c aria-required="true" aria-invalid=state.i>Agree</div>`,
      { state: { c: 'false', i: 'false' } } )
    const value = () => app.q('[data-k="c"]').getAttribute('accessibility-value')
    expect( value() ).toBe('not checked, required')
    await app.act( () => Object.assign( app.inst.state, { c: 'mixed', i: 'true' }) )
    expect( value() ).toBe('mixed, invalid, required')
    // A bound `true` arrives as "" — ARIA's "not set" (RFC-006 §9)
    await app.act( () => app.inst.state.c = true )
    expect( value() ).toBe('invalid, required')
    expect( app.q('[data-k="c"]').getAttribute('accessibility-role-description') ).toBe('checkbox')
  })

  it('labels by id and by <label for> resolve to text, and follow it', async () => {
    const app = await boot(
      `<label for="name">{state.l}</label><input data-k="i" id="name"><input data-k="j" id="mail"><label for="mail">Email</label>`
      + `<div data-k="d" role="button" aria-labelledby="t" aria-describedby="h"><img alt="Bin"><span id="t">Delete</span></div><p id="h">Cannot be undone</p>`,
      { state: { l: 'Name' } } )
    expect( app.q('[data-k="i"]').getAttribute('accessibility-label') ).toBe('Name')
    expect( app.q('[data-k="j"]').getAttribute('accessibility-label') ).toBe('Email')
    expect( app.q('[data-k="d"]').getAttribute('accessibility-label') ).toBe('Delete, Cannot be undone')
    await app.act( () => app.inst.state.l = 'Full name' )
    expect( app.q('[data-k="i"]').getAttribute('accessibility-label') ).toBe('Full name')
  })

  it('hidden, modal, decorative and presentational', async () => {
    const app = await boot(
      `<button data-k="b"><span aria-hidden=state.h>×</span> Close</button><div><img data-k="x" alt=""></div>`
      + `<div data-k="m" aria-modal="true" aria-roledescription="sheet"></div><div data-k="p" role="presentation"></div>`,
      { state: { h: 'true' } } )
    // Hidden content is not read: the label is the rest
    expect( app.q('[data-k="b"]').getAttribute('accessibility-label') ).toBe('Close')
    expect( app.q('[data-k="b"] text text').getAttribute('accessibility-elements-hidden') ).toBe('true')
    expect( a11y( app.q('[data-k="x"]') ) ).toEqual({ 'accessibility-element': 'false' })
    expect( a11y( app.q('[data-k="m"]') ) ).toEqual({ 'accessibility-exclusive-focus': 'true', 'accessibility-role-description': 'sheet' })
    expect( a11y( app.q('[data-k="p"]') ) ).toEqual({ 'accessibility-element': 'false' })

    await app.act( () => app.inst.state.h = 'false' )
    expect( app.q('[data-k="b"]').getAttribute('accessibility-label') ).toBe('× Close')
    expect( app.q('[data-k="b"] text text').hasAttribute('accessibility-elements-hidden') ).toBe( false )
  })

  /** The background alone: what is announced, and the words */
  const announced = ( src: string, setup: RenderSetup, words?: any ) => {
    const said: string[] = [], batches: any[][] = []
    const bg = createBackgroundHost( ops => batches.push( ops ), { announce: t => said.push( t ), words })
    const inst = renderIR<LynxNode>( tree( src ), setup, { host: bg.host })
    inst.mount( bg.root )
    bg.flush()
    return { said, inst, batches, async act( fn: () => void ){ fn(); await tick() } }
  }

  it('a status region announces its changes, not its first render', async () => {
    const app = announced( `<p role="status">{state.s}</p><div aria-live="off">{state.s}</div>`, { state: { s: 'Ready' } })
    expect( app.said ).toEqual( [] )
    await app.act( () => app.inst.state.s = 'Saved' )
    await app.act( () => app.inst.state.n = 1 )
    await app.act( () => app.inst.state.s = 'Saved' )
    expect( app.said ).toEqual([ 'Saved' ])
  })

  it('an alert announces its arrival after the first render; polite regions do not', async () => {
    const app = announced( `<div role="alert">Offline</div><if( state.e )><div role="alert"><p>{state.e}</p></div></if><if( state.e )><p aria-live="polite">{state.e}</p></if>`,
      { state: { e: '' } } )
    expect( app.said ).toEqual( [] )
    await app.act( () => app.inst.state.e = 'Card declined' )
    expect( app.said ).toEqual([ 'Card declined' ])
    await app.act( () => app.inst.state.e = 'Try again' )
    expect( app.said ).toEqual([ 'Card declined', 'Try again', 'Try again' ])
  })

  it('the words translate', () => {
    const app = announced( `<div role="tab" aria-selected="true">Boîte</div>`, {}, { ...WORDS, selected: 'sélectionné', tab: 'onglet' })
    const ops = app.batches.flat()
    expect( ops ).toContain('sélectionné')
    expect( ops ).toContain('onglet')
  })
})

/**
 * Lynx's template encoder stores each background script as a C string, so
 * a raw NUL ends the script there and the engine reports "Unexpected EOF".
 * Minified builds escape it; a dev build ships the source as written.
 */
describe('Lynx bundles', () => {
  it('no source file holds a raw NUL: write \\0', () => {
    const sources = import.meta.glob( '../src/**/*.ts', { query: '?raw', import: 'default', eager: true })
    expect( Object.keys( sources ).length ).toBeGreaterThan( 20 )
    expect( Object.keys( sources ).filter( f => sources[ f ].includes('\0') ) ).toEqual([])
  })
})
