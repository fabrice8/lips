import { describe, it, expect, beforeEach, vi } from 'vitest'
import Lips from '../src/lips'
import { precompile, serializeIR, lipsPlugin } from '../src/precompile'

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
})
