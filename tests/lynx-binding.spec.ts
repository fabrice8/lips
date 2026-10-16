/**
 * RFC-006 L1 — the Lynx renderer spike, test tier A.
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
 * One shim: the environment implements only the ReactLynx-era `__AddEvent`,
 * not `__AddEventListener` / `__RemoveEventListener`, which official
 * guidance requires (RFC-006 §5). The two lines below map them onto the
 * jsdom element's own listeners. Real event binding is exercised by the
 * Lynx for Web run, not here.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { LynxTestingEnv } from '@lynx-js/testing-environment'
import { compileTemplate } from '../src/ir/compiler'
import { compileStyle } from '../src/ir/style'
import { renderIR, type RenderSetup, type RuntimeOptions } from '../src/ir/runtime'
import { createBackgroundHost, connectBackground, type LynxNode, type BackgroundHost } from '../src/lynx/background'
import { connectMain } from '../src/lynx/main'
import * as OP from '../src/lynx/protocol'

const G = globalThis as any

let env: LynxTestingEnv

beforeEach( () => {
  // vitest's own jsdom window: the environment's elements live in its document
  env = new LynxTestingEnv({ window: window as any })
  // Its Element PAPI looks itself up here, as its vitest preset would install it
  G.lynxTestingEnv = env
  G.lynxEnv = env.env
  Object.assign( env.mainThread.globalThis, {
    __AddEventListener: ( el: any, name: string, fn: any ) => el.addEventListener( name, fn ),
    __RemoveEventListener: ( el: any, name: string, fn: any ) => el.removeEventListener( name, fn )
  })
})

const tree = ( src: string ) => {
  const { ir, diagnostics } = compileTemplate( src, { target: 'tree' })
  expect( diagnostics, src ).toEqual( [] )
  return ir
}
const tick = () => new Promise<void>( r => setTimeout( r, 0 ) )

/** The main thread's tree: tags and raw text, in order */
const snapPage = ( el: any ): any => el.nodeType === 3
  ? el.data
  : { t: el.localName, ...( el.childNodes.length ? { c: [ ...el.childNodes ].map( snapPage ) } : {} ) }

/** What it must equal: the shadow tree's REAL nodes, in order */
function snapShadow( n: LynxNode ): any[] {
  const out: any[] = []
  for( let c = n.first; c; c = c.next ){
    if( !c.real ) continue
    const kids = snapShadow( c )
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
      stylesheet: compileStyle(`.card { width: {input.w}px }`, { nsp: 'card' }).ir
    }
    const app = await boot( `<card label=state.l w=state.w/>`, { state: { l: 'L', w: 10 } }, { components: { card } } )

    const el = app.q('view')
    expect( el.className ).toBe('card lips-card')
    expect( el.getAttribute('style') ).toBe('--card-0: 10')

    await app.act( () => app.inst.state.w = 20 )
    expect( el.getAttribute('style') ).toBe('--card-0: 20')
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
