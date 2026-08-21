import { describe, it, expect } from 'vitest'
import { compileTemplate, type ChildIR, type BindIR } from '../src/ir/compiler'

const compile = ( src: string ) => compileTemplate( src )
const clean = ( src: string ) => {
  const r = compile( src )
  expect( r.diagnostics, `diagnostics for: ${src}` ).toEqual( [] )
  return r.ir
}
const firstBlock = ( src: string ) => clean( src ).root.blocks[0] as any
const exprOf = ( ir: { exprs: string[] }, e: number ) => ir.exprs[ e ]

describe('static skeletons', () => {
  it('compiles pure static templates to html with no binds/blocks', () => {
    const ir = clean(`<div class="box"><span>hello</span><br></div>`)

    expect( ir.root.html ).toBe(`<div class="box"><span>hello</span><br></div>`)
    expect( ir.root.binds ).toEqual( [] )
    expect( ir.root.blocks ).toEqual( [] )
  })

  it('escapes literal text and attribute values', () => {
    const ir = clean(`<span title="A &amp; B">x &lt; y</span>`)
    expect( ir.root.html ).toBe(`<span title="A &amp; B">x &lt; y</span>`)
  })

  it('emits static boolean attributes and omits negated ones', () => {
    const ir = clean(`<input checked !disabled>`)
    expect( ir.root.html ).toBe(`<input checked>`)
  })

  it('keeps template comments in the skeleton', () => {
    const ir = clean(`<div><!-- note --></div>`)
    expect( ir.root.html ).toBe(`<div><!-- note --></div>`)
  })
})

describe('text interpolation binds', () => {
  it('folds a text run (statics + interpolations) into one anchored bind', () => {
    const ir = clean(`<div>a{state.x}b<span>s</span></div>`)

    expect( ir.root.html ).toBe(`<div><!--$--><span>s</span></div>`)
    expect( ir.root.binds ).toHaveLength( 1 )

    const bind = ir.root.binds[0] as BindIR & { t: 'text' }
    // div=[0]; inside: anchor(text run)=0, span=1
    expect( bind.p ).toEqual([ 0, 0 ])
    expect( exprOf( ir, bind.e ) ).toBe(`"a"+((state.x)??"")+"b"`)
  })

  it('synthesizes one concat expression per text run', () => {
    const ir = clean(`<p>Hi {state.name}, {state.count} items</p>`)
    const bind = ir.root.binds[0] as any

    expect( exprOf( ir, bind.e ) ).toBe(`"Hi "+((state.name)??"")+", "+((state.count)??"")+" items"`)
  })
})

describe('attribute binds', () => {
  const ir = () => clean(`
    <section
      id="static-id"
      data-n=state.count
      class="btn {state.cls}"
      @html=state.raw
      on-click( select, state.id )
      ...state.extra
    >x</section>`)

  const bindOf = ( t: string ) => ( ir().root.binds as any[] ).find( b => b.t === t )

  it('places literals in the skeleton, binds the rest', () => {
    expect( ir().root.html ).toBe(`<section id="static-id">x</section>`)
  })
  it('expression attr', () => {
    const b = bindOf('attr')
    expect( b.name ).toBe('data-n')
    expect( exprOf( ir(), b.e ) ).toBe('state.count')
  })
  it('interpolated attr synthesizes concat', () => {
    const b = ( ir().root.binds as any[] ).filter( x => x.t === 'attr' )[1]
    expect( b.name ).toBe('class')
    expect( exprOf( ir(), b.e ) ).toBe(`"btn "+((state.cls)??"")`)
  })
  it('@-prop bind', () => {
    const b = bindOf('prop')
    expect( b.name ).toBe('html')
    expect( exprOf( ir(), b.e ) ).toBe('state.raw')
  })
  it('event bind keeps the raw instruction', () => {
    const b = bindOf('event')
    expect( b.name ).toBe('click')
    expect( exprOf( ir(), b.e ) ).toBe('select, state.id')
  })
  it('spread bind', () => {
    const b = bindOf('spread')
    expect( exprOf( ir(), b.e ) ).toBe('state.extra')
  })

  it('an interpolated @-prop is a prop bind, not an "@text" attribute', () => {
    const ir = clean(`<span @text="Row {state.i + 1}"></span>`)
    const b = ( ir.root.binds as any[] )[0]

    expect( b.t ).toBe('prop')
    expect( b.name ).toBe('text')
    expect( exprOf( ir, b.e ) ).toBe(`"Row "+((state.i + 1)??"")`)
    // the literal attribute must NOT reach the skeleton
    expect( ir.root.html ).toBe(`<span></span>`)
  })
})

describe('style= takes CSS text, not an object', () => {
  const styleErr = ( src: string ) => {
    const { ir, diagnostics } = compile( src )
    const d = diagnostics.find( x => x.code === 'LIPS-C019' )

    expect( d, `no LIPS-C019 for: ${src}` ).toBeDefined()
    expect( d!.severity ).toBe('error')
    // The token-level complaint is what C019 replaces
    expect( diagnostics.some( x => x.code === 'LIPS-E003' ) ).toBe( false )
    return { ir, hint: d!.hint }
  }

  it('reports the interpolated object literal and drops the dead bind', () => {
    const { ir } = styleErr(`<section style="{ border: '2px solid gray', margin: '3rem' }">x</section>`)

    expect( ir.root.html ).toBe(`<section>x</section>`)
    expect( ir.root.binds ).toEqual( [] )
  })

  it('reports the `{{ … }}` object expression, which compiles to [object Object]', () => {
    const { ir } = styleErr(`<div style={{ margin: '3rem' }}>x</div>`)
    expect( ir.root.binds ).toEqual( [] )
  })

  it('names the fix', () => {
    const { hint } = styleErr(`<div style="{ margin: '3rem' }">x</div>`)
    expect( hint ).toContain(`style="border: 2px solid gray; margin: 3rem"`)
    expect( hint ).toContain('stylesheet')
  })

  it('leaves the CSS-text forms alone', () => {
    // literal, interpolated value, whole-value expression, ternary
    clean(`<div style="background: black;color: white">x</div>`)
    clean(`<div style="width: {state.w}px; color: {state.c}">x</div>`)
    clean(`<div style=state.css>x</div>`)
    clean(`<div style="{state.on ? 'color: red' : ''}">x</div>`)
    clean(`<div style="{!state.on && 'color: red'}">x</div>`)
    clean(`<div style="{state.css ?? 'color: red'}">x</div>`)
  })

  it('binds the interpolated form as a concat, as before', () => {
    const ir = clean(`<div style="width: {state.w}px">x</div>`)
    const b = ( ir.root.binds as any[] )[0]

    expect( b.t ).toBe('attr')
    expect( b.name ).toBe('style')
    expect( exprOf( ir, b.e ) ).toBe(`"width: "+((state.w)??"")+"px"`)
  })

  it('is element-only — on a component `style` is an input, and objects are fine there', () => {
    const { diagnostics } = compile(`<counter style={{ margin: '3rem' }}>x</counter>`)
    expect( diagnostics ).toEqual( [] )
  })
})

describe('control-flow blocks', () => {
  it('groups if/else-if/else chains into one block', () => {
    const ir = clean(`
      <div>
        <if( state.a )><b>A</b></if>
        <else-if( state.b )><b>B</b></else-if>
        <else><b>C</b></else>
      </div>`)

    expect( ir.root.html ).toBe(`<div><!--$--></div>`)
    expect( ir.root.blocks ).toHaveLength( 1 )

    const block = ir.root.blocks[0] as ChildIR & { t: 'if' }
    expect( block.t ).toBe('if')
    expect( block.p ).toEqual([ 0, 0 ])
    expect( block.branches ).toHaveLength( 3 )
    expect( exprOf( ir, block.branches[0].when! ) ).toBe('state.a')
    expect( exprOf( ir, block.branches[1].when! ) ).toBe('state.b')
    expect( block.branches[2].when ).toBeNull()
    expect( block.branches[0].block.html ).toBe(`<b>A</b>`)
  })

  it('reports orphan else', () => {
    const { diagnostics } = compile(`<else><b>x</b></else>`)
    expect( diagnostics.some( d => d.code === 'LIPS-C001' ) ).toBe( true )
  })

  it('compiles keyed for with iterator scope', () => {
    const ir = clean(`<for [row, i] in=state.rows by="id"><span>{row.id}</span></for>`)
    const block = ir.root.blocks[0] as ChildIR & { t: 'for' }

    expect( block.args ).toEqual([ 'row', 'i' ])
    expect( exprOf( ir, block.of! ) ).toBe('state.rows')
    expect( block.by ).toEqual({ lit: 'id' })
    expect( block.block.scope ).toEqual([ 'row', 'i' ])
    expect( block.block.html ).toBe(`<span><!--$--></span>`)
    expect( block.block.binds[0].p ).toEqual([ 0, 0 ])
  })

  it('normalizes numeric from/to', () => {
    const ir = clean(`<for [x] from="0" to=state.max><i>{x}</i></for>`)
    const block = ir.root.blocks[0] as any

    expect( block.from ).toEqual({ lit: 0 })
    expect( exprOf( ir, block.to.e ) ).toBe('state.max')
  })

  it('requires in or from on <for>', () => {
    const { diagnostics } = compile(`<for [x]><i>{x}</i></for>`)
    expect( diagnostics.some( d => d.code === 'LIPS-C004' ) ).toBe( true )
  })

  it('compiles switch cases: literal, expression, default', () => {
    const ir = clean(`
      <switch( state.mode )>
        <case is="a"><b>A</b></case>
        <case is=['b','c']><b>BC</b></case>
        <default><b>D</b></default>
      </switch>`)

    const block = ir.root.blocks[0] as ChildIR & { t: 'switch' }
    expect( exprOf( ir, block.on ) ).toBe('state.mode')
    expect( block.cases[0].is ).toEqual({ lit: 'a' })
    expect( exprOf( ir, ( block.cases[1].is as any ).e ) ).toBe(`['b','c']`)
    expect( block.cases[2].is ).toBeNull()
  })

  it('rejects strangers inside switch', () => {
    const { diagnostics } = compile(`<switch( state.m )><span>nope</span></switch>`)
    expect( diagnostics.some( d => d.code === 'LIPS-C003' ) ).toBe( true )
  })

  it('compiles async arms with their argument scopes', () => {
    const ir = clean(`
      <async await( context.getUser( state.id ) )>
        <loading><i>…</i></loading>
        <then [user]><p>{user.name}</p></then>
        <catch [err]><p>{err.message}</p></catch>
      </async>`)

    const block = ir.root.blocks[0] as ChildIR & { t: 'async' }
    expect( exprOf( ir, block.awaitE ) ).toBe('context.getUser( state.id )')
    expect( block.then?.args ).toEqual([ 'user' ])
    expect( block.then?.block.scope ).toEqual([ 'user' ])
    expect( block.catch?.args ).toEqual([ 'err' ])
    expect( block.loading?.html ).toBe(`<i>…</i>`)
  })

  it('requires await on <async>', () => {
    const { diagnostics } = compile(`<async><then [r]><p>{r}</p></then></async>`)
    expect( diagnostics.some( d => d.code === 'LIPS-C004' ) ).toBe( true )
  })

  it('compiles let vars and extends block scope', () => {
    const ir = clean(`<div><let x=1 label=state.name/><p>{x}:{label}</p></div>`)
    const letBlock = ir.root.blocks[0] as ChildIR & { t: 'let' }

    expect( letBlock.const ).toBe( false )
    expect( letBlock.vars.x ).toEqual({ e: expect.any( Number ) })
    expect( exprOf( ir, ( letBlock.vars.label as any ).e ) ).toBe('state.name')
    expect( ir.root.scope ).toEqual( expect.arrayContaining([ 'x', 'label' ]) )
  })

  it('compiles log', () => {
    const ir = clean(`<log( state.x, 'dbg' )></log>`)
    const block = ir.root.blocks[0] as any
    expect( exprOf( ir, block.e ) ).toBe(`state.x, 'dbg'`)
  })
})

describe('components & dynamic tags', () => {
  it('classifies non-HTML tags as components', () => {
    const ir = clean(`<div><badge label=state.text kind="hot" active/></div>`)
    expect( ir.root.html ).toBe(`<div><!--$--></div>`)

    const comp = ir.root.blocks[0] as ChildIR & { t: 'comp' }
    expect( comp.name ).toBe('badge')
    expect( exprOf( ir, ( comp.inputs.label as any ).e ) ).toBe('state.text')
    expect( comp.inputs.kind ).toEqual({ lit: 'hot' })
    expect( comp.inputs.active ).toEqual({ lit: true })
    expect( comp.contents ).toBeUndefined()
  })

  it('captures component events, spreads and slotted contents', () => {
    const ir = clean(`<card ...state.opts on-select( pick, state.id )><b>slot</b></card>`)
    const comp = ir.root.blocks[0] as ChildIR & { t: 'comp' }

    expect( exprOf( ir, comp.spreads[0] ) ).toBe('state.opts')
    expect( comp.events[0].name ).toBe('select')
    expect( exprOf( ir, comp.events[0].e ) ).toBe('pick, state.id')
    expect( comp.contents?.block.html ).toBe(`<b>slot</b>`)
  })

  it('compiles dynamic tags', () => {
    const ir = clean(`<{state.page} params=state.params/>`)
    const dyn = ir.root.blocks[0] as ChildIR & { t: 'dynamic' }

    expect( exprOf( ir, dyn.tag ) ).toBe('state.page')
    expect( exprOf( ir, ( dyn.inputs.params as any ).e ) ).toBe('state.params')
  })

  it('nests blocks: for inside if inside component contents', () => {
    const ir = clean(`
      <panel>
        <if( state.on )>
          <for [x] in=state.items><i>{x}</i></for>
        </if>
      </panel>`)

    const panel = ir.root.blocks[0] as ChildIR & { t: 'comp' }
    const ifBlock = panel.contents!.block.blocks[0] as ChildIR & { t: 'if' }
    const forBlock = ifBlock.branches[0].block.blocks[0] as ChildIR & { t: 'for' }

    expect( forBlock.t ).toBe('for')
    expect( forBlock.block.scope ).toEqual([ 'x' ])
  })
})

describe('expression table', () => {
  it('dedupes identical expressions', () => {
    const ir = clean(`<p title=state.name>{state.name}</p><b data-x=state.name></b>`)
    expect( ir.exprs.filter( e => e === 'state.name' ) ).toHaveLength( 1 )
  })

  it('re-anchors expression diagnostics to template positions', () => {
    const { diagnostics } = compile(`<div>\n  <p>{ state.count === }</p>\n</div>`)
    const d = diagnostics.find( d => d.code.startsWith('LIPS-E') )!

    expect( d ).toBeDefined()
    expect( d.loc.line ).toBe( 2 )
    expect( d.loc.col ).toBeGreaterThan( 6 )
  })
})

describe('serialization contract', () => {
  const SRC = `
    <div class="app">
      <h1>{state.title}</h1>
      <if( state.ready )>
        <for [item, i] in=state.items by="id">
          <row data=item on-select( pick, item.id )/>
        </for>
      </if>
      <else><p>loading…</p></else>
    </div>`

  it('is JSON-round-trippable', () => {
    const ir = clean( SRC )
    expect( JSON.parse( JSON.stringify( ir ) ) ).toEqual( ir )
  })

  it('is deterministic', () => {
    expect( clean( SRC ) ).toEqual( clean( SRC ) )
  })
})

describe('quoted event attributes', () => {
  /**
   * Handlers are the instruction form `on-x( … )`. Quoted, the parser
   * makes an ordinary attribute — no listener, and the source text used
   * to land in the DOM. Silent, so it earns a diagnostic.
   */
  it('rejects on-*="…" on an element', () => {
    const { diagnostics } = compile(`<button on-click="() => state.n++">x</button>`)
    expect( diagnostics.some( d => d.code === 'LIPS-C020' ) ).toBe( true )
  })

  it('rejects on-*="…" on a component', () => {
    const { diagnostics } = compile(`<mycomp on-save="() => 1"/>`)
    expect( diagnostics.some( d => d.code === 'LIPS-C020' ) ).toBe( true )
  })

  it('does not emit the dead attribute', () => {
    const { ir } = compile(`<button on-click="() => state.n++">x</button>`)
    expect( ir.root.html ).toBe(`<button>x</button>`)
  })

  it('leaves the instruction form alone', () => {
    const { diagnostics } = compile(`<button on-click( () => state.n++ )>x</button>`)
    expect( diagnostics ).toEqual( [] )
  })
})
