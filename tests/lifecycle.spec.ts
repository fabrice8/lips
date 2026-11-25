/**
 * The component lifecycle as the docs give it: which hook runs when, in
 * what order, how often; what reaches `onError`; what a component always
 * has (`input`, `static`).
 *
 * The update hooks follow every effect of the template, not only text and
 * attribute binds: a branch shown, a row added, an input wired. The error
 * boundary is the same set: whatever a template evaluates, and whatever a
 * handler throws, reaches the component's `onError`, and the render goes on.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Lips from '../src/lips'
import { compileTemplate } from '../src/ir/compiler'
import { renderIR } from '../src/ir/runtime'

const turn = () => new Promise( r => setTimeout( r, 0 ) )
const q = ( s: string ) => document.querySelector( s ) as any
const qa = ( s: string ) => [ ...document.querySelectorAll( s ) ]

let lips: any
beforeEach( () => {
  document.body.innerHTML = '<div id="app"></div>'
  lips = new Lips()
})

const recorder = ( log: string[] ) => {
  const h = ( name: string ) => function( this: any ){ log.push( name ) }
  return {
    onCreate: h('create'), onInput: h('input'), onMount: h('mount'), onRender: h('render'),
    onUpdate: h('update'), onAttach: h('attach'), onDetach: h('detach'), onDestroy: h('destroy')
  }
}

describe('lifecycle: order and count', () => {
  it('a nested component: create, input, mount, render, attach; then detach, destroy', async () => {
    const log: string[] = []
    lips.register('life-kid', { handler: recorder( log ), default: '<p>x</p>' })
    const c = lips.render('life-a', { state: { on: true }, default: '<div><if( state.on )><life-kid a=1/></if></div>' }).appendTo('#app')

    expect( log ).toEqual([ 'create', 'input', 'mount', 'render', 'attach' ])
    c.state.on = false
    await turn()
    expect( log.slice( 5 ) ).toEqual([ 'detach', 'destroy' ])
  })

  it('a root: the same order, attach on appendTo, teardown on destroy()', () => {
    const log: string[] = []
    const c = lips.render('life-b', { handler: recorder( log ), default: '<p>x</p>' }, { a: 1 })
    expect( log ).toEqual([ 'create', 'input', 'mount', 'render' ])

    c.appendTo('#app')
    expect( log ).toEqual([ 'create', 'input', 'mount', 'render', 'attach' ])
    c.destroy()
    c.destroy() // idempotent
    expect( log.slice( 5 ) ).toEqual([ 'detach', 'destroy' ])
  })

  it('onRender runs after every render, onUpdate after each update but the first, once a turn', async () => {
    const log: string[] = []
    const c = lips.render('life-c', { state: { a: 0, b: 0 }, handler: recorder( log ), default: '<p>{state.a} {state.b}</p>' }).appendTo('#app')

    c.state.a = 1
    c.state.b = 1   // same turn: one update
    await turn()
    c.state.a = 2
    await turn()
    expect( log.filter( n => n === 'render' ).length ).toBe( 3 )
    expect( log.filter( n => n === 'update' ).length ).toBe( 2 )
  })

  /**
   * Before, only a text or attribute bind re-running counted as an update:
   * a state change that showed a branch or added a row ran neither hook.
   */
  for( const [ what, template, change ] of [
    [ 'shows a branch', '<div><if( state.on )><b>y</b></if></div>', ( s: any ) => { s.on = true } ],
    [ 'switches a case', '<div><switch( state.on )><case is=true><b>y</b></case></switch></div>', ( s: any ) => { s.on = true } ],
    [ 'adds a row', '<ul><for [r] in=state.rows><li>{r}</li></for></ul>', ( s: any ) => { s.rows.push( 2 ) } ],
    [ 'changes a dynamic tag', '<div><{state.tag}/></div>', ( s: any ) => { s.tag = 'b' } ],
    [ 'changes an awaited value', '<div><async await( state.p )><then [v]><b>{v}</b></then></async></div>', ( s: any ) => { s.p = Promise.resolve( 1 ) } ],
    [ 'recomputes a <let>', '<let v={ state.n * 2 }/><div></div>', ( s: any ) => { s.n = 2 } ],
    [ 'changes a component input', '<div><life-input v=state.n/></div>', ( s: any ) => { s.n = 2 } ]
  ] as const )
    it(`a change that ${what} runs onUpdate and onRender`, async () => {
      lips.register('life-input', { default: '<i></i>' })
      const onUpdate = vi.fn(), onRender = vi.fn()
      const c = lips.render(`life-${what.replace( /\W/g, '' )}`, {
        state: { on: false, rows: [ 1 ], tag: 'i', p: Promise.resolve( 0 ), n: 1 },
        handler: { onUpdate, onRender },
        default: template
      }).appendTo('#app')
      await turn()
      onUpdate.mockClear(); onRender.mockClear()

      change( c.state )
      await turn()
      expect( onUpdate ).toHaveBeenCalledTimes( 1 )
      expect( onRender ).toHaveBeenCalledTimes( 1 )
    })
})

describe('lifecycle: the error boundary', () => {
  /**
   * Each of these threw out of `render()` and took the whole tree with it:
   * only text and attribute binds were inside the boundary.
   */
  for( const [ what, template ] of [
    [ 'an <if> condition', '<if( state.a.b )><b/></if>' ],
    [ 'a <switch> head', '<switch( state.a.b )><case is=1>x</case></switch>' ],
    [ 'a <for> source', '<for [x] in=state.a.b>x</for>' ],
    [ 'a dynamic tag', '<{state.a.b}/>' ],
    [ 'a component input', '<div><life-kid2 v=state.a.b/></div>' ],
    [ 'an attribute of a tag no component claims', '<div><no-such-thing a=state.a.b/></div>' ],
    [ 'a macro argument', '<div><m v=state.a.b/></div>' ],
    [ 'a <let>', '<let v=state.a.b/><p>{v}</p>' ],
    [ 'a <context> key', '<context v=state.a.b><p>x</p></context>' ],
    [ 'a <log>', '<log( state.a.b )/>' ],
    [ 'a bind', '<p>{state.a.b}</p>' ]
  ] as const )
    it(`what ${what} throws reaches onError, and the rest renders`, () => {
      lips.register('life-kid2', { default: '<i>{input.v}</i>' })
      const onError = vi.fn()

      expect( () => lips.render( 'life-err', {
        state: {},
        macros: '<macro [v] name="m"><b>{v}</b></macro>',
        handler: { onError },
        default: `<main>${template}<span class="after">after</span></main>`
      }).appendTo('#app') ).not.toThrow()

      expect( onError ).toHaveBeenCalled()
      expect( onError.mock.calls[ 0 ][ 0 ] ).toBeInstanceOf( TypeError )
      expect( q('.after')?.textContent ).toBe('after')
    })

  it('a branch that threw shows once what it reads is there', async () => {
    const onError = vi.fn()
    const c = lips.render('life-recover', { state: { a: undefined as any }, handler: { onError }, default: '<div><if( state.a.ok )><b>ok</b></if></div>' }).appendTo('#app')
    expect( onError ).toHaveBeenCalledTimes( 1 )

    c.state.a = { ok: true }
    await turn()
    expect( q('b')?.textContent ).toBe('ok')
  })

  it('a handler that throws reaches onError, and so does one whose promise rejects', async () => {
    const onError = vi.fn()
    lips.render('life-handler', {
      handler: {
        onError,
        boom(){ throw new Error('sync') },
        async later(){ throw new Error('async') }
      },
      default: '<button class="a" on-click(boom)>a</button><button class="b" on-click(later)>b</button>'
    }).appendTo('#app')

    q('.a').click()
    q('.b').click()
    await turn()
    expect( onError.mock.calls.map( c => c[ 0 ].message ) ).toEqual([ 'sync', 'async' ])
  })

  it('a handler of the parent, run by a child\'s event, reaches the parent\'s onError', () => {
    const parent = vi.fn(), child = vi.fn()
    lips.register('life-emitter', { handler: { onError: child, fire( this: any ){ this.emit('go') } }, default: '<button on-click(fire)>go</button>' })
    lips.render('life-listener', { handler: { onError: parent, go(){ throw new Error('parent') } }, default: '<life-emitter on-go(go)/>' }).appendTo('#app')

    q('button').click()
    expect( parent ).toHaveBeenCalledTimes( 1 )
    expect( child ).not.toHaveBeenCalled()
  })

  it('without onError, it is logged', () => {
    const log = vi.spyOn( console, 'error' ).mockImplementation( () => {} )
    lips.render('life-log', { state: {}, default: '<if( state.a.b )>x</if>' }).appendTo('#app')
    expect( log ).toHaveBeenCalled()
    log.mockRestore()
  })

  it('what an awaited expression throws is the <catch> arm\'s error, as `await` has it', async () => {
    lips.render('life-await', { state: {}, default: '<async await( state.a.b() )><then>no</then><catch [e]><i>{e.constructor.name}</i></catch></async>' }).appendTo('#app')
    await turn()
    expect( q('i')?.textContent ).toBe('TypeError')
  })
})

describe('lifecycle: what a component always has', () => {
  it('a root rendered with no input has an input to read', () => {
    lips.render('life-noinput', { default: '<p>{input.title ?? "Untitled"}</p>' }).appendTo('#app')
    expect( q('p').textContent ).toBe('Untitled')
  })

  it('a root and a nested component with no static have one to keep things in, each its own', () => {
    const onError = vi.fn()
    const keeps = { handler: { onError, onCreate( this: any ){ this.static.n = ( this.static.n ?? 0 ) + 1 } }, default: '<p>{static.n}</p>' }
    lips.register('life-static', keeps )
    lips.render('life-static-root', { ...keeps, default: '<div><life-static/><life-static/></div>' }).appendTo('#app')

    expect( onError ).not.toHaveBeenCalled()
    expect( qa('p').map( p => p.textContent ) ).toEqual([ '1', '1' ])
  })

  it('so does what renderIR renders, given neither', () => {
    const { ir } = compileTemplate('<p>{input.title ?? "Untitled"} {static.n ?? 0}</p>')
    const inst = renderIR( ir, {})
    const host = document.createElement('div')
    inst.mount( host )

    expect( host.textContent ).toBe('Untitled 0')
    expect( inst.self.input ).toEqual( {} )
    expect( inst.self.static ).toEqual( {} )
  })

  it('onInput runs again when a spread brings a key it did not have', async () => {
    const seen: string[] = []
    lips.register('life-spread', { handler: { onInput( i: any ){ seen.push( Object.keys( i ).sort().join() ) } }, default: '<i>{input.a}</i>' })
    const c = lips.render('life-spreader', { state: { o: { a: 1 } as any }, default: '<div><life-spread ...state.o/></div>' }).appendTo('#app')

    c.state.o = { a: 1, b: 2 }
    await turn()
    expect( seen ).toEqual([ 'a', 'a,b' ])
  })
})
