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
 * Lynx fields (`key`, `touches`, …) as own properties. Options are read
 * as the native engine reads them (lips#36): for a main-thread closure
 * (`closure_type` CORE), `bind_type` picks the phase and the catch; for a
 * plain callback, only `capture` counts, and there is no catch.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { LynxTestingEnv } from '@lynx-js/testing-environment'
import { compileLynxTemplate } from '../src/lynx/template'
import { compileTemplate } from '../src/ir/compiler'
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
/** What a UI method answers, when a spec says: by default nothing, as the engine never calls back a method that returns nothing */
let answer: ( ( el: any, method: string, params: any ) => { code: number, data?: unknown } ) | undefined

beforeEach( () => {
  invoked = []
  flushes = 0
  answer = undefined
  // vitest's own jsdom window: the environment's elements live in its document
  env = new LynxTestingEnv({ window: window as any })
  // Its Element PAPI looks itself up here, as its vitest preset would install it
  G.lynxTestingEnv = env
  G.lynxEnv = env.env
  const wrapped = new WeakMap<any, any>()
  const where = ( t: any ) => t && { id: t.id, uid: env.mainThread.globalThis.__GetElementUniqueID( t ), dataset: { ...t.dataset } }
  /** How the native engine reads the options: `bind_type` for a main-thread closure (CORE), only `capture` for a plain one */
  const core = ( o: any ) => o?.closure_type === 2
  const phase = ( o: any ) => core( o ) ? o.bind_type === 2 || o.bind_type === 3 : !!o?.capture
  const engine = ( fn: any, o?: any ) => wrapped.get( fn ) || wrapped.set( fn, ( e: any ) => {
    fn({ ...e, type: e.type, detail: e.detail, target: where( e.target ), currentTarget: where( e.currentTarget ), ref: e })
    core( o ) && ( o.bind_type === 3 || o.bind_type === 4 ) && e.stopPropagation()
  }).get( fn )
  Object.assign( env.mainThread.globalThis, {
    __AddEventListener: ( el: any, name: string, fn: any, o: any ) => el.addEventListener( name, engine( fn, o ), phase( o ) ),
    __RemoveEventListener: ( el: any, name: string, fn: any, o: any ) => el.removeEventListener( name, engine( fn ), phase( o ) ),
    __InvokeUIMethod: ( el: any, method: string, params: any, cb: ( r: any ) => void ) => {
      invoked.push([ el, method, params, flushes ])
      // Asynchronously, as the engine answers once laid out
      answer && setTimeout( () => cb( answer!( el, method, params ) ) )
    },
    __ElementAnimate: ( el: any, args: any ) => { invoked.push([ el, '__ElementAnimate', args, flushes ]) },
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

  describe('cell hints: full-span, sticky, estimated sizes (#43)', () => {
    const HINTED = `<list sticky><list-item data-id="head" full-span sticky-top estimated-main-axis-size-px="40">Head</list-item>`
      + `<for [row] in=state.rows by="id"><list-item data-id=row.id sticky-bottom=row.last estimated-height-px=row.h>{row.label}</list-item></for></list>`
    const hinted = ( ...ids: number[] ) => ids.map( ( id, i ) => ({ id, label: `r${id}`, last: i === ids.length - 1, h: 20 + id }) )
    const KEYS = [ 'full-span', 'sticky-top', 'sticky-bottom', 'estimated-height-px', 'estimated-main-axis-size-px' ]
    const hintsOf = ( a: any ) => Object.fromEntries( KEYS.filter( k => k in a ).map( k => [ k, a[ k ] ] ) )

    it('a list-item full-span sticky-top reaches its insert action with those fields, as Lynx reads them', async () => {
      const app = await boot( HINTED, { state: { rows: hinted( 1, 2 ) } } )
      const list = app.q('list')
      const [ first ] = told( list )
      // Lynx's list reads booleans and numbers only (`IsBool`, `IsNumber`): never attribute text
      expect( first.insertAction.map( hintsOf ) ).toEqual([
        { 'full-span': true, 'sticky-top': true, 'estimated-main-axis-size-px': 40 },
        { 'sticky-bottom': false, 'estimated-height-px': 21 },
        { 'sticky-bottom': true, 'estimated-height-px': 22 }
      ])
      expect( first.updateAction ).toEqual( [] )
      // Lynx for Web reads them as attributes of the cell: still set there
      ask( list, 0 )
      expect( list.children[ 0 ].hasAttribute('sticky-top') ).toBe( true )
      // The list's own switch is an attribute, as before
      expect( list.getAttribute('sticky') ).toBe('true')
    })

    it('a cell with no hints carries none; a flag written "false" is false, as Lynx for Web reads it', async () => {
      const app = await boot( LIST, { state: { rows: rows( 1 ) } } )
      expect( Object.keys( told( app.q('list') )[ 0 ].insertAction[ 0 ] ).sort() ).toEqual([ 'item-key', 'position', 'type' ])

      const flags = await boot( `<list><list-item full-span="false" sticky-top="">x</list-item></list>` )
      expect( hintsOf( told( flags.q('list') )[ 0 ].insertAction[ 0 ] ) ).toEqual({ 'full-span': false, 'sticky-top': true })
    })

    it('a hint that changes on a cell the list has is an update, by its position, that rebuilds nothing', async () => {
      const app = await boot( HINTED, { state: { rows: hinted( 1, 2 ) } } )
      const list = app.q('list')
      await app.act( () => app.inst.state.rows = [ { ...app.inst.state.rows[ 0 ], last: true, h: 50 }, app.inst.state.rows[ 1 ] ] )
      const [ , second ] = told( list )
      expect( second.insertAction ).toEqual( [] )
      expect( second.removeAction ).toEqual( [] )
      expect( second.updateAction ).toEqual([
        { from: 1, to: 1, flush: false, type: 'default', 'item-key': first( list ).insertAction[ 1 ][ 'item-key' ], 'sticky-bottom': true, 'estimated-height-px': 50 }
      ])

      // Told once: the next change to the list does not tell it again
      await app.act( () => app.inst.state.rows = [ ...app.inst.state.rows, { id: 9, label: 'r9', last: false, h: 29 } ] )
      const [ , , third ] = told( list )
      expect( third.insertAction.map( hintsOf ) ).toEqual([ { 'sticky-bottom': false, 'estimated-height-px': 29 } ])
      expect( third.updateAction ).toEqual( [] )
    })

    it('a moved or added cell carries its hints again, as they are now', async () => {
      const app = await boot( HINTED, { state: { rows: hinted( 1, 2 ) } } )
      await app.act( () => app.inst.state.rows = hinted( 2, 1, 3 ) )
      const [ , second ] = told( app.q('list') )
      // Whichever cell stays, each position the list is told about has the hints of the row there now
      const byPosition = Object.fromEntries([
        ...second.insertAction.map( ( a: any ) => [ a.position, hintsOf( a ) ] ),
        ...second.updateAction.map( ( a: any ) => [ a.from, hintsOf( a ) ] )
      ])
      expect( byPosition ).toEqual({
        1: { 'sticky-bottom': false, 'estimated-height-px': 22 },
        2: { 'sticky-bottom': false, 'estimated-height-px': 21 },
        3: { 'sticky-bottom': true, 'estimated-height-px': 23 }
      })
      // The cell that stayed and whose hints did not change is not told again
      expect( second.insertAction.length + second.updateAction.length ).toBe( 3 )
    })
  })
  const first = ( list: any ) => told( list )[ 0 ]

  it('a list\'s own numeric and boolean props reach Lynx as numbers and booleans (#47)', async () => {
    // The environment writes a number and its text alike: read what the applier hands Element PAPI
    const sent: [ string, string, unknown ][] = []
    const setAttribute = env.mainThread.globalThis.__SetAttribute
    env.mainThread.globalThis.__SetAttribute = ( el: any, name: string, v: unknown ) => {
      name === 'update-list-info' || sent.push([ el.tagName.toLowerCase(), name, v ])
      return setAttribute( el, name, v )
    }
    const app = await boot(
      `<list span-count=state.cols sticky-offset="12" sticky="false" experimental-recycle-sticky-item list-type="flow" scroll-event-throttle="fast" accessibility-label="2" exposure-id="7" sticky-top>`
      + `<list-item span-count="2" sticky="false">x</list-item></list>`
      + `<view span-count="2"></view><list bounces=state.b></list>`,
      { state: { cols: 2, b: true } } )
    const of = ( tag: string ) => Object.fromEntries( sent.filter( s => s[ 0 ] === tag ).map( s => [ s[ 1 ], s[ 2 ] ] ) )
    // Lynx reads these only if `IsNumber()` / `IsBool()`
    expect( of('list') ).toEqual({
      'span-count': 2, 'sticky-offset': 12, sticky: false, 'experimental-recycle-sticky-item': true,
      // a string prop, and text that is not a number, as written
      'list-type': 'flow', 'scroll-event-throttle': 'fast', 'accessibility-label': '2', 'exposure-id': '7', 'sticky-top': true, bounces: true
    })
    // The same names elsewhere are text
    expect( of('list-item') ).toEqual({ 'span-count': '2', sticky: 'false' })
    expect( of('view') ).toEqual({ 'span-count': '2' })

    // A bound change converts again; a removed prop is removed
    sent.length = 0
    await app.act( () => { app.inst.state.cols = 3; app.inst.state.b = null as any } )
    expect( of('list') ).toEqual({ 'span-count': 3, bounces: null })
    // Lynx for Web reads the attribute's text: unchanged
    expect( app.q('list').getAttribute('span-count') ).toBe('3')
  })

  it('every typed list prop is converted, and no string one (#47)', async () => {
    // `@lynx-js/types` 4.2.1 `ListProps`, then the typed reads of Lynx 4.1's
    // `ListContainerImpl::ResolveAttribute` and Clay's list beyond it
    const NUMBER = [ 'span-count', 'sticky-offset', 'initial-scroll-index', 'lower-threshold-item-count', 'upper-threshold-item-count',
      'scroll-event-throttle', 'layout-id', 'preload-buffer-count', 'experimental-search-ref-anchor-strategy',
      'sticky-buffer-count', 'list-debug-info-level', 'experimental-batch-render-strategy' ]
    const FLAG = [ 'sticky', 'bounces', 'enable-scroll', 'enable-nested-scroll', 'need-visible-item-info', 'need-layout-complete-info',
      'scroll-bar-enable', 'experimental-recycle-sticky-item', 'enable-insert-platform-view-operation', 'harmony-scroll-edge-effect',
      'enable-dynamic-span-count', 'needs-visible-cells', 'should-request-state-restore', 'experimental-enable-preload-section',
      'experimental-recycle-available-item-before-layout', 'experimental-update-sticky-for-diff' ]
    const TEXT = [ 'scroll-orientation', 'list-type', 'custom-list-name', 'update-animation', 'anchor-priority', 'anchor-align',
      'anchor-visibility', 'item-snap', 'list-main-axis-gap', 'list-cross-axis-gap', 'vertical-orientation', 'exposure-id' ]
    const sent: Record<string, unknown> = {}
    const setAttribute = env.mainThread.globalThis.__SetAttribute
    env.mainThread.globalThis.__SetAttribute = ( el: any, name: string, v: unknown ) => {
      sent[ name ] = v
      return setAttribute( el, name, v )
    }
    await boot(`<list ${[ ...NUMBER.map( n => `${n}="3"` ), ...FLAG.map( n => `${n}="false"` ), ...TEXT.map( n => `${n}="1"` ) ].join(' ')}></list>`)
    for( const n of NUMBER ) expect( sent[ n ], n ).toBe( 3 )
    for( const n of FLAG ) expect( sent[ n ], n ).toBe( false )
    for( const n of TEXT ) expect( sent[ n ], n ).toBe('1')
  })

  it('Lynx\'s boolean attributes reach it as booleans: HarmonyOS reads any text as true', async () => {
    const sent: [ string, string, unknown ][] = []
    const setAttribute = env.mainThread.globalThis.__SetAttribute
    env.mainThread.globalThis.__SetAttribute = ( el: any, name: string, v: unknown ) => {
      sent.push([ el.tagName.toLowerCase(), name, v ])
      return setAttribute( el, name, v )
    }
    const app = await boot(
      `<overlay visible=state.v events-pass-through="true"><p>x</p></overlay>`
      + `<scroll-view user-interaction-enabled="false" ignore-focus event-through="FALSE" block-native-event="Yes" skip-redirection="1" native-interaction-enabled="untrue" accessibility-label="false" exposure-scene="true"></scroll-view>`
      + `<list user-interaction-enabled="false" span-count="2"></list>`
      + `<div role="none"><p>x</p></div>`,
      { state: { v: 'false' } } )
    const of = ( tag: string ) => Object.fromEntries( sent.filter( s => s[ 0 ] === tag && s[ 1 ] !== 'update-list-info' ).map( s => [ s[ 1 ], s[ 2 ] ] ) )
    expect( of('overlay') ).toEqual({ visible: false, 'events-pass-through': true })
    // As Android reads them: present, "true" or "yes" in any case; other attributes keep their text
    expect( of('scroll-view') ).toMatchObject({ 'user-interaction-enabled': false, 'ignore-focus': true, 'event-through': false, 'block-native-event': true,
      'skip-redirection': false, 'native-interaction-enabled': false, 'accessibility-label': 'false', 'exposure-scene': 'true' })
    // Before a list's own rule
    expect( of('list') ).toEqual({ 'user-interaction-enabled': false, 'span-count': 2 })
    // The background's ARIA sends a boolean, which stays one
    expect( of('view') ).toMatchObject({ 'accessibility-element': false })

    // Bound: text converts again, true is present, false removes it
    for( const [ v, want ] of [ [ 'true', true ], [ true, true ], [ false, null ] ] as const ){
      sent.length = 0
      await app.act( () => app.inst.state.v = v as any )
      expect( of('overlay'), String( v ) ).toEqual({ visible: want })
    }
  })

  it('every Lynx boolean attribute named is converted', async () => {
    // Lynx 4.x: `UIBase::prop_setters_` that read `Value::Bool()`, and `UIOverlay::OnPropUpdate`
    const FLAG = [ 'visible', 'events-pass-through', 'event-through', 'ignore-focus', 'user-interaction-enabled', 'native-interaction-enabled',
      'block-native-event', 'block-list-event', 'skip-redirection', 'enable-exposure-ui-clip', 'accessibility-element',
      'accessibility-elements-hidden', 'accessibility-exclusive-focus' ]
    // Near misses: a prefix or suffix more, and Lynx's text attributes beside them
    const TEXT = [ 'visible-area', 'is-visible', 'accessibility-elements', 'accessibility-label', 'accessibility-traits', 'exposure-id' ]
    const sent: Record<string, unknown> = {}
    const setAttribute = env.mainThread.globalThis.__SetAttribute
    env.mainThread.globalThis.__SetAttribute = ( el: any, name: string, v: unknown ) => {
      sent[ name ] = v
      return setAttribute( el, name, v )
    }
    await boot(`<scroll-view ${[ ...FLAG.map( n => `${n}="false"` ), ...TEXT.map( n => `${n}="false"` ) ].join(' ')}></scroll-view>`)
    for( const n of FLAG ) expect( sent[ n ], n ).toBe( false )
    for( const n of TEXT ) expect( sent[ n ], n ).toBe('false')
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

/**
 * lips#36: the same template means the same on both hosts. Every case
 * runs on the DOM host (jsdom, `click`) and on Lynx (both threads, `tap`).
 */
describe('event modifiers: one template, one meaning on both hosts (#36)', () => {
  type Mounted = { tap( k: string ): Promise<void>, done(): void }
  const HOSTS: Record<string, ( src: string, setup: RenderSetup ) => Promise<Mounted>> = {
    async dom( src, setup ){
      const { ir, diagnostics } = compileTemplate( src )
      expect( diagnostics ).toEqual( [] )
      const box = document.createElement('div')
      document.body.append( box )
      renderIR( ir, setup ).mount( box )
      return {
        async tap( k ){ box.querySelector(`[data-k="${k}"]`)!.dispatchEvent( new Event( 'click', { bubbles: true }) ) },
        done: () => box.remove()
      }
    },
    async lynx( src, setup ){
      const app = await boot( src, setup )
      return { tap: k => app.dispatch( `[data-k="${k}"]`, w => new w.Event( 'tap', { bubbles: true }) ), done(){} }
    }
  }
  const logging = ( log: string[], ...names: string[] ) =>
    Object.fromEntries( names.map( n => [ n, function( this: any ){ log.push( n ); n === 'dismiss' && ( this.state.open = false ) } ]) )

  it('Lynx: UNLISTEN unbinds each kind as it was bound, so nothing is forwarded after it', async () => {
    const wires: any[] = []
    env.switchToMainThread()
    const page = G.__CreatePage( '0', 0 )
    const apply = ( await import('../src/lynx/main') ).createApplier( page, w => wires.push( w ) )
    // One element per kind: at its target, a catch would keep the event from the others
    const kinds = [ 'tap', 'tap.stop', 'tap.capture', 'tap.capture.stop' ]
    apply( kinds.flatMap( ( k, i ) => [ OP.CREATE, 2 + i, 'view', OP.INSERT, 1, 2 + i, 0, OP.LISTEN, 2 + i, k ] ) )
    const tap = () => [ ...page.childNodes ].forEach( ( el: any ) => el.dispatchEvent( new env.env.window.Event( 'tap', { bubbles: true }) ) )
    tap()
    expect( wires.map( w => w.name ).sort() ).toEqual( [ ...kinds ].sort() )

    apply( kinds.flatMap( ( k, i ) => [ OP.UNLISTEN, 2 + i, k ] ) )
    wires.length = 0
    tap()
    env.switchToBackgroundThread()
    expect( wires ).toEqual( [] )
  })

  it('Lynx: a tap on raw text inside the element is inside (Lynx for Web hit-tests to it)', async () => {
    const log: string[] = []
    const app = await boot( `<div><div data-k="pop" on-click.outside( dismiss )><p data-k="in">in</p></div><p data-k="away">away</p></div>`,
                            { state: { open: true }, handlers: logging( log, 'dismiss' ) } )
    // Dispatched from the raw text: the event's target is it
    const raw = async ( k: string ) => {
      env.switchToMainThread()
      app.q(`[data-k="${k}"]`).firstChild.dispatchEvent( new env.env.window.Event( 'tap', { bubbles: true }) )
      env.switchToBackgroundThread()
      await tick()
      app.check()
    }
    await raw('in')
    expect( log ).toEqual( [] )
    await raw('away')
    expect( log ).toEqual([ 'dismiss' ])
  })

  for( const [ host, mount ] of Object.entries( HOSTS ) ) describe( host, () => {
    it('.stop: an inner handler keeps the event from the outer one', async () => {
      const log: string[] = []
      const app = await mount( `<div data-k="row" on-click( row )><button data-k="btn" on-click.stop( btn )><span>x</span></button></div>`,
                               { handlers: logging( log, 'row', 'btn' ) } )
      await app.tap('btn')
      expect( log ).toEqual([ 'btn' ])
      await app.tap('row')
      expect( log ).toEqual([ 'btn', 'row' ])
      app.done()
    })

    it('.capture: an outer handler has the event before its target', async () => {
      const log: string[] = []
      const app = await mount( `<div data-k="outer" on-click.capture( outer )><button data-k="inner" on-click( inner )><span>x</span></button></div>`,
                               { handlers: logging( log, 'outer', 'inner' ) } )
      await app.tap('inner')
      expect( log ).toEqual([ 'outer', 'inner' ])
      app.done()
    })

    it('.capture.stop: and keeps it from the target', async () => {
      const log: string[] = []
      const app = await mount( `<div data-k="outer" on-click.capture.stop( outer )><button data-k="inner" on-click( inner )><span>x</span></button></div>`,
                               { handlers: logging( log, 'outer', 'inner' ) } )
      await app.tap('inner')
      expect( log ).toEqual([ 'outer' ])
      app.done()
    })

    it('.outside: a tap anywhere but in the element, even one a .stop hides; gone with the element', async () => {
      const log: string[] = []
      const app = await mount(
        `<div><if( state.open )><div data-k="pop" on-click.outside( dismiss )><p data-k="in">in</p></div></if>`
        + `<button data-k="away" on-click.stop( away )><span>away</span></button></div>`,
        { state: { open: true }, handlers: logging( log, 'dismiss', 'away' ) } )

      await app.tap('in')
      await app.tap('pop')
      expect( log ).toEqual( [] )
      await app.tap('away')
      expect( log ).toEqual([ 'dismiss', 'away' ])
      // Closed: the element is gone, and so is its listener
      await app.tap('away')
      expect( log ).toEqual([ 'dismiss', 'away', 'away' ])
      app.done()
    })
  })
})

describe('element references: @ref (#37)', () => {
  /** What the main thread was asked to call: element, method, params, and how many flushes came first */
  const calls = () => invoked.map( ( [ el, method, params, after ] ) => [ el.localName, method, params, after ] )

  it('Lynx: focus() is input focus on an input, accessibility focus elsewhere, and runs after the flush', async () => {
    await boot( `<input data-k="f" @ref="field"><div data-k="d" @ref="box"><p>x</p></div>`,
                { handlers: { onAttach( this: any ){ this.refs.field.focus(); this.refs.box.focus() } } } )
    // Called while the elements were being created: run only after the batch that creates them is flushed
    expect( calls() ).toEqual([
      [ 'input', 'focus', {}, 1 ],
      [ 'view', 'requestAccessibilityFocus', {}, 1 ]
    ])
  })

  it('Lynx: blur, scrollTo, scrollIntoView and animate, with the arguments the DOM takes', async () => {
    const app = await boot( `<input @ref="field"><scroll-view scroll-y @ref="pane"><p @ref="row">r</p></scroll-view>` )
    const refs = app.inst.self.refs
    let anim: any
    await app.act( () => {
      refs.field.blur()
      refs.pane.scrollTo({ top: 120, behavior: 'smooth' })
      refs.pane.scrollTo( 0, 40 )
      refs.pane.scrollTo( 30, 0 )
      refs.row.scrollIntoView()
      refs.row.scrollIntoView({ behavior: 'smooth', block: 'center' })
      anim = refs.row.animate( [ { opacity: 0 }, { opacity: 1 } ], 300 )
      refs.row.animate( [ { opacity: 1 } ], { duration: 50, iterations: 2, easing: 'ease-in' })
      anim.pause(); anim.play(); anim.cancel(); anim.finish()
    })
    const id = anim.id
    expect( calls() ).toEqual([
      [ 'input', 'blur', {}, 2 ],
      [ 'scroll-view', 'scrollTo', { offset: 120, smooth: true }, 2 ],
      [ 'scroll-view', 'scrollTo', { offset: 40, smooth: false }, 2 ],
      [ 'scroll-view', 'scrollTo', { offset: 30, smooth: false }, 2 ],
      [ 'text', 'scrollIntoView', { scrollIntoViewOptions: { behavior: 'auto', block: 'start', inline: 'start' } }, 2 ],
      [ 'text', 'scrollIntoView', { scrollIntoViewOptions: { behavior: 'smooth', block: 'center', inline: 'start' } }, 2 ],
      // Lynx's own Animation: START, its id, the keyframes, the options as the DOM writes them
      [ 'text', '__ElementAnimate', [ 0, id, [ { opacity: 0 }, { opacity: 1 } ], { duration: 300 } ], 2 ],
      [ 'text', '__ElementAnimate', [ 0, expect.any( String ), [ { opacity: 1 } ], { duration: 50, iterations: 2, easing: 'ease-in' } ], 2 ],
      [ 'text', '__ElementAnimate', [ 2, id ], 2 ], [ 'text', '__ElementAnimate', [ 1, id ], 2 ], [ 'text', '__ElementAnimate', [ 3, id ], 2 ], [ 'text', '__ElementAnimate', [ 4, id ], 2 ]
    ])
  })

  it('Lynx: keepFocus focuses again what was focused, by a ref or by a focus event a template listens for', async () => {
    const app = await boot( `<input data-k="a" @ref="a"><input data-k="b" on-focus( noop ) on-blur( noop )>`, { handlers: { noop(){} } } )
    const keep = () => app.act( () => app.bg.host.keepFocus!()() )

    await app.act( () => app.inst.self.refs.a.focus() )
    invoked = []
    await keep()
    expect( calls() ).toEqual([ [ 'input', 'focus', {}, expect.any( Number ) ] ])

    await app.dispatch( '[data-k="b"]', w => new w.Event('focus') )
    invoked = []
    await keep()
    expect( invoked.map( c => c[ 0 ].dataset.k ) ).toEqual([ 'b' ])

    // Blurred: there is nothing to give focus back to
    await app.dispatch( '[data-k="b"]', w => new w.Event('blur') )
    invoked = []
    await keep()
    expect( invoked ).toEqual( [] )
  })

  /** One template, one meaning: the ref follows its element on both hosts */
  const HOSTS: Record<string, ( src: string, setup: RenderSetup ) => Promise<{ inst: any, el( k: string ): any }>> = {
    async dom( src, setup ){
      const box = document.createElement('div')
      document.body.append( box )
      const inst = renderIR( compileTemplate( src ).ir, setup )
      inst.mount( box )
      return { inst, el: k => box.querySelector(`[data-k="${k}"]`) }
    },
    async lynx( src, setup ){
      const app = await boot( src, setup )
      return { inst: app.inst, el: () => undefined }
    }
  }
  for( const [ host, mount ] of Object.entries( HOSTS ) ) it(`${host}: a ref is there while its element lives, under the name it has now`, async () => {
    const { inst, el } = await mount( `<if( state.on )><input data-k="f" @ref=state.name></if>`, { state: { on: true, name: 'field' } } )
    const refs = inst.self.refs
    expect( refs.field ).toBeTruthy()
    host === 'dom' && expect( refs.field ).toBe( el('f') )

    inst.state.name = 'search'
    await tick()
    expect( Object.keys( refs ) ).toEqual([ 'search' ])

    inst.state.on = false
    await tick()
    expect( refs ).toEqual( {} )
  })

  it('Lynx: getBoundingClientRect() answers with the box Lynx measured, after the flush, and each call its own', async () => {
    answer = el => ({ code: 0, data: { id: '', dataset: {}, left: +el.dataset.k, top: 20, right: +el.dataset.k + 100, bottom: 70, width: 100, height: 50 } })
    const app = await boot( `<div data-k="10" @ref="a"></div><div data-k="300" @ref="b"></div>` )
    const { a, b } = app.inst.self.refs
    const [ ra, rb ] = await Promise.all([ a.getBoundingClientRect(), b.getBoundingClientRect() ])
    expect( ra ).toEqual({ x: 10, y: 20, width: 100, height: 50, top: 20, right: 110, bottom: 70, left: 10 })
    expect( rb ).toMatchObject({ x: 300, left: 300, right: 400 })
    expect( calls() ).toEqual([ [ 'view', 'boundingClientRect', {}, 2 ], [ 'view', 'boundingClientRect', {}, 2 ] ])
    // Measured boxes are given a native view, once
    expect( app.page.querySelectorAll('[lips-rect]') ).toHaveLength( 2 )
    invoked = []
    await a.getBoundingClientRect()
    expect( calls() ).toHaveLength( 1 )
  })

  it('Lynx: getBoundingClientRect() is null when Lynx cannot measure the box', async () => {
    answer = () => ({ code: 6, data: 'node does not have a LynxUI' })
    const app = await boot( `<div @ref="a"></div>` )
    expect( await app.inst.self.refs.a.getBoundingClientRect() ).toBeNull()
    answer = () => ({ code: 0 })
    expect( await app.inst.self.refs.a.getBoundingClientRect() ).toBeNull()
  })

  it('Lynx: getBoundingClientRect() is null at once for what is no Lynx element: an svg\'s part', async () => {
    answer = () => ({ code: 0, data: { left: 1, top: 1, right: 2, bottom: 2, width: 1, height: 1 } })
    const app = await boot( `<svg viewBox="0 0 10 10"><rect @ref="r" width="5" height="5"/></svg>` )
    expect( await app.inst.self.refs.r.getBoundingClientRect() ).toBeNull()
    expect( calls() ).toEqual( [] )
  })

  it('dom: getBoundingClientRect() is the platform\'s, and await reads it as on Lynx', async () => {
    const box = document.createElement('div')
    document.body.append( box )
    const inst = renderIR( compileTemplate(`<div @ref="a"></div>`).ir, {} )
    inst.mount( box )
    expect( await inst.self.refs.a.getBoundingClientRect() ).toMatchObject({ x: 0, y: 0, width: 0, height: 0 })
    box.remove()
  })

  it('dom: the ref is the element, so its methods are the platform\'s', async () => {
    const box = document.createElement('div')
    document.body.append( box )
    const inst = renderIR( compileTemplate(`<input class="f" @ref="field">`).ir, {} )
    inst.mount( box )
    inst.self.refs.field.focus()
    expect( document.activeElement ).toBe( box.querySelector('.f') )
    box.remove()
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
    // A bound boolean is written out (lips#40): `true` reads as checked, `false` as not checked
    await app.act( () => app.inst.state.c = true )
    expect( value() ).toBe('checked, invalid, required')
    await app.act( () => app.inst.state.c = false )
    expect( value() ).toBe('not checked, invalid, required')
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

describe('Lynx: disabled on a button (#41)', () => {
  const TEMPLATE = `<div data-k="row" on-click( row )>`
    + `<button data-k="b" disabled=state.off aria-disabled=state.aria on-click( inc ) on-touchstart( touch )><span data-k="label">+1</span></button>`
    + `<button data-k="other" on-click( inc )>other</button></div>`
    + `<div data-k="menu" on-click.outside( out )><span>menu</span></div>`
    + `<input data-k="in" disabled=state.off>`
  const setup = ( off: unknown ) => ({
    state: { off, aria: undefined as unknown, n: 0, rows: 0, outs: 0, touches: 0 },
    handlers: { touch( this: any ){ this.state.touches++ }, inc( this: any ){ this.state.n++ }, row( this: any ){ this.state.rows++ }, out( this: any ){ this.state.outs++ } }
  })
  const counts = ( app: any ) => [ app.inst.state.n, app.inst.state.rows, app.inst.state.outs ]
  /** A tap as Lynx dispatches it, bubbling: from the element, or from its raw text, which Lynx for Web hit-tests to */
  const tap = ( app: any, k: string ) => app.dispatch( `[data-k="${k}"]`, ( w: any ) => new w.Event( 'tap', { bubbles: true }) )
  const tapText = async ( app: any, k: string ) => {
    env.switchToMainThread()
    const text = app.q(`[data-k="${k}"]`).firstChild
    expect( text.nodeType ).toBe( 3 )
    text.dispatchEvent( new env.env.window.Event( 'tap', { bubbles: true }) )
    env.switchToBackgroundThread()
    await tick()
  }

  it('a tap on it, or inside it, reaches no handler: its own, one above it, or one outside', async () => {
    const app = await boot( TEMPLATE, setup( true ) )
    await tap( app, 'b' )
    await tap( app, 'label' )
    await tapText( app, 'label' )
    expect( counts( app ) ).toEqual([ 0, 0, 0 ])

    // Another button in the same row is not disabled
    await tap( app, 'other' )
    expect( counts( app ) ).toEqual([ 1, 1, 1 ])

    // HTML blocks a disabled control's clicks only: a touch still reaches it
    await app.dispatch( '[data-k="b"]', ( w: any ) => new w.Event( 'touchstart', { bubbles: true }) )
    expect( app.inst.state.touches ).toBe( 1 )
  })

  it('carries the disabled state as aria-disabled does, and is not sent as an attribute', async () => {
    const app = await boot( TEMPLATE, setup( true ) )
    const b = app.q('[data-k="b"]')
    expect( b.getAttribute('accessibility-value') ).toBe('disabled')
    expect( b.hasAttribute('disabled') ).toBe( false )
    // HTML's disabled wins over aria-disabled="false"
    await app.act( () => app.inst.state.aria = 'false' )
    expect( b.getAttribute('accessibility-value') ).toBe('disabled')
  })

  it('enabled again, both come back', async () => {
    const app = await boot( TEMPLATE, setup( true ) )
    await app.act( () => app.inst.state.off = false )
    expect( app.q('[data-k="b"]').hasAttribute('accessibility-value') ).toBe( false )
    await tapText( app, 'label' )
    expect( counts( app ) ).toEqual([ 1, 1, 1 ])

    await app.act( () => app.inst.state.off = true )
    await tap( app, 'b' )
    expect( counts( app ) ).toEqual([ 1, 1, 1 ])
    expect( app.q('[data-k="b"]').getAttribute('accessibility-value') ).toBe('disabled')
  })

  it('a present attribute disables, as in HTML; on an input it stays the input\'s own', async () => {
    const app = await boot( `<button data-k="b" disabled on-click( inc )>x</button><input data-k="in" disabled>`, setup( true ) )
    await tap( app, 'b' )
    expect( app.inst.state.n ).toBe( 0 )
    expect( app.q('[data-k="in"]').getAttribute('disabled') ).toBe('true')
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

// ------------------------------------------------------------ equal writes
describe('background host: an equal write is not sent (#39, L4)', () => {
  const rows = ( step: number ) => Array.from({ length: 20 }, ( _, i ) => ({ id: i, label: i % 10 ? `row ${i}` : `row ${i} · ${step}` }) )
  const ops = ( batches: unknown[][] ) => batches.flatMap( b => opsOf( b as any[] ) )

  it('a replaced array sends the rows that changed, and the same array sends nothing', async () => {
    const batches: unknown[][] = []
    const bg = createBackgroundHost( ops => batches.push( ops ) )
    const inst = renderIR<LynxNode>( tree(`<p>Count: {state.n}</p><for [row] in=state.rows by="id"><div data-k={row.id} class={row.id % 2 ? 'odd' : 'even'} style="--w:{row.id}px"><p>{row.label}</p></div></for>`),
      { state: { n: 0, rows: rows( 0 ) } }, { host: bg.host })
    inst.mount( bg.root )
    await tick()

    batches.length = 0
    inst.state.n = 1
    inst.state.rows = rows( 1 )
    await tick()
    // The count and rows 0 and 10: nothing else differs
    expect( ops( batches ).map( o => [ o[ 0 ], o[ 2 ] ] ) ).toEqual([ [ OP.SET_TEXT, 'Count: 1' ], [ OP.SET_TEXT, 'row 0 · 1' ], [ OP.SET_TEXT, 'row 10 · 1' ] ])

    batches.length = 0
    inst.state.rows = [ ...inst.state.rows ]
    await tick()
    expect( ops( batches ) ).toEqual( [] )
  })

  it('a changed value is still sent, and a removal once', async () => {
    const batches: unknown[][] = []
    const bg = createBackgroundHost( ops => batches.push( ops ) )
    const inst = renderIR<LynxNode>( tree(`<div data-k={state.k} title={state.t} style="--w:{state.w}"><p>{state.k}</p></div>`),
      { state: { k: 'a', t: 'x', w: '1px' } }, { host: bg.host })
    inst.mount( bg.root )
    await tick()
    batches.length = 0

    inst.state.k = 'b'
    inst.state.t = null
    inst.state.w = '2px'
    await tick()
    const sent = ops( batches ).map( o => o.slice( 0, 1 ).concat( o.slice( 2 ) ) )
    expect( sent ).toContainEqual([ OP.ATTR, 'data-k', 'b' ])
    expect( sent ).toContainEqual([ OP.ATTR, 'title', null ])
    expect( sent ).toContainEqual([ OP.SET_TEXT, 'b' ])
    expect( sent.filter( o => o[ 0 ] === OP.STYLES ) ).toEqual([ [ OP.STYLES, '--w:2px' ] ])

    batches.length = 0
    inst.state.t = undefined
    await tick()
    expect( ops( batches ) ).toEqual( [] )

    // A bound custom property (a reactive declaration): sent when it changes, and once when it goes
    const box = bg.host.element('div')
    bg.host.insert( bg.root, box, null )
    await tick()
    batches.length = 0
    for( const v of [ '1px', '1px', '2px', null, null ] ) bg.host.styleVar!( box, '--h', v )
    await tick()
    expect( ops( batches ).map( o => o[ 2 ] ) ).toEqual([ '--h: 1px', '--h: 2px', '' ])
  })
})
