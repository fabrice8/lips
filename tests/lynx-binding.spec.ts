/// <reference types="node" />
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
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { LynxTestingEnv } from '@lynx-js/testing-environment'
import { compileLynxTemplate } from '../src/lynx/template'
import { compileLynxStyle } from '../src/lynx/style'
import { stylisPreprocessor } from '../src/stylis'
import { renderIR, type RenderSetup, type RuntimeOptions } from '../src/ir/runtime'
import { createBackgroundHost, connectBackground, type LynxNode, type BackgroundHost } from '../src/lynx/background'
import { connectMain } from '../src/lynx/main'
import * as OP from '../src/lynx/protocol'

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
  Object.assign( env.mainThread.globalThis, {
    __AddEventListener: ( el: any, name: string, fn: any ) => el.addEventListener( name, fn ),
    __RemoveEventListener: ( el: any, name: string, fn: any ) => el.removeEventListener( name, fn ),
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
      '<view class="counter"><text data-k="n">0</text><view data-k="inc"><text>+</text></view></view>' )

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

/**
 * Lynx's template encoder stores each background script as a C string, so
 * a raw NUL ends the script there and the engine reports "Unexpected EOF".
 * Minified builds escape it; a dev build ships the source as written.
 */
describe('Lynx bundles', () => {
  it('no source file holds a raw NUL: write \\0', () => {
    const raw = readdirSync( 'src', { recursive: true, encoding: 'utf8' })
      .filter( f => /\.ts$/.test( f ) && readFileSync(`src/${f}`).includes( 0 ) )
    expect( raw ).toEqual([])
  })
})
