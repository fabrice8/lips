import { describe, it, expect, beforeEach } from 'vitest'
import Lips from '../src/lips'
import { compileTemplate } from '../src/ir/compiler'

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
  lips = new Lips({ engine: 'ir' } as any )
})

const MACROS = `
  <macro [name, source, active] name="Card">
    <div class="card" style="border: 1px solid {active ? '#000' : '#fff'}">
      <p class="cname">{name} <span class="csrc">({source})</span></p>
    </div>
  </macro>

  <macro [label] name="tag">
    <em class="tag">#{label}</em>
  </macro>
`

describe('macros', () => {
  it('inlines a macro at its call site', async () => {
    lips.render('m-basic', {
      macros: MACROS,
      state: { n: 'Widget', s: 'store' },
      default: `<div><Card name=state.n source=state.s active/></div>`
    }).appendTo('#app')

    await settle( () => !!q('.card') )
    expect( q('.cname')?.textContent ).toBe('Widget (store)')
    expect( q('.card')?.getAttribute('style') ).toContain('#000')
  })

  it('is reactive to call-site expressions', async () => {
    const c = lips.render('m-reactive', {
      macros: MACROS,
      state: { n: 'A', s: 'x', on: false },
      default: `<div><Card name=state.n source=state.s active=state.on/></div>`
    })
    c.appendTo('#app')
    await settle( () => q('.cname')?.textContent === 'A (x)' )

    c.state.n = 'B'
    await settle( () => q('.cname')?.textContent === 'B (x)' )

    c.state.on = true
    await settle( () => !!q('.card')?.getAttribute('style')?.includes('#000') )
  })

  it('is case-insensitive at call sites', async () => {
    lips.render('m-case', {
      macros: MACROS,
      default: `<div><card name="n" source="s"/><CARD name="n2" source="s2"/></div>`
    }).appendTo('#app')

    await settle( () => qa('.card').length === 2 )
  })

  it('defaults undeclared argv to false', async () => {
    lips.render('m-default', {
      macros: MACROS,
      default: `<div><Card name="only"/></div>`
    }).appendTo('#app')

    await settle( () => !!q('.card') )
    // `source` unset → falsy, `active` unset → '#fff' branch
    expect( q('.csrc')?.textContent ).toBe('()')
    expect( q('.card')?.getAttribute('style') ).toContain('#fff')
  })

  it('exposes all call-site attributes as `arguments`', async () => {
    lips.render('m-arguments', {
      macros: `
        <macro [a] name="args">
          <i class="args">{a}|{arguments.b}|{arguments.c}</i>
        </macro>`,
      state: { v: 3 },
      default: `<div><args a="1" b="2" c=state.v/></div>`
    }).appendTo('#app')

    await settle( () => !!q('.args') )
    expect( q('.args')?.textContent ).toBe('1|2|3')
  })

  it('works inside control flow and repeats per item', async () => {
    lips.render('m-loop', {
      macros: MACROS,
      state: { items: [ 'x', 'y', 'z' ] },
      default: `<div><for [it] in=state.items><tag label=it/></for></div>`
    }).appendTo('#app')

    await settle( () => qa('.tag').length === 3 )
    expect( qa('.tag').map( e => e.textContent ) ).toEqual([ '#x', '#y', '#z' ])
  })

  it('supports macros calling other macros', async () => {
    lips.render('m-nested', {
      macros: `
        <macro [label] name="inner"><b class="inner">{label}</b></macro>
        <macro [text] name="outer"><div class="outer"><inner label=text/></div></macro>`,
      default: `<div><outer text="deep"/></div>`
    }).appendTo('#app')

    await settle( () => !!q('.outer .inner') )
    expect( q('.inner')?.textContent ).toBe('deep')
  })

  it('reports recursive macros instead of hanging', () => {
    const { diagnostics } = compileTemplate(`<div><loop v="1"/></div>`, {
      macros: `<macro [v] name="loop"><i><loop v=v/></i></macro>`
    })

    expect( diagnostics.some( d => d.code === 'LIPS-C009' ) ).toBe( true )
  })

  it('reports a macro without a name', () => {
    const { diagnostics } = compileTemplate(`<div/>`, {
      macros: `<macro [v]><i>{v}</i></macro>`
    })

    expect( diagnostics.some( d => d.code === 'LIPS-C011' ) ).toBe( true )
  })
})
