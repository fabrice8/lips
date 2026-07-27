import { describe, it, expect, beforeEach, vi } from 'vitest'
import Lips from '../src/lips'
import { compileTemplate } from '../src/ir/compiler'

/**
 * Patterns taken from the Modela editor codebase (modelaway/editor).
 * Each spec mirrors real usage from its factory components, so the
 * engine is verified against an actual application, not toy templates.
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
const q = ( s: string ) => document.querySelector( s )
const qa = ( s: string ) => [ ...document.querySelectorAll( s ) ]

let lips: any
beforeEach( () => {
  document.body.innerHTML = '<div id="app"></div>'
  lips = new Lips()
})

describe('reactive Map state (layers tree)', () => {
  it('renders a Map with <for> and reacts to .set()', async () => {
    const c = lips.render('layers', {
      state: { layers: new Map([ [ 'l1', { name: 'Layer 1' } ] ]) },
      default: `<ul><for [key, layer] in=state.layers><li class="l">{key}:{layer.name}</li></for></ul>`
    })
    c.appendTo('#app')

    await settle( () => qa('.l').length === 1 )
    expect( q('.l')?.textContent ).toBe('l1:Layer 1')

    // in-place mutation — Modela's Traverser builds Maps this way
    c.state.layers.set('l2', { name: 'Layer 2' })
    await settle( () => qa('.l').length === 2 )
    expect( qa('.l')[1].textContent ).toBe('l2:Layer 2')
  })

  it('reacts to .delete() and .clear()', async () => {
    const c = lips.render('layers-del', {
      state: { layers: new Map([ [ 'a', { name: 'A' } ], [ 'b', { name: 'B' } ] ]) },
      default: `<ul><for [key, layer] in=state.layers><li class="l">{layer.name}</li></for></ul>`
    })
    c.appendTo('#app')
    await settle( () => qa('.l').length === 2 )

    c.state.layers.delete('a')
    await settle( () => qa('.l').length === 1 )
    expect( q('.l')?.textContent ).toBe('B')

    c.state.layers.clear()
    await settle( () => qa('.l').length === 0 )
  })

  it('reacts to whole-Map replacement (onContext rebuild)', async () => {
    const c = lips.render('layers-swap', {
      state: { layers: new Map([ [ 'x', { name: 'X' } ] ]) },
      default: `<ul><for [key, layer] in=state.layers><li class="l">{layer.name}</li></for></ul>`
    })
    c.appendTo('#app')
    await settle( () => q('.l')?.textContent === 'X' )

    // Modela does exactly this in onContext when the frame changes
    c.state.layers = new Map([ [ 'y', { name: 'Y' } ], [ 'z', { name: 'Z' } ] ])
    await settle( () => qa('.l').length === 2 )
    expect( qa('.l').map( e => e.textContent ) ).toEqual([ 'Y', 'Z' ])
  })

  it('tracks nested Maps in a recursive tree', async () => {
    const child = new Map([ [ 'c1', { name: 'Child' } ] ])
    const c = lips.render('nested-map', {
      state: { layers: new Map([ [ 'root', { name: 'Root', layers: child } ] ]) },
      default: `
        <div>
          <for [key, layer] in=state.layers>
            <b class="parent">{layer.name}</b>
            <for [ck, cl] in=layer.layers><i class="child">{cl.name}</i></for>
          </for>
        </div>`
    })
    c.appendTo('#app')

    await settle( () => qa('.child').length === 1 )

    // mutate the nested Map through the tree
    c.state.layers.get('root').layers.set('c2', { name: 'Child 2' })
    await settle( () => qa('.child').length === 2 )
  })

  it('propagates .set() through a component input (layers → layerlist)', async () => {
    /**
     * The parent's `state.layers` and the child's `input.list` are
     * the SAME Map reached through two reactive stores. A mutation
     * through either must notify both — the exact shape Modela's
     * layers panel uses.
     */
    lips.register('inner', {
      default: `<ul><for [k, v] in=input.list><li class="i">{v.name}</li></for></ul>`
    })

    const c = lips.render('outer', {
      state: { layers: new Map([ [ 'a', { name: 'A' } ] ]) },
      default: `<div><for [k, v] in=state.layers><b class="d">{v.name}</b></for><inner list=state.layers/></div>`
    })
    c.appendTo('#app')
    await settle( () => qa('.i').length === 1 && qa('.d').length === 1 )

    c.state.layers.set('b', { name: 'B' })

    // both the direct render AND the child component update
    await settle( () => qa('.d').length === 2 )
    await settle( () => qa('.i').length === 2 )
  })

  it('supports reactive Set state', async () => {
    const c = lips.render('selection', {
      state: { selection: new Set([ 'a' ]) },
      default: `<div><for [k] in=state.selection><i class="s">{k}</i></for></div>`
    })
    c.appendTo('#app')
    await settle( () => qa('.s').length === 1 )

    c.state.selection.add('b')
    await settle( () => qa('.s').length === 2 )
  })
})

describe('macro spread arguments (toolbar/quickset)', () => {
  const MACROS = `
    <macro [key, type, active, label, icon] name="option">
      <mli class="opt" data-key=key data-type=type data-active=active>
        <micon class=icon/>
        <if( label )><mlabel class="lbl">{label}</mlabel></if>
      </mli>
    </macro>`

  it('spreads an object into macro arguments', async () => {
    // <option type="tool" key=key ...each/> — verbatim Modela toolbar
    lips.render('toolbar', {
      macros: MACROS,
      state: { tools: new Map([ [ 'pen', { icon: 'bx-pen', label: 'Pen', active: true } ] ]) },
      default: `
        <mul><for [key, each] in=state.tools>
          <option type="tool" key=key ...each/>
        </for></mul>`
    }).appendTo('#app')

    await settle( () => !!q('.opt') )
    expect( q('.opt')?.getAttribute('data-key') ).toBe('pen')
    expect( q('.opt')?.getAttribute('data-type') ).toBe('tool')
    expect( q('.lbl')?.textContent ).toBe('Pen')
    expect( q('micon')?.getAttribute('class') ).toBe('bx-pen')
  })

  it('applies sets in source order — later overrides earlier', async () => {
    lips.render('order', {
      macros: MACROS,
      state: { spread: { key: 'from-spread' } },
      default: `<div>
        <option key="explicit" ...state.spread/>
        <option ...state.spread key="explicit"/>
      </div>`
    }).appendTo('#app')

    await settle( () => qa('.opt').length === 2 )
    // spread after explicit → spread wins
    expect( qa('.opt')[0].getAttribute('data-key') ).toBe('from-spread')
    // explicit after spread → explicit wins
    expect( qa('.opt')[1].getAttribute('data-key') ).toBe('explicit')
  })

  it('keeps spread arguments reactive', async () => {
    const c = lips.render('reactive-spread', {
      macros: MACROS,
      state: { opt: { key: 'k1', label: 'First' } },
      default: `<div><option ...state.opt/></div>`
    })
    c.appendTo('#app')
    await settle( () => q('.lbl')?.textContent === 'First' )

    c.state.opt = { key: 'k2', label: 'Second' }
    await settle( () => q('.lbl')?.textContent === 'Second' )
    expect( q('.opt')?.getAttribute('data-key') ).toBe('k2')
  })

  it('exposes all spread keys through `arguments`', async () => {
    // Modela passes `arguments` to handlers: on-click( onHandleOption, type, key, arguments )
    let received: any = null

    lips.render('args', {
      macros: `
        <macro [key] name="opt">
          <button class="b" on-click( pick, key, arguments )>x</button>
        </macro>`,
      state: { each: { key: 'k', extra: 'e', deep: { n: 1 } } },
      handler: {
        pick( key: string, args: any ){ received = { key, args } }
      },
      default: `<div><opt ...state.each/></div>`
    }).appendTo('#app')

    await settle( () => !!q('.b') )
    ;( q('.b') as HTMLButtonElement ).click()

    expect( received.key ).toBe('k')
    expect( received.args.extra ).toBe('e')
    expect( received.args.deep ).toEqual({ n: 1 })
  })

  it('drops keys that disappear from a spread', async () => {
    const c = lips.render('drop', {
      macros: MACROS,
      state: { opt: { key: 'k', label: 'Has label' } },
      default: `<div><option ...state.opt/></div>`
    })
    c.appendTo('#app')
    await settle( () => !!q('.lbl') )

    c.state.opt = { key: 'k' }   // label gone
    await settle( () => !q('.lbl') )
  })
})

describe('component node + lifecycle events (controls)', () => {
  it('exposes self.node as live elements', async () => {
    let nodes: any = null

    lips.render('noded', {
      handler: {
        onMount( this: any ){ nodes = this.node }
      },
      default: `<mblock class="panel"><span>x</span></mblock>`
    }).appendTo('#app')

    await settle( () => nodes !== null )
    expect( nodes.length ).toBe( 1 )
    expect( nodes[0] ).toBe( q('.panel') )
  })

  it('emits component:attached / :detached on the self bus', async () => {
    // Movable/Sortable bind exactly this way
    const seen: string[] = []

    const c = lips.render('bus', {
      handler: {
        onCreate( this: any ){
          this.on('component:attached', () => seen.push('attached') )
          this.on('component:detached', () => seen.push('detached') )
        }
      },
      default: `<mblock class="movable">x</mblock>`
    })

    expect( seen ).toEqual( [] )   // not attached before mount

    c.appendTo('#app')
    await settle( () => seen.includes('attached') )

    c.destroy()
    expect( seen ).toEqual([ 'attached', 'detached' ])
  })

  it('gives nested components their own node and bus', async () => {
    let childNode: any = null
    const seen: string[] = []

    lips.register('child', {
      handler: {
        onCreate( this: any ){ this.on('component:attached', () => seen.push('child-attached') ) },
        onMount( this: any ){ childNode = this.node }
      },
      default: `<mli class="c">child</mli>`
    })

    lips.render('host', { default: `<mul><child/></mul>` }).appendTo('#app')

    await settle( () => seen.length === 1 )
    expect( childNode[0] ).toBe( q('.c') )
  })

  it('passes input to onInput handlers', async () => {
    // Modela: onInput({ host, settings })
    let got: any = null

    lips.register('paneled', {
      handler: {
        onInput( input: any ){ got = input }
      },
      default: `<mblock>{input.host.title}</mblock>`
    })

    lips.render('input-host', {
      state: { host: { title: 'Frame A' } },
      default: `<div><paneled host=state.host settings="x"/></div>`
    }).appendTo('#app')

    await settle( () => got !== null )
    expect( got.host.title ).toBe('Frame A')
    expect( got.settings ).toBe('x')
  })
})

describe('mutually recursive components (layerlist ↔ layeritem)', () => {
  it('renders a recursive layer tree', async () => {
    lips.register('layerlist', {
      default: `
        <mul class="list">
          <for [key, each] in=input.list>
            <layeritem ...each depth=input.depth/>
          </for>
        </mul>`
    })
    lips.register('layeritem', {
      default: `
        <mli class="item" data-depth=input.depth>
          <mlabel>{input.name}</mlabel>
          <if( input.layers )>
            <layerlist list=input.layers depth=(input.depth + 1)/>
          </if>
        </mli>`
    })

    const tree = new Map([
      [ 'a', { name: 'A', layers: new Map([ [ 'a1', { name: 'A1' } ] ]) } ],
      [ 'b', { name: 'B' } ]
    ])

    lips.render('tree', {
      state: { layers: tree },
      default: `<div><layerlist list=state.layers depth=0/></div>`
    }).appendTo('#app')

    await settle( () => qa('.item').length === 3 )

    const labels = qa('.item mlabel').map( e => e.textContent )
    expect( labels ).toContain('A')
    expect( labels ).toContain('A1')
    expect( labels ).toContain('B')

    // nesting depth propagated
    const depths = qa('.item').map( e => e.getAttribute('data-depth') )
    expect( depths ).toContain('1')
  })
})

describe('<let> spread diagnostic', () => {
  it('reports spread on <let> with an actionable hint', () => {
    const { diagnostics } = compileTemplate(`<div><let ...state.suggestions/><p>{x}</p></div>`)
    const d = diagnostics.find( d => d.code === 'LIPS-C013' )!

    expect( d ).toBeDefined()
    expect( d.severity ).toBe('error')
    expect( d.hint ).toContain('one variable')
  })
})
