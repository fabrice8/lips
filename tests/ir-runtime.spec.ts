import { describe, it, expect, vi, beforeEach } from 'vitest'
import { compileTemplate } from '../src/ir/compiler'
import { renderIR, type RuntimeOptions, type RenderSetup } from '../src/ir/runtime'

function mount( src: string, setup: RenderSetup = {}, options: RuntimeOptions = {} ){
  const { ir, diagnostics } = compileTemplate( src )
  expect( diagnostics, `compile diagnostics for: ${src}` ).toEqual( [] )

  const app = document.createElement('div')
  document.body.appendChild( app )

  const inst = renderIR( ir, setup, options )
  inst.mount( app )
  return { inst, app, state: inst.state }
}

beforeEach( () => { document.body.innerHTML = '' } )

const q = ( sel: string ) => document.querySelector( sel )
const qa = ( sel: string ) => [ ...document.querySelectorAll( sel ) ]

describe('static & text binds', () => {
  it('renders static skeletons', () => {
    mount(`<div class="box"><span>hello</span></div>`)
    expect( q('.box span')?.textContent ).toBe('hello')
  })

  it('updates text synchronously on state writes', () => {
    const { state } = mount(`<p>Hi {state.name}!</p>`, { state: { name: 'Ada' } })
    expect( q('p')?.textContent ).toBe('Hi Ada!')

    state.name = 'Grace'
    expect( q('p')?.textContent ).toBe('Hi Grace!') // no microtask needed
  })

  it('renders nullish interpolations as empty string (RFC #4)', () => {
    mount(`<p>[{state.missing}]</p>`, { state: {} })
    expect( q('p')?.textContent ).toBe('[]')
  })
})

describe('attribute & prop binds', () => {
  it('sets, updates and removes attributes', () => {
    const { state } = mount(`<div id=state.id data-on=state.on></div>`, { state: { id: 'a', on: true } })
    const el = q('div div') || qa('div')[1] || q('[id]')

    expect( q('#a') ).not.toBeNull()
    expect( q('#a')?.getAttribute('data-on') ).toBe('')

    state.id = 'b'
    expect( q('#a') ).toBeNull()
    expect( q('#b') ).not.toBeNull()

    state.on = false
    expect( q('#b')?.hasAttribute('data-on') ).toBe( false )
  })

  it('binds @html and @text props', () => {
    const { state } = mount(`<div @html=state.raw></div><p @text=state.txt></p>`,
      { state: { raw: '<b>bold</b>', txt: 'plain' } })

    expect( q('div b')?.textContent ).toBe('bold')
    expect( q('p')?.textContent ).toBe('plain')

    state.txt = 'updated'
    expect( q('p')?.textContent ).toBe('updated')
  })

  it('applies and diffs spread attributes', () => {
    const { state } = mount(`<div ...state.attrs>x</div>`, { state: { attrs: { 'data-a': '1', 'data-b': '2' } } })
    const el = q('div div') ?? qa('div').find( d => d.hasAttribute('data-a') )!

    expect( ( el as Element ).getAttribute('data-a') ).toBe('1')

    state.attrs = { 'data-b': '3' }
    expect( ( el as Element ).hasAttribute('data-a') ).toBe( false )
    expect( ( el as Element ).getAttribute('data-b') ).toBe('3')
  })
})

describe('events', () => {
  it('dispatches named self handlers with args and the event', () => {
    let got: any[] = []
    mount(`<button on-click( pick, state.id )>go</button>`, {
      state: { id: 7 },
      handlers: { pick( id: number, ev: Event ){ got = [ id, ev instanceof Event ] } }
    })

    ;( q('button') as HTMLButtonElement ).click()
    expect( got ).toEqual([ 7, true ])
  })

  it('dispatches arrow instructions against live state', () => {
    const { state } = mount(`<output>{state.count}</output><button on-click( () => state.count += 1 )>+</button>`,
      { state: { count: 0 } })

    ;( q('button') as HTMLButtonElement ).click()
    ;( q('button') as HTMLButtonElement ).click()
    expect( q('output')?.textContent ).toBe('2')
  })
})

describe('<if> blocks', () => {
  it('renders the matching branch and swaps synchronously', () => {
    const { state } = mount(`
      <div>
        <if( state.mode === 'a' )><b class="a">A</b></if>
        <else-if( state.mode === 'b' )><b class="b">B</b></else-if>
        <else><b class="c">C</b></else>
      </div>`, { state: { mode: 'a' } })

    expect( q('.a') ).not.toBeNull()

    state.mode = 'b'
    expect( q('.a') ).toBeNull()
    expect( q('.b') ).not.toBeNull()

    state.mode = 'zzz'
    expect( q('.c') ).not.toBeNull()
  })

  it('disposes swapped-out branch effects', () => {
    const { state } = mount(`
      <div>
        <if( state.on )><span class="live">{state.label}</span></if>
      </div>`, { state: { on: true, label: 'x' } })

    const live = q('.live')!
    state.on = false
    expect( q('.live') ).toBeNull()

    // Writing the label after swap must not resurrect or touch the removed node
    state.label = 'changed'
    expect( live.textContent ).toBe('x')
  })
})

describe('<switch> blocks', () => {
  it('matches literal, array-expression and default cases', () => {
    const { state } = mount(`
      <div>
        <switch( state.m )>
          <case is="a"><i class="ca">A</i></case>
          <case is=['b','c']><i class="cbc">BC</i></case>
          <default><i class="cd">D</i></default>
        </switch>
      </div>`, { state: { m: 'a' } })

    expect( q('.ca') ).not.toBeNull()
    state.m = 'c'
    expect( q('.cbc') ).not.toBeNull()
    state.m = 'nope'
    expect( q('.cd') ).not.toBeNull()
  })
})

describe('<for> blocks', () => {
  const LIST = `
    <ul>
      <for [item, i] in=state.items by="id">
        <li>{i}:{item.label}</li>
      </for>
    </ul>`

  it('renders keyed arrays with index args', () => {
    mount( LIST, { state: { items: [ { id: 'a', label: 'A' }, { id: 'b', label: 'B' } ] } })
    expect( qa('li').map( li => li.textContent ) ).toEqual([ '0:A', '1:B' ])
  })

  it('patches one item without touching sibling nodes', () => {
    const { state } = mount( LIST, { state: { items: [ { id: 'a', label: 'A' }, { id: 'b', label: 'B' } ] } })
    const [ liA, liB ] = qa('li')

    state.items = [ { id: 'a', label: 'A' }, { id: 'b', label: 'B2' } ]

    expect( qa('li')[0] ).toBe( liA )
    expect( qa('li')[1] ).toBe( liB )
    expect( liB.textContent ).toBe('1:B2')
  })

  it('preserves node identity across reorder', () => {
    const { state } = mount( LIST, { state: { items: [
      { id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }
    ] } })
    const [ elA, elB, elC ] = qa('li')

    state.items = [ { id: 'c', label: 'C' }, { id: 'b', label: 'B' }, { id: 'a', label: 'A' } ]

    const after = qa('li')
    expect( after.map( li => li.textContent ) ).toEqual([ '0:C', '1:B', '2:A' ])
    expect( after[0] ).toBe( elC )
    expect( after[1] ).toBe( elB )
    expect( after[2] ).toBe( elA )
  })

  it('adds and removes items', () => {
    const { state } = mount( LIST, { state: { items: [ { id: 'a', label: 'A' } ] } })

    state.items = [ { id: 'a', label: 'A' }, { id: 'b', label: 'B' } ]
    expect( qa('li') ).toHaveLength( 2 )

    state.items = [ { id: 'b', label: 'B' } ]
    expect( qa('li').map( li => li.textContent ) ).toEqual([ '0:B' ])
  })

  it('iterates plain objects with natural entry keys', () => {
    const { state } = mount(`
      <dl><for [k, v] in=state.notes><dt>{k}={v}</dt></for></dl>`,
      { state: { notes: { fr: 12, en: 15 } } })

    expect( qa('dt').map( d => d.textContent ) ).toEqual([ 'fr=12', 'en=15' ])

    const [ dtFr ] = qa('dt')
    state.notes = { en: 16, fr: 12 }
    // natural key match: 'fr' node reused despite reorder
    expect( qa('dt')[1] ).toBe( dtFr )
    expect( qa('dt').map( d => d.textContent ) ).toEqual([ 'en=16', 'fr=12' ])
  })

  it('renders numeric ranges reactively', () => {
    const { state } = mount(`<div><for [x] from="1" to=state.max><i>{x}</i></for></div>`, { state: { max: 3 } })
    expect( qa('i').map( i => i.textContent ) ).toEqual([ '1', '2', '3' ])

    state.max = 5
    expect( qa('i') ).toHaveLength( 5 )

    state.max = 2
    expect( qa('i').map( i => i.textContent ) ).toEqual([ '1', '2' ])
  })
})

describe('<let> & <log>', () => {
  it('derives reactive block-scoped vars', () => {
    const { state } = mount(`<div><let doubled={ state.n * 2 }/><p>{doubled}</p></div>`, { state: { n: 3 } })
    expect( q('p')?.textContent ).toBe('6')

    state.n = 5
    expect( q('p')?.textContent ).toBe('10')
  })

  it('logs reactively', () => {
    const spy = vi.spyOn( console, 'log' ).mockImplementation( () => {} )
    const { state } = mount(`<div><log( state.x, 'tag' )></log></div>`, { state: { x: 1 } })

    expect( spy ).toHaveBeenCalledWith( 1, 'tag' )
    state.x = 2
    expect( spy ).toHaveBeenCalledWith( 2, 'tag' )
    spy.mockRestore()
  })
})

describe('<async> blocks', () => {
  it('renders loading then the resolved arm', async () => {
    let resolve!: ( v: any ) => void
    const promise = new Promise( r => resolve = r )

    mount(`
      <div>
        <async await( state.job )>
          <loading><i class="load">…</i></loading>
          <then [user]><p class="done">{user.name}</p></then>
          <catch [e]><p class="err">{e}</p></catch>
        </async>
      </div>`, { state: { job: promise } })

    expect( q('.load') ).not.toBeNull()

    resolve({ name: 'Ada' })
    await Promise.resolve() // settle the then-chain
    await Promise.resolve()

    expect( q('.load') ).toBeNull()
    expect( q('.done')?.textContent ).toBe('Ada')
  })

  it('renders the catch arm on rejection', async () => {
    mount(`
      <div>
        <async await( state.job )>
          <then [v]><p class="done">{v}</p></then>
          <catch [e]><p class="err">{e}</p></catch>
        </async>
      </div>`, { state: { job: Promise.reject('boom') } })

    await Promise.resolve()
    await Promise.resolve()
    expect( q('.err')?.textContent ).toBe('boom')
  })
})

describe('components & dynamic tags', () => {
  const badge = () => ({
    ir: compileTemplate(`<em class="badge">{input.label}:{state.n}<button class="bump" on-click( bump )>+</button></em>`).ir,
    state: { n: 0 },
    handlers: {
      bump( this: any ){ this.state.n++ }
    }
  })

  it('renders registered components with reactive input flow', () => {
    const { state } = mount(`<div><badge label=state.text/></div>`,
      { state: { text: 'hot' } }, { components: { badge: badge() } })

    expect( q('.badge')?.textContent ).toBe('hot:0+')

    ;( q('.bump') as HTMLButtonElement ).click()
    expect( q('.badge')?.textContent ).toBe('hot:1+')

    state.text = 'new'
    expect( q('.badge')?.textContent ).toBe('new:1+')
  })

  it('renders unresolved candidates as plain elements with contents', () => {
    const { state } = mount(`<my-card data-k=state.k><b>slot</b></my-card>`, { state: { k: 'v1' } })
    const el = q('my-card')!

    expect( el.getAttribute('data-k') ).toBe('v1')
    expect( el.querySelector('b')?.textContent ).toBe('slot')

    state.k = 'v2'
    expect( el.getAttribute('data-k') ).toBe('v2')
  })

  it('swaps dynamic tags by name and disposes the old content', () => {
    const { state } = mount(`<div><{state.view} data-x="1"/></div>`, { state: { view: 'section' } })
    expect( q('section[data-x="1"]') ).not.toBeNull()

    state.view = 'article'
    expect( q('section') ).toBeNull()
    expect( q('article[data-x="1"]') ).not.toBeNull()

    state.view = null
    expect( q('article') ).toBeNull()
  })
})

describe('interpreted mode parity', () => {
  const SRC = `
    <div>
      <h2>{state.title}</h2>
      <if( state.on )><for [x] in=state.list by="id"><i>{x.id}</i></for></if>
      <else><p>off</p></else>
      <button on-click( () => state.on = !state.on )>t</button>
    </div>`

  function scenario( mode: 'compiled' | 'interpreted' ){
    document.body.innerHTML = ''
    const { state, app } = mount( SRC, {
      state: { title: 'T', on: true, list: [ { id: 'x' }, { id: 'y' } ] }
    }, { mode })

    state.title = 'T2'
    ;( q('button') as HTMLButtonElement ).click()   // off
    ;( q('button') as HTMLButtonElement ).click()   // on again
    state.list = [ { id: 'y' }, { id: 'x' }, { id: 'z' } ]

    return app.innerHTML
  }

  it('produces identical DOM in both execution modes', () => {
    expect( scenario('interpreted') ).toBe( scenario('compiled') )
  })
})

describe('disposal', () => {
  it('stops all effects and removes all nodes', () => {
    const { inst, state, app } = mount(
      `<div><p>{state.x}</p><for [i] from="1" to="3"><i>{i}</i></for></div>`, { state: { x: 1 } })

    expect( qa('i') ).toHaveLength( 3 )

    inst.dispose()
    expect( app.innerHTML ).toBe('')

    // Post-dispose writes are inert
    expect( () => { state.x = 2 } ).not.toThrow()
  })
})

describe('attach queue re-entrancy', () => {
  /**
   * `onAttach` may render — that is what `<router>` does, and it is the
   * documented place to publish context. Rendering under a live parent
   * flushes the attach queue AGAIN from inside the outer flush, which
   * splices entries the outer loop has not walked down to yet.
   */
  it('survives an onAttach that renders more components', () => {
    const attached: string[] = []
    const leaf = ( name: string ) => ({
      ir: compileTemplate(`<i class="leaf">${name}</i>`).ir,
      handlers: { onAttach( this: any ){ attached.push( name ) } }
    })

    const components: Record<string, any> = {
      'leaf-a': leaf('leaf-a'),
      'leaf-b': leaf('leaf-b'),
      'leaf-c': leaf('leaf-c'),
      'late-one': leaf('late-one'),
      'late-two': leaf('late-two'),
      // Renders two more components from its own onAttach
      opener: {
        ir: compileTemplate(
          `<span class="opener"><if( state.open )><late-one/><late-two/></if></span>`).ir,
        state: { open: false },
        handlers: {
          onAttach( this: any ){
            attached.push('opener')
            this.state.open = true
          }
        }
      }
    }

    expect( () => mount(
      `<div><leaf-a/><leaf-b/><leaf-c/><opener/></div>`,
      {},
      { components }
    ) ).not.toThrow()

    // Every queued component attached exactly once — none dropped by a bad splice
    expect( attached.sort() ).toEqual(
      [ 'late-one', 'late-two', 'leaf-a', 'leaf-b', 'leaf-c', 'opener' ] )
    expect( qa('.leaf') ).toHaveLength( 5 )
  })
})
