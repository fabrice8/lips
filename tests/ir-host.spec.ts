/**
 * The host seam (RFC-006 §4.1, roadmap L0).
 *
 * The runtime specs prove the DOM host. This file proves the seam: the
 * SAME IR renders through the DOM host and through the in-memory tree
 * host, the same actions run against both, and after every step the two
 * trees must be identical — markers, text runs, attributes, inline
 * variables and stylesheet scopes alike. Every executor is covered, plus
 * events, lifecycle, swap and dispose.
 *
 * It also pins the compiler side: `target: 'tree'` emits a node tree
 * whose paths agree with the parsed `html`, and nothing changes for the
 * default target.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { compileTemplate, type NodeIR, type BlockIR, type TemplateIR } from '../src/ir/compiler'
import { compileStyle } from '../src/ir/style'
import { renderIR, type RenderSetup, type RuntimeOptions, type IRInstance } from '../src/ir/runtime'
import { signal, reactive } from '../src/ir/signal'
import { treeHost, treeRoot, childrenOf, dispatch, type TreeNode } from '../src/ir/tree'
import { precompile } from '../src/precompile'

// ------------------------------------------------------------- snapshots
type Snap = string | { m: string } | { t: string, a?: Record<string, string>, v?: Record<string, string>, s?: string, c?: Snap[] }

/**
 * One shape for both hosts. The DOM's `rel` is its scope stamp, so it
 * maps to `s`; `style` is left out because the DOM folds inline
 * variables into it — they are compared as `v` instead.
 */
function snapDom( n: Node ): Snap {
  if( n.nodeType === 3 ) return ( n as Text ).data
  if( n.nodeType === 8 ) return { m: ( n as Comment ).data }

  const el = n as HTMLElement, out: any = { t: el.localName }, a: Record<string, string> = {}, v: Record<string, string> = {}

  for( const { name, value } of [ ...el.attributes ] )
    name === 'rel' ? out.s = value : name !== 'style' && ( a[ name ] = value )
  for( let i = 0; i < el.style.length; i++ )
    el.style[ i ].startsWith('--') && ( v[ el.style[ i ] ] = el.style.getPropertyValue( el.style[ i ] ) )

  Object.keys( a ).length && ( out.a = a )
  Object.keys( v ).length && ( out.v = v )
  el.childNodes.length && ( out.c = [ ...el.childNodes ].map( snapDom ) )
  return out
}

function snapTree( n: TreeNode ): Snap {
  if( n.type === '#text' ) return n.value
  if( n.type === '#marker' ) return { m: n.value }

  const out: any = { t: n.type }, a = { ...n.attrs }
  delete a.style

  Object.keys( a ).length && ( out.a = a )
  Object.keys( n.vars ).length && ( out.v = { ...n.vars } )
  n.scope && ( out.s = n.scope )
  n.first && ( out.c = childrenOf( n ).map( snapTree ) )
  return out
}

// --------------------------------------------------------------- harness
const tree = ( src: string, macros?: string ) => {
  const { ir, diagnostics } = compileTemplate( src, { target: 'tree', macros })
  expect( diagnostics, src ).toEqual( [] )
  return ir
}

type Both = {
  dom: IRInstance<Node>
  tree: IRInstance<TreeNode>
  app: HTMLElement
  root: TreeNode
  check(): void
  /** Run the same action on both instances, then compare */
  act( fn: ( inst: IRInstance<any> ) => void ): void
  /** Fire `name` on the element carrying `data-k="<k>"` in both trees */
  fire( k: string, name?: string ): void
}

/**
 * `setup`/`options` are FACTORIES: each host needs its own state
 * objects, or one instance's writes would drive the other's effects.
 */
function both(
  ir: TemplateIR,
  setup: () => RenderSetup = () => ({}),
  options: () => RuntimeOptions = () => ({})
): Both {
  const app = document.createElement('div')
  document.body.appendChild( app )
  const dom = renderIR( ir, setup(), options() )
  dom.mount( app )

  const root = treeRoot()
  const t = renderIR<TreeNode>( ir, setup(), { ...options(), host: treeHost })
  t.mount( root )

  const check = () => expect( childrenOf( root ).map( snapTree ) ).toEqual( [ ...app.childNodes ].map( snapDom ) )
  check()

  const findTree = ( n: TreeNode, k: string ): TreeNode | undefined => {
    if( n.attrs['data-k'] === k ) return n
    for( const c of childrenOf( n ) ){
      const hit = findTree( c, k )
      if( hit ) return hit
    }
  }

  return {
    dom, tree: t, app, root, check,
    act( fn ){ fn( dom ); fn( t ); check() },
    fire( k, name = 'click' ){
      const el = app.querySelector(`[data-k="${k}"]`)
      const tn = findTree( root, k )
      expect( el, `DOM element ${k}` ).not.toBeNull()
      expect( tn, `tree element ${k}` ).toBeDefined()
      el!.dispatchEvent( new Event( name ) )
      dispatch( tn!, name )
      check()
    }
  }
}

beforeEach( () => { document.body.innerHTML = '' } )

// -------------------------------------------------------------- compiler
describe('compiler: the tree target', () => {
  it('emits nodes beside html, with text runs, anchors and static attributes', () => {
    const ir = tree(`<div class="a" hidden>hi <b>x</b>{state.y}<br></div>`)

    expect( ir.root.html ).toBe('<div class="a" hidden>hi <b>x</b><!--$--><br></div>')
    expect( ir.root.nodes ).toEqual([
      [ 'div', { class: 'a', hidden: '' }, [ 'hi ', [ 'b', {}, [ 'x' ] ], 0, [ 'br' ] ] ]
    ])
  })

  it('leaves the default target byte-for-byte as it was: no nodes key anywhere', () => {
    const { ir } = compileTemplate(`<div><if( state.a )><p>{state.b}</p></if><!-- note --></div>`)
    expect( JSON.stringify( ir ) ).not.toContain('"nodes"')
    expect( ir.root.html ).toContain('<!-- note -->')
  })

  it('drops comments from both forms, so the text around them coalesces alike', () => {
    const src = `<p>a<!-- c -->b<i>{state.x}</i></p>`
    const ir = tree( src )

    expect( ir.root.html ).toBe('<p>ab<i><!--$--></i></p>')
    expect( ir.root.nodes ).toEqual([ [ 'p', {}, [ 'ab', [ 'i', {}, [ 0 ] ] ] ] ])
    expect( ir.root.binds[ 0 ].p ).toEqual([ 0, 1, 0 ])
    // The DOM target keeps the comment, and its path counts it
    expect( compileTemplate( src ).ir.root.binds[ 0 ].p ).toEqual([ 0, 3, 0 ])
  })

  it('keeps the first of a repeated attribute, like the HTML parser', () => {
    const ir = tree(`<i title="one" title="two"></i>`)
    const dom = document.createElement('template')
    dom.innerHTML = ir.root.html

    expect( ( dom.content.firstChild as Element ).getAttribute('title') ).toBe('one')
    expect( ir.root.nodes ).toEqual([ [ 'i', { title: 'one' } ] ])
  })

  it('carries nodes into every nested block', () => {
    const ir = tree(`<ul><for [x] in=state.xs><li>{x}</li></for></ul><if( state.a )><b>y</b></if>`)
    const kinds = ( b: BlockIR ): any[] => [ b.nodes, ...b.blocks.flatMap( ( c: any ) =>
      c.block ? kinds( c.block ) : c.branches ? c.branches.flatMap( ( br: any ) => kinds( br.block ) ) : [] ) ]

    expect( kinds( ir.root ).every( Boolean ) ).toBe( true )
  })

  /**
   * The property that makes one path table serve both hosts: every bind
   * and block path lands on the same kind of node whether it is walked
   * through the parsed `html` or through `nodes`.
   */
  it('resolves every path to the same node in html and in nodes', () => {
    const SOURCES = [
      `<div>a<b>{state.x}</b>c{state.y}<i>z</i></div>`,
      `<section><h1 i18n>Hi</h1><p title=state.t>{state.a}{state.b}</p></section>`,
      `<ul><for [x, i] in=state.xs><li data-i=i>{x}<if( i )>,</if></li></for></ul>`,
      `<div>t1<!-- dropped -->t2<switch( state.k )><case is="a">A</case><default>D</default></switch>tail</div>`,
      `<let n=state.n/><p>{n}</p><card label=n><em>{n}</em></card>`,
      `<div><{state.tag} data-x="1"/><async await( state.p )><then [v]>{v}</then></async></div>`
    ]

    const viaNodes = ( nodes: NodeIR[], p: number[] ) => {
      let level: NodeIR[] = nodes, n: NodeIR = 0
      for( const i of p ){
        n = level[ i ]
        level = Array.isArray( n ) ? n[ 2 ] || [] : []
      }
      return n
    }
    const kindOfNode = ( n: NodeIR ) => n === 0 ? 'anchor' : typeof n === 'string' ? 'text' : n[ 0 ]
    const kindOfDom = ( n: Node ) => n.nodeType === 8 ? 'anchor' : n.nodeType === 3 ? 'text' : ( n as Element ).localName

    const walk = ( b: BlockIR ) => {
      const tpl = document.createElement('template')
      tpl.innerHTML = b.html

      for( const x of [ ...b.binds, ...b.blocks ] ){
        let d: Node = tpl.content
        for( const i of x.p ) d = d.childNodes[ i ]
        expect( kindOfNode( viaNodes( b.nodes!, x.p ) ), `${b.html} @ ${x.p}` ).toBe( kindOfDom( d ) )
      }
      for( const c of b.blocks as any[] ){
        c.block && walk( c.block )
        c.branches?.forEach( ( br: any ) => walk( br.block ) )
        c.cases?.forEach( ( k: any ) => walk( k.block ) )
        c.contents && walk( c.contents.block )
        c.then && walk( c.then.block )
      }
    }

    for( const src of SOURCES ) walk( tree( src ).root )
  })

  it('reports @html for the tree target and drops the bind', () => {
    const { ir, diagnostics } = compileTemplate(`<div @html=state.raw></div>`, { target: 'tree' })

    expect( diagnostics.map( d => d.code ) ).toEqual([ 'LIPS-C021' ])
    expect( ir.root.binds ).toEqual( [] )
    // The DOM target is untouched
    expect( compileTemplate(`<div @html=state.raw></div>`).diagnostics ).toEqual( [] )
  })

  it('threads the target through precompile', () => {
    const { template } = precompile({ default: `<p>{state.a}</p>` }, { target: 'tree' })
    expect( template.ir.root.nodes ).toEqual([ [ 'p', {}, [ 0 ] ] ])
    expect( precompile({ default: `<p>{state.a}</p>` }).template.ir.root.nodes ).toBeUndefined()
  })
})

// ---------------------------------------------------------------- runtime
describe('tree host: refuses IR it cannot build', () => {
  it('names the compile option when the IR has no node tree', () => {
    const { ir } = compileTemplate(`<p>x</p>`)
    expect( () => renderIR( ir, {}, { host: treeHost }) ).toThrow(/target: 'tree'/)
  })

  it('renders @html as text when an IR carries one anyway', () => {
    const ir = tree(`<div>{state.raw}</div>`)
    ir.root.binds = [ { t: 'prop', p: [ 0 ], name: 'html', e: ir.root.binds[ 0 ].e } ]

    const root = treeRoot()
    renderIR<TreeNode>( ir, { state: { raw: '<b>x</b>' } }, { host: treeHost }).mount( root )
    expect( snapTree( childrenOf( root )[ 1 ] ) ).toEqual({ t: 'div', c: [ '<b>x</b>' ] })
  })
})

describe('host parity: binds', () => {
  it('text, attribute, spread and @text binds', () => {
    const b = both( tree(`
      <div id=state.id data-on=state.on ...state.extra>
        Hi {state.name}! <span @text=state.t></span>
      </div>`),
      () => ({ state: { id: 'a', on: true, extra: { 'data-x': '1', 'data-y': '2' }, name: 'Ada', t: 'plain' } }) )

    b.act( i => { i.state.name = 'Grace'; i.state.id = 'b' })
    b.act( i => { i.state.on = false; i.state.t = '' })
    b.act( i => { i.state.extra = { 'data-y': '3' } })
    b.act( i => { i.state.name = null })
  })

  it('element events with declared arguments', () => {
    const b = both( tree(`<output>{state.n}</output><button data-k="inc" on-click( add, 2 )>+</button>`),
      () => ({ state: { n: 0 }, handlers: { add( this: any, by: number ){ this.state.n += by } } }) )

    b.fire('inc')
    b.fire('inc')
    expect( b.dom.state.n ).toBe( 4 )
    expect( b.tree.state.n ).toBe( 4 )
  })

  it('i18n text and attribute binds follow the language signal', () => {
    const [ lang, setLang ] = signal('en')
    const i18n = {
      translate: ( text: string, key?: string, l?: string ) => `${l ?? lang()}:${key ?? text}`,
      format: ( ref: string, params: any, l?: string ) => `${l ?? lang()}:${ref}:${params.n}`,
      lang
    }
    const b = both( tree(`
      <h1 i18n="hero">Welcome</h1>
      <input i18n placeholder="Search">
      <p @format="count, { n: state.n }"></p>
      <i18n lang=state.doc><span i18n>Body</span></i18n>`),
      () => ({ state: { n: 1, doc: 'fr' } }), () => ({ i18n }) )

    setLang('de')
    b.check()
    b.act( i => { i.state.n = 2; i.state.doc = 'ja' })
  })
})

describe('host parity: control flow', () => {
  it('if / else-if / else', () => {
    const b = both( tree(`<div><if( state.k === 'a' )><b>A</b></if><else-if( state.k === 'b' )>B{state.x}</else-if><else><i>none</i></else></div>`),
      () => ({ state: { k: 'a', x: 1 } }) )

    b.act( i => i.state.k = 'b' )
    b.act( i => i.state.x = 2 )
    b.act( i => i.state.k = 'z' )
    b.act( i => i.state.k = 'a' )
  })

  it('switch with literal, list and default cases', () => {
    const b = both( tree(`<switch( state.v )><case is="1"><b>one</b></case><case is=state.many>many</case><default>other</default></switch>`),
      () => ({ state: { v: '1', many: [ 'x', 'y' ] } }) )

    b.act( i => i.state.v = 'y' )
    b.act( i => i.state.v = 'q' )
  })

  it('keyed for: insert, remove, reorder, update in place', () => {
    const b = both( tree(`<ul><for [row, i] in=state.rows by="id"><li data-i=i>{row.label}</li></for></ul>`),
      () => ({ state: { rows: [ { id: 1, label: 'a' }, { id: 2, label: 'b' }, { id: 3, label: 'c' } ] } }) )

    b.act( i => i.state.rows = [ i.state.rows[ 2 ], i.state.rows[ 0 ], { id: 4, label: 'd' } ] )
    b.act( i => i.state.rows = [ { id: 4, label: 'D' }, { id: 1, label: 'a' } ] )
    b.act( i => i.state.rows = [] )
    b.act( i => i.state.rows = [ { id: 9, label: 'z' } ] )
  })

  it('for over ranges, maps and objects', () => {
    const b = both( tree(`
      <for [n] from=1 to=state.max><i>{n}</i></for>
      <for [k, v] in=state.obj><b>{k}={v}</b></for>
      <for [k, v] in=state.map><u>{k}:{v}</u></for>`),
      () => ({ state: { max: 3, obj: { a: 1, b: 2 }, map: new Map([ [ 'x', 1 ] ]) } }) )

    b.act( i => { i.state.max = 1; i.state.obj = { b: 3, c: 4 } })
    b.act( i => i.state.map = new Map([ [ 'y', 2 ], [ 'x', 1 ] ]) )
  })

  it('let and const', () => {
    const b = both( tree(`<let total=state.a+state.b/><const unit="px"/><p>{total}{unit}</p>`),
      () => ({ state: { a: 1, b: 2 } }) )

    b.act( i => i.state.a = 10 )
  })

  it('macros with declared args, spreads and arguments', () => {
    const MACROS = `<macro [label, tone] name="chip"><em class=tone>#{label} {arguments.extra}</em></macro>`
    const b = both( tree(`<div><chip label=state.l ...state.more/><chip label="fixed" tone="x"/></div>`, MACROS ),
      () => ({ state: { l: 'one', more: { tone: 'hot', extra: '!' } } }) )

    b.act( i => i.state.l = 'two' )
    b.act( i => i.state.more = { extra: '?' } )
  })

  it('context layers', () => {
    const b = both( tree(`<p>{context.sel}</p><context sel=state.local><b>{context.sel}/{context.other}</b></context>`),
      () => ({ state: { local: 'inner' }, context: reactive({ sel: 'outer', other: 'o' }) }) )

    b.act( i => i.state.local = 'changed' )
  })

  it('async: loading, then, catch, and a newer promise winning', async () => {
    const make = () => {
      let resolve!: ( v: any ) => void, reject!: ( e: any ) => void
      const p = new Promise( ( a, b ) => { resolve = a; reject = b })
      return { p, resolve, reject }
    }
    const jobs = [ make(), make() ]
    let k = 0

    const b = both( tree(`<async await( state.job )><loading><i>…</i></loading><then [v]><b>{v}</b></then><catch [e]><s>{e}</s></catch></async>`),
      () => ({ state: { job: jobs[ k++ ].p } }) )

    jobs[ 0 ].resolve('dom')
    jobs[ 1 ].resolve('dom') // same value for both hosts
    await Promise.resolve(); await Promise.resolve()
    b.check()

    const fail = Promise.reject('boom')
    fail.catch( () => {} )
    b.act( i => i.state.job = fail )
    await Promise.resolve(); await Promise.resolve()
    b.check()
  })
})

describe('host parity: components', () => {
  const log: Record<string, string[]> = {}

  const badge = ( host: string ) => ({
    ir: tree(`<em class="badge">{input.label}:{state.n}<button data-k="bump" on-click( bump )>+</button></em>`),
    state: { n: 0 },
    handlers: {
      bump( this: any ){ this.state.n++; this.emit('bumped', this.state.n ) },
      onMount(){ log[ host ].push('mount') },
      onAttach(){ log[ host ].push('attach') },
      onDestroy(){ log[ host ].push('destroy') }
    }
  })
  let hostOf = 0
  const opts = () => {
    const host = hostOf++ % 2 ? 'tree' : 'dom'
    log[ host ] = []
    return { components: { badge: badge( host ) } }
  }

  beforeEach( () => { hostOf = 0 })

  it('inputs, events, lifecycle and dispose', () => {
    const b = both( tree(`<div><if( state.show )><badge label=state.text on-bumped( got )/></if><p>{state.last}</p></div>`),
      () => ({ state: { show: true, text: 'hot', last: 0 }, handlers: { got( this: any, n: number ){ this.state.last = n } } }), opts )

    expect( log.tree ).toEqual( log.dom )
    expect( log.dom ).toEqual([ 'mount', 'attach' ])

    b.fire('bump')
    b.act( i => i.state.text = 'new' )
    b.act( i => i.state.show = false )
    expect( log.tree ).toEqual( log.dom )
    expect( log.dom ).toEqual([ 'mount', 'attach', 'destroy' ])
  })

  it('slots render in the parent scope, with arguments', () => {
    const panel = { ir: tree(`<section><h3>{input.title}</h3><for [x] in=input.items><{input.renderer} entry=x/></for></section>`) }
    const b = both( tree(`<panel title=state.t items=state.xs [entry]><li>{entry}-{state.suffix}</li></panel>`),
      () => ({ state: { t: 'T', xs: [ 'a', 'b' ], suffix: 's' } }),
      () => ({ components: { panel } }) )

    b.act( i => i.state.suffix = 'z' )
    b.act( i => i.state.xs = [ 'b' ] )
  })

  it('dynamic tags: component names, element names, nothing', () => {
    const card = { ir: tree(`<article>{input.x}</article>`) }
    const b = both( tree(`<div><{state.view} x=state.x data-x="1"/></div>`),
      () => ({ state: { view: 'card', x: 'one' } }), () => ({ components: { card } }) )

    b.act( i => i.state.view = 'section' )
    b.act( i => i.state.x = 'two' )
    b.act( i => i.state.view = null )
    b.act( i => i.state.view = 'card' )
  })

  it('unresolved candidates become plain elements with contents and listeners', () => {
    const b = both( tree(`<my-card data-k=state.k on-ping( hit )><b>slot {state.n}</b></my-card>`),
      () => ({ state: { k: 'v1', n: 0 }, handlers: { hit( this: any ){ this.state.n++ } } }) )

    b.act( i => i.state.k = 'v2' )
    b.fire('v2', 'ping')
    expect( b.tree.state.n ).toBe( 1 )
  })

  it('self.node is the element roots in both hosts', () => {
    const b = both( tree(`<i>a</i>text<b>c</b>`) )
    expect( b.dom.self.node.map( ( n: Element ) => n.localName ) ).toEqual([ 'i', 'b' ])
    expect( b.tree.self.node.map( ( n: TreeNode ) => n.type ) ).toEqual([ 'i', 'b' ])
  })
})

describe('host parity: styles', () => {
  it('stamps the scope and binds reactive declarations as variables', () => {
    const style = compileStyle(`.fill { width: {state.pct}% } .x { color: {state.c} }`, { nsp: 'bar' }).ir
    const b = both( tree(`<div class="track"><div class="fill"></div></div><p>t</p>`),
      () => ({ state: { pct: 20, c: 'red' }, stylesheet: style, nsp: 'bar' }) )

    b.act( i => i.state.pct = 80 )
    b.act( i => i.state.c = null )
  })

  /**
   * A component whose root IS a nested component's root: both scopes
   * reach the same element, inner first, and the inner one must stay.
   */
  it('an inner component keeps its scope on a shared root', () => {
    const inner = { ir: tree(`<span class="in">x</span>`), stylesheet: compileStyle(`.in { color: red }`, { nsp: 'inner' }).ir }
    const b = both( tree(`<inner/><div>own</div>`),
      () => ({ stylesheet: compileStyle(`div { color: blue }`, { nsp: 'outer' }).ir }),
      () => ({ components: { inner } }) )

    expect( b.tree.self.node.map( ( n: TreeNode ) => n.scope ) ).toEqual([ 'inner', 'outer' ])
  })
})

describe('host parity: swap and dispose', () => {
  it('bind-only, block and skeleton revisions, salvaging stateful children', () => {
    const counter = {
      ir: tree(`<b>{state.n}<button data-k="c" on-click( () => state.n++ )>+</button></b>`),
      state: { n: 0 }
    }
    const v1 = tree(`<div><p>{state.a}</p><if( state.on )><counter/></if></div>`)
    const v2 = tree(`<div><p>{state.b}</p><if( state.on )><counter/></if></div>`)
    const v3 = tree(`<section><h1>{state.b}</h1><if( state.on )><counter/><i>new</i></if></section>`)

    const b = both( v1, () => ({ state: { a: 'A', b: 'B', on: true } }), () => ({ components: { counter } }) )
    b.fire('c')
    b.fire('c')

    const reports: any[] = []
    b.act( i => reports.push( i.swap( v2 ) ) )
    b.act( i => reports.push( i.swap( v3 ) ) )
    expect( reports[ 1 ] ).toEqual( reports[ 0 ] )
    expect( reports[ 3 ] ).toEqual( reports[ 2 ] )
    expect( reports[ 2 ].changes ).toEqual([ { kind: 'skeleton', path: 'root' } ])

    // the counter kept its state through the rebuild, in both
    expect( b.app.querySelector('b')?.textContent ).toBe('2+')
    b.fire('c')
    expect( b.app.querySelector('b')?.textContent ).toBe('3+')
  })

  it('a swap re-stamps the scope on fresh roots', () => {
    const style = compileStyle(`.a { width: {state.w}px }`, { nsp: 'sw' }).ir
    const b = both( tree(`<div class="a">1</div>`), () => ({ state: { w: 1 }, stylesheet: style }) )

    b.act( i => i.swap( tree(`<section class="a">2</section>`) ) )
    b.act( i => i.state.w = 5 )
  })

  it('dispose removes every node and stops every effect', () => {
    const spy = vi.fn()
    const b = both( tree(`<p>{state.a}</p><for [x] in=state.xs><i>{x}</i></for>`),
      () => ({ state: { a: 1, xs: [ 1, 2 ] }, handlers: { onDestroy: spy } }) )

    b.act( i => i.dispose() )
    expect( b.app.childNodes.length ).toBe( 0 )
    expect( b.root.first ).toBeNull()
    expect( spy ).toHaveBeenCalledTimes( 2 )

    b.act( i => i.state.a = 2 ) // nothing comes back
  })

  it('attach waits for a live root on the tree host, as on the DOM', () => {
    const order: string[] = []
    const ir = tree(`<p>x</p>`)
    const inst = renderIR<TreeNode>( ir, { handlers: { onAttach(){ order.push('attach') } } }, { host: treeHost })

    const loose = treeHost.fragment()
    inst.mount( loose )
    expect( order ).toEqual( [] )

    inst.mount( treeRoot() )
    expect( order ).toEqual([ 'attach' ])
  })
})
