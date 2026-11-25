import { describe, it, expect, beforeEach, vi } from 'vitest'
import Lips from '../src/lips'
import { precompile, precompilePlugins, serializeIR, lipsPlugin } from '../src/precompile'
import { popover, combobox, dialog } from '../src/parts'

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
const q = ( sel: string ) => document.querySelector( sel )
const qa = ( sel: string ) => [ ...document.querySelectorAll( sel ) ]

let lips: any
beforeEach( () => {
  document.body.innerHTML = '<div id="app"></div>'
  lips = new Lips()
})

describe('precompile', () => {
  const SOURCE = {
    macros: `<macro [label] name="chip"><em class="chip">#{label}</em></macro>`,
    state: { who: 'Ada', items: [ 'a', 'b' ] },
    handler: {
      greet( this: any ){ this.state.who = 'Grace' }
    },
    default: `
      <div>
        <p class="greet">Hi {state.who}</p>
        <chip label=state.who/>
        <ul><for [x] in=state.items><li class="i">{x}</li></for></ul>
        <button class="go" on-click( greet )>go</button>
      </div>`
  }

  it('produces a template carrying IR instead of source', () => {
    const { template, diagnostics } = precompile( SOURCE )

    expect( diagnostics ).toEqual( [] )
    expect( template.ir ).toBeTruthy()
    expect( ( template as any ).default ).toBeUndefined()
    // macros are inlined at build time — they do not ship
    expect( ( template as any ).macros ).toBeUndefined()
    expect( template.state ).toEqual( SOURCE.state )
  })

  it('renders a precompiled template identically to the source form', async () => {
    const fromSource = lips.render('src', SOURCE )
    fromSource.appendTo('#app')
    await settle( () => !!q('.greet') )
    const sourceHTML = q('#app')!.innerHTML

    document.body.innerHTML = '<div id="app"></div>'
    const { template } = precompile( SOURCE )
    const fromIR = new Lips().render('pre', template as any )
    fromIR.appendTo('#app')
    await settle( () => !!q('.greet') )

    expect( q('#app')!.innerHTML ).toBe( sourceHTML )
  })

  it('stays reactive and interactive when precompiled', async () => {
    const { template } = precompile( SOURCE )
    const c = lips.render('pre-live', template as any )
    c.appendTo('#app')

    await settle( () => q('.greet')?.textContent === 'Hi Ada' )
    expect( q('.chip')?.textContent ).toBe('#Ada')
    expect( qa('.i') ).toHaveLength( 2 )

    ;( q('.go') as HTMLButtonElement ).click()
    await settle( () => q('.greet')?.textContent === 'Hi Grace' )
    expect( q('.chip')?.textContent ).toBe('#Grace')
  })

  it('survives JSON round-trip (the artifact contract)', async () => {
    const { template } = precompile( SOURCE )
    const shipped = JSON.parse( serializeIR( template.ir ) )

    const c = lips.render('pre-json', { ...template, ir: shipped } as any )
    c.appendTo('#app')

    await settle( () => q('.greet')?.textContent === 'Hi Ada' )
  })

  it('reports diagnostics without throwing', () => {
    const { diagnostics } = precompile({ default: `<div><p>{ state.x === }</p></div>` })
    expect( diagnostics.length ).toBeGreaterThan( 0 )
  })
})

describe('CSP mode (interpreted, no eval)', () => {
  /**
   * Control: proves the spy below is not vacuous — the default
   * (compiled) mode DOES construct Functions for expressions.
   */
  it('control: compiled mode constructs Functions', async () => {
    const FunctionSpy = vi.spyOn( globalThis, 'Function' as any )

    const { template } = precompile({
      state: { unique1: 'a' },
      default: `<b class="ctl">{state.unique1 + 'x'}</b>`
    })

    lips.render('ctl', template as any ).appendTo('#app')
    await settle( () => !!q('.ctl') )

    expect( FunctionSpy ).toHaveBeenCalled()
    FunctionSpy.mockRestore()
  })

  it('renders a precompiled app without calling Function', async () => {
    const FunctionSpy = vi.spyOn( globalThis, 'Function' as any )

    const { template } = precompile({
      state: { n: 1, items: [ 'x', 'y' ] },
      handler: { inc( this: any ){ this.state.n++ } },
      default: `
        <div>
          <b class="n">{state.n}</b>
          <if( state.n > 1 )><i class="big">big</i></if>
          <ul><for [it] in=state.items><li class="it">{it}</li></for></ul>
          <button class="up" on-click( inc )>+</button>
        </div>`
    })

    const csp = new Lips({ mode: 'interpreted' } as any )
    const c = csp.render('csp', template as any )
    c.appendTo('#app')

    await settle( () => q('.n')?.textContent === '1' )
    expect( qa('.it') ).toHaveLength( 2 )

    ;( q('.up') as HTMLButtonElement ).click()
    await settle( () => q('.n')?.textContent === '2' )
    expect( q('.big') ).not.toBeNull()

    // The whole render + interaction path never constructed a Function
    expect( FunctionSpy ).not.toHaveBeenCalled()
    FunctionSpy.mockRestore()
  })
})

describe('bundler plugin', () => {
  const plugin: any = lipsPlugin()

  it('ignores files outside the include pattern', async () => {
    expect( await plugin.transform(`const a = 1`, '/src/app.ts') ).toBeNull()
  })

  it('compiles a .lips SFC into a module with embedded IR', async () => {
    const sfc = `const state = { name: 'Ada' }
const handler = {
  greet(){ this.state.name = 'Grace' }
}

<div class="card"><h1>{state.name}</h1></div>`

    const out = await plugin.transform( sfc, '/src/card.lips')

    expect( out.code ).toContain('const __lips_ir__ =')
    expect( out.code ).toContain('export default')
    expect( out.code ).toContain('state,')
    expect( out.code ).toContain('handler,')
    // frontscript preserved
    expect( out.code ).toContain(`const state = { name: 'Ada' }`)
    // template source is gone — only IR ships
    expect( out.code ).not.toContain('<div class="card">')
  })

  it('throws on a template error with file position', async () => {
    const sfc = `const state = {}\n\n<div><p>{ state.x === }</p></div>`

    await expect( plugin.transform( sfc, '/src/bad.lips') )
      .rejects.toThrow( /bad\.lips.*line/s )
  })

  it('embedded IR is usable by the runtime', async () => {
    const sfc = `const state = { v: 'live' }\n\n<b class="sfc">{state.v}</b>`
    const out = await plugin.transform( sfc, '/src/x.lips')

    // Extract the emitted IR and render it
    const json = out.code.match( /const __lips_ir__ = (.*);/ )![1]
    const c = lips.render('sfc', { ir: JSON.parse( json ), state: { v: 'live' } } as any )
    c.appendTo('#app')

    await settle( () => q('.sfc')?.textContent === 'live' )
  })
})

describe('bundler plugin: what a .lips frontscript declares', () => {
  const plugin: any = lipsPlugin()
  const irOf = ( code: string ) => JSON.parse( code.match( /const __lips_ir__ = (.*);/ )![1] )

  /**
   * The IR is all that ships, so a macro the build does not inline never
   * expands: before, `const macros` was ignored and `<chip>` compiled as a
   * component candidate, rendering an empty element.
   */
  it('inlines const macros, as precompile() inlines a template\'s macros', async () => {
    const sfc = 'const macros = `<macro [label] name="chip"><b class="chip">{label}</b></macro>`\n\n<div><chip label="hi"/></div>'
    const out = await plugin.transform( sfc, '/src/chips.lips')
    const ir = irOf( out.code )

    expect( ir.root.blocks[ 0 ].t ).toBe('macro')

    const c = lips.render('chips', { ir } as any ).appendTo('#app')
    expect( q('.chip')?.textContent ).toBe('hi')
    c.destroy()
  })

  it('refuses const macros it cannot read at build time', async () => {
    const sfc = 'const tag = "b"\nconst macros = `<macro name="x"><${tag}/></macro>`\n\n<div/>'
    await expect( plugin.transform( sfc, '/src/x.lips') ).rejects.toThrow( /plain template literal/ )
  })

  it('exports const watchContext, the spelling RFC-005 renamed context to', async () => {
    const out = await plugin.transform('const watchContext = [ "theme" ]\n\n<div/>', '/src/w.lips')
    expect( out.code ).toMatch( /^\s*watchContext,$/m )
  })

  it('exports no `context`: the old name is not a component field', async () => {
    const out = await plugin.transform('const context = [ "theme" ]\n\n<div/>', '/src/c.lips')
    expect( out.code ).not.toMatch( /^\s*context,$/m )
  })
})

describe('runtime-only entry (@lipsjs/lips/runtime)', () => {
  it('renders precompiled templates without the compiler', async () => {
    const { default: RuntimeLips } = await import('../src/runtime')

    const { template } = precompile({
      state: { v: 'ok' },
      default: `<b class="ro">{state.v}</b>`
    })

    const rt: any = new RuntimeLips()
    rt.render('ro', template as any ).appendTo('#app')

    await settle( () => q('.ro')?.textContent === 'ok' )
  })

  it('fails with an actionable error when given source templates', async () => {
    /**
     * Fresh module graph: the compiler registers itself as a
     * module-level singleton when `src/lips` is imported, so this
     * must load the runtime entry WITHOUT it — exactly what a
     * bundle built against /runtime contains.
     */
    vi.resetModules()
    const { default: RuntimeLips } = await import('../src/runtime')
    const rt: any = new RuntimeLips()

    expect( () => rt.render('src', { default: `<b>x</b>` }) )
      .toThrow( /precompiled/ )

    vi.resetModules()
  })

  it('has no style compiler wired — source stylesheets warn and skip', async () => {
    /**
     * Fresh graph = the runtime bundle. Both the style compiler and
     * Stylis behind it are INJECTED by the full entry (src/lips), so a
     * runtime-only build cannot compile or inject a source stylesheet —
     * proving they are tree-shaken out. Precompiled StyleIR still works
     * here, which is the point of RFC-004 §1.
     */
    vi.resetModules()
    document.head.querySelectorAll('style[rel]').forEach( s => s.remove() )
    const warn = vi.spyOn( console, 'warn' ).mockImplementation( () => {} )

    const { default: RuntimeLips } = await import('../src/runtime')
    const { template } = precompile({ default: `<b class="s">x</b>` })

    const rt: any = new RuntimeLips()
    rt.render('styled', { ...template, stylesheet: `.s { color: red }` } as any ).appendTo('#app')

    await settle( () => !!q('.s') )
    expect( document.head.querySelector('style[rel="styled"]') ).toBeNull()
    expect( warn ).toHaveBeenCalledWith( expect.stringContaining('no style compiler') )

    warn.mockRestore()
    vi.resetModules()
  })

  it('renders PRECOMPILED StyleIR with no compiler and no preprocessor', async () => {
    /**
     * The hole RFC-004 closes: before StyleIR the runtime build dropped
     * styles entirely, so the CSP-safe bundle could not render a styled
     * app. Precompiled sheets now inject and their reactive declarations
     * bind, with neither the style compiler nor Stylis in the graph.
     */
    vi.resetModules()
    document.head.querySelectorAll('style[rel]').forEach( s => s.remove() )

    const { default: RuntimeLips } = await import('../src/runtime')
    const { template } = precompile({
      default: `<b class="s">x</b>`,
      state: { w: 9 },
      stylesheet: `.s { width: {state.w}px }`
    }, { name: 'pre' })

    const rt: any = new RuntimeLips()
    rt.render('pre', template as any ).appendTo('#app')

    await settle( () => !!q('.s') )

    const sheet = document.head.querySelector('style[rel="pre"]')
    expect( sheet ).not.toBeNull()
    expect( sheet!.textContent ).toContain('calc(var(--pre-0) * 1px)')

    const root = q('.s') as HTMLElement
    expect( root.getAttribute('rel') ).toBe('pre')
    expect( root.style.getPropertyValue('--pre-0') ).toBe('9')

    vi.resetModules()
  })
})

describe('precompilePlugins: plugins compiled in a build, as lips.use installs them (RFC-008 §4)', () => {
  const leaf = { name: 'leaf', components: { 'a-leaf': { default: `<i class="leaf">leaf</i>`, stylesheet: `.leaf { color: red }` } } }
  const tree = { name: 'tree', requires: [ leaf ], components: { 'a-tree': { default: `<b><a-leaf/></b>` } } }

  it('each component of each plugin and what it requires, as JSON, what is required first', () => {
    const { components, diagnostics } = precompilePlugins([ tree, leaf, tree ])
    expect( Object.keys( components ) ).toEqual([ 'a-leaf', 'a-tree' ])
    expect( diagnostics ).toEqual({ 'a-leaf': [], 'a-tree': [] })
    expect( JSON.parse( JSON.stringify( components ) ) ).toEqual( components )
    // The sheet is scoped by the component's name, as register() scopes it
    expect( components[ 'a-leaf' ].style ).toEqual( precompile( leaf.components[ 'a-leaf' ], { name: 'a-leaf' }).template.style )
    expect( components[ 'a-tree' ].style ).toBeUndefined()
  })

  it('a component carrying IR is taken as it is', () => {
    const ir = precompile({ default: `<p>pre</p>` }).template.ir
    expect( precompilePlugins([ { name: 'pre', components: { 'a-pre': { ir } } } ]).components[ 'a-pre' ] ).toEqual({ ir })
  })

  it('refuses what use() refuses', () => {
    expect( () => precompilePlugins([ leaf, { ...leaf } ]) ).toThrow( /two plugins named <leaf>/ )
    expect( () => precompilePlugins([ leaf, { name: 'other', components: { 'a-leaf': { default: `<i/>` } } } ]) ).toThrow( /<a-leaf> of plugin <other> is compiled already/ )
  })

  it('parts run on the runtime-only entry, with the IR their build made', async () => {
    // Made where the compiler is, carried as JSON, as a build writes it
    const precompiled = JSON.parse( JSON.stringify( precompilePlugins([ combobox, dialog ]).components ) )
    const page = JSON.parse( JSON.stringify( precompile({ default: `<div>
      <popover open=state.open on-change( setOpen )>
        <popover-combobox options=state.people value=state.owner class="field" label="Owner" on-change( setOwner )/>
      </popover>
    </div>` }).template.ir ) )

    vi.resetModules()
    const { default: RuntimeLips } = await import('../src/runtime')
    const parts = await import('../src/parts')

    // Without its IR, a part's source cannot run here
    expect( () => new RuntimeLips({ mode: 'interpreted' }).use( parts.combobox ).render( 'bare', { ir: page }) ).toThrow( /precompiled/ )

    const rt: any = new RuntimeLips({ mode: 'interpreted', precompiled })
    // The popover both require is the same component, registered once
    rt.use( parts.combobox ).use( parts.dialog )
    const app = rt.render( 'page', {
      ir: page,
      state: { open: false, owner: 'ada', people: [ { id: 'ada', label: 'Ada' }, { id: 'grace', label: 'Grace' } ] },
      handler: { setOpen( o: boolean ){ ( this as any ).state.open = o }, setOwner( o: any ){ ( this as any ).state.owner = o.id } }
    })
    app.appendTo('#app')
    await settle( () => ( q('.field') as HTMLInputElement )?.value === 'Ada' )
    const f = q('.field') as HTMLInputElement
    f.value = 'gr'
    f.dispatchEvent( new Event( 'input', { bubbles: true } ) )
    await settle( () => qa('[role="option"]').length === 1 )
    expect( q('[role="option"]')!.textContent!.trim() ).toBe('Grace')
    app.destroy()
    vi.resetModules()
  })

  it('one component two plugins bring is one component, with its IR', async () => {
    const shared = { default: `<i class="shared">shared</i>` }
    const precompiled = JSON.parse( JSON.stringify( precompilePlugins([ { name: 'one', components: { 'a-shared': shared } } ]).components ) )
    const page = JSON.parse( JSON.stringify( precompile({ default: `<p><a-shared/></p>` }).template.ir ) )
    vi.resetModules()
    const { default: RuntimeLips } = await import('../src/runtime')
    const rt: any = new RuntimeLips({ mode: 'interpreted', precompiled })
    rt.use({ name: 'one', components: { 'a-shared': shared } }).use({ name: 'two', components: { 'a-shared': shared } })
    rt.render( 'page', { ir: page }).appendTo('#app')
    await settle( () => q('.shared')?.textContent === 'shared' )
    vi.resetModules()
  })
})
