/**
 * RFC-007 — running a template you did not write.
 *
 * One describe per escape route. Each route has a CONTROL that proves
 * the route is real (the same template, rendered as trusted, reaches what
 * the untrusted render must not), and the untrusted render refuses it:
 * a positioned diagnostic where the compiler can know, a reported
 * refusal where only the runtime can. Where a refusal could be too
 * broad, a NEAR MISS proves the safe form still renders untrusted.
 *
 * Copying the CSP spec's discipline (tests/precompile.spec.ts): a spec
 * that asserts something did NOT happen is vacuous unless a control
 * shows it does happen when the guard is off.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as L from '../src/lips'
import { untrusted as guard, untrustedPolicy, checkTemplate } from '../src/untrusted'
import Stylesheet from '../src/stylesheet'
import { compileStyle } from '../src/ir/style'
import { parseTemplate } from '../src/ir/parser'
import { parseExpression, compileExpression, interpretExpression } from '../src/ir/expression'

const Lips = L.default

function settle( check: () => boolean, timeout = 2000 ){
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
const pwned = () => ( window as any ).__lips_pwned
const polluted = () => ( {} as any ).lipsPolluted

let n = 0
/** The mode that claimed "sandboxed" — the control for every expression route */
const trusted = () => new Lips({ mode: 'interpreted' } as any )
const untrusted = ( policy?: any ) => new Lips({ untrusted: guard( policy ) })
const mount = ( lips: any, template: any, input?: any ) => {
  const c = lips.render( `t${n++}`, template, input )
  c.appendTo('#app')
  return c
}

let warn: any
let error: any
/** Compile-time diagnostics the facade reported (template, then style) */
const diagnostics = () => warn.mock.calls
  .filter( ( c: any[] ) => c[0] === '[lips:ir] template diagnostics —' || c[0] === '[lips:ir] style diagnostics —' )
  .flatMap( ( c: any[] ) => c[1] as any[] )
const coded = ( code: string ) => diagnostics().filter( ( d: any ) => d.code === code )
/** Runtime refusals: page-boundary reports, and errors thrown out of expressions */
const refusals = () => [
  ...warn.mock.calls.filter( ( c: any[] ) => c[0] === '[lips:untrusted]' ).map( ( c: any[] ) => c[1] ),
  ...error.mock.calls.map( ( c: any[] ) => c[1] ).filter( ( e: any ) => /^LIPS-U/.test( e?.code ?? '' ) )
] as { code: string, message: string, hint?: string }[]
const refused = ( code: string ) => refusals().filter( r => r.code === code )

/** Line/col of `needle` in a one-line template, as the diagnostics count them */
const at = ( src: string, needle: string, from = 0 ) => ({ line: 1, col: src.indexOf( needle, from ) + 1 })

beforeEach( () => {
  document.body.innerHTML = '<div id="app"></div>'
  warn = vi.spyOn( console, 'warn' ).mockImplementation( () => {} )
  error = vi.spyOn( console, 'error' ).mockImplementation( () => {} )
})
afterEach( () => {
  vi.restoreAllMocks()
  delete ( JSON as any ).lipsMarker
  delete ( window as any ).__lips_pwned
  delete ( window as any ).navigate
  delete ( Object.prototype as any ).lipsPolluted
})

// ==================================================== element references
describe('route: expressions reach the page through self.refs (lips#37)', () => {
  const src = `<input class="f" @ref="field"><button class="go" on-click( () => self.refs.field.ownerDocument.defaultView.__lips_pwned = 'self.refs' )>go</button>`

  it('control: a trusted template reaches window through a ref', () => {
    mount( trusted(), { default: src })
    ;( q('.go') as HTMLElement ).click()
    expect( pwned() ).toBe('self.refs')
  })

  it('untrusted: self.refs is refused where it is written, as self.node is', () => {
    mount( untrusted(), { default: src })
    ;( q('.go') as HTMLElement ).click()

    expect( pwned() ).toBeUndefined()
    const [ d ] = coded('LIPS-U005')
    expect( d ).toMatchObject({ severity: 'error', loc: at( src, 'refs' ) })
  })

  it('near miss: an untrusted template may still name its elements; the host app reads them', () => {
    const c = mount( untrusted(), { default: `<input class="f" @ref="field">` })
    expect( coded('LIPS-U005') ).toEqual( [] )
    expect( ( c as any ).instance.self.refs.field ).toBe( q('.f') )
  })
})

// ============================================================ expressions
describe('route: expressions reach the page through self', () => {
  const src = `<button class="go" on-click( () => self.node[0].ownerDocument.defaultView.__lips_pwned = 'self.node' )>go</button>`

  it('control: the interpreted mode hands self.node — and with it window — to a template', () => {
    mount( trusted(), { default: src })
    ;( q('.go') as HTMLElement ).click()
    expect( pwned() ).toBe('self.node')
  })

  it('untrusted: self.node is refused where it is written, and the handler is never wired', () => {
    mount( untrusted(), { default: src })
    ;( q('.go') as HTMLElement ).click()

    expect( pwned() ).toBeUndefined()
    const [ d ] = coded('LIPS-U005')
    expect( d ).toMatchObject({ severity: 'error', loc: at( src, 'node' ) })
    expect( d.hint ).toBeTruthy()
  })

  it('near miss: the rest of self is reachable — state, lang, emit and handlers', async () => {
    const seen: any[] = []
    const c = mount( untrusted(), {
      state: { n: 1 },
      handler: { bump( this: any ){ this.state.n++ } },
      default: `<b class="n">{self.state.n}</b><button class="go" on-click( bump )>+</button>`
              + `<button class="say" on-click( () => self.emit( 'said', self.state.n ) )>say</button>`
    })
    c.on( 'said', ( v: any ) => seen.push( v ) )

    ;( q('.go') as HTMLElement ).click()
    await settle( () => q('.n')?.textContent === '2' )
    ;( q('.say') as HTMLElement ).click()
    expect( seen ).toEqual([ 2 ])
    expect( diagnostics() ).toEqual([])
  })
})

describe('route: constructor chains reach Function', () => {
  /**
   * `''.constructor.constructor` is the realm's intrinsic Function, which
   * a spy on `globalThis.Function` never sees — so the proof is what the
   * built function DOES.
   */
  const src = `<b class="r">{ ''.constructor.constructor('window.__lips_pwned = "Function"; return 7')() }</b>`

  it('control: the interpreted mode builds and runs a Function from template text', () => {
    mount( trusted(), { default: src })
    expect( q('.r')?.textContent ).toBe('7')
    expect( pwned() ).toBe('Function')
  })

  it('untrusted: constructor is refused at its position and nothing is built', () => {
    mount( untrusted(), { default: src })

    expect( q('.r')?.textContent ).toBe('')
    expect( pwned() ).toBeUndefined()
    expect( coded('LIPS-U002')[0] ).toMatchObject({ loc: at( src, 'constructor' ) })
  })

  it('untrusted: a computed key built at runtime is refused when it is read', () => {
    mount( untrusted(), {
      state: { k: 'con' },
      default: `<b class="r">{ ''[ state.k + 'structor' ][ state.k + 'structor' ]('window.__lips_pwned = 1; return 7')() }</b>`
    })

    expect( q('.r')?.textContent ).toBe('')
    expect( pwned() ).toBeUndefined()
    expect( refused('LIPS-U002').length ).toBeGreaterThan( 0 )
  })
})

describe('route: __proto__ and prototype pollute every object on the page', () => {
  const src = `<b>{ ( state.__proto__.lipsPolluted = 'yes' ) && '' }</b>`

  it('control: the interpreted mode writes through state.__proto__ to Object.prototype', () => {
    mount( trusted(), { state: {}, default: src })
    expect( polluted() ).toBe('yes')
  })

  it('untrusted: __proto__ is refused and Object.prototype is untouched', () => {
    mount( untrusted(), { state: {}, default: src })
    expect( polluted() ).toBeUndefined()
    expect( coded('LIPS-U002')[0] ).toMatchObject({ loc: at( src, '__proto__' ) })
  })

  it('untrusted: an object literal cannot set its own prototype either', () => {
    mount( untrusted(), { default: `<b>{ ({ __proto__: state }).n }</b>` })
    expect( coded('LIPS-U002') ).toHaveLength( 1 )
  })
})

describe("route: Object's reflection reaches prototypes through the whitelist", () => {
  const src = `<b>{ Object.defineProperty( Object.getPrototypeOf( state ), 'lipsPolluted', { value: 'yes', configurable: true } ) && '' }</b>`

  it('control: the interpreted mode offers Object.defineProperty and Object.getPrototypeOf', () => {
    mount( trusted(), { state: {}, default: src })
    expect( polluted() ).toBe('yes')
  })

  it('untrusted: Object offers keys/values/entries/fromEntries only; the rest is refused by name', () => {
    mount( untrusted(), { state: {}, default: src })
    expect( polluted() ).toBeUndefined()
    expect( coded('LIPS-U003').map( ( d: any ) => d.loc.col ) ).toEqual([
      at( src, 'defineProperty' ).col,
      at( src, 'getPrototypeOf' ).col
    ])
  })

  it('near miss: the offered helpers work', () => {
    mount( untrusted(), {
      state: { o: { a: 1, b: 2 } },
      default: `<b class="k">{ Object.keys( state.o ).join(',') } { Math.max( 1, 3 ) } { JSON.stringify( [1] ) }</b>`
    })
    expect( q('.k')?.textContent ).toBe('a,b 3 [1]')
    expect( diagnostics() ).toEqual([])
  })

  /**
   * A marker, not an overwrite: a template that replaces `Math.max`
   * replaces it for the page — this test runner included.
   */
  it('control: the interpreted mode hands a template the page’s own JSON — writable', () => {
    mount( trusted(), { default: `<b>{ ( JSON.lipsMarker = 'set' ) && '' }</b>` })
    expect( ( JSON as any ).lipsMarker ).toBe('set')
  })

  it('untrusted: an offered global cannot be written', () => {
    mount( untrusted(), { default: `<b>{ ( JSON.lipsMarker = 'set' ) && '' }</b>` })
    expect( ( JSON as any ).lipsMarker ).toBeUndefined()
    expect( coded('LIPS-U003') ).toHaveLength( 1 )
  })
})

describe('route: names looked up through Object.prototype', () => {
  /**
   * The interpreter's arrow frames and its globals table were `{}`, so
   * `name in table` found Object.prototype's members: `constructor`
   * resolved to `Object` and `__proto__` to Object.prototype. Compiled
   * mode had the same lookup in its rename table.
   */
  const NAMES = [ '( x => constructor )( 0 )', '( x => __proto__ )( 0 )', 'toString', 'hasOwnProperty' ]

  it('control: a declared scope name resolves in both executors', () => {
    const env = { scope: { a: 1 } }
    expect( interpretExpression( parseExpression('a').ast, env ) ).toBe( 1 )
    expect( compileExpression( 'a', [ 'a' ] ).run( env ) ).toBe( 1 )
  })

  it('the interpreted mode resolves only scope, metavars and its globals', () => {
    for( const src of NAMES )
      expect( interpretExpression( parseExpression( src ).ast, {} ), src ).toBeUndefined()
  })

  /**
   * Compiled mode resolves a free name through the global object, like any
   * JavaScript would — it was never a boundary. The bug was the source it
   * emitted: `function Object() { [native code] }` in place of the name.
   */
  it('compiled mode emits them as the names they are', () => {
    for( const src of NAMES )
      expect( () => compileExpression( src ).run({}), src ).not.toThrow()
  })

  it('untrusted: a name nothing provides is refused where it is written', () => {
    const src = `<b>{ ( x => constructor )( 0 ) }{ window.document }{ globalThis }</b>`
    mount( untrusted(), { default: src })
    expect( coded('LIPS-U001').map( ( d: any ) => d.loc.col ) ).toEqual([
      at( src, 'constructor' ).col,
      at( src, 'window' ).col,
      at( src, 'globalThis' ).col
    ])
  })
})

describe('route: event objects lead from a handler to the document', () => {
  const src = `<button class="go" on-click( e => e.target.ownerDocument.defaultView.__lips_pwned = 'event' )>go</button>`

  it('control: the interpreted mode hands handlers the DOM event', () => {
    mount( trusted(), { default: src })
    ;( q('.go') as HTMLElement ).click()
    expect( pwned() ).toBe('event')
  })

  it('untrusted: a handler receives a snapshot of the event, never a node', () => {
    mount( untrusted(), { default: src })
    ;( q('.go') as HTMLElement ).click()
    expect( pwned() ).toBeUndefined()
  })

  it('near miss: what forms need is in the snapshot — target.value, key, preventDefault', async () => {
    mount( untrusted(), {
      state: { q: '', k: '' },
      default: `<input class="in" on-input( e => state.q = e.target.value ) on-keydown( e => e.preventDefault() || ( state.k = e.key ) )>`
              + `<b class="q">{state.q}/{state.k}</b>`
    })
    const input = q('.in') as HTMLInputElement
    input.value = 'hi'
    input.dispatchEvent( new Event('input') )
    const key = new KeyboardEvent( 'keydown', { key: 'Enter', cancelable: true })
    input.dispatchEvent( key )

    await settle( () => q('.q')?.textContent === 'hi/Enter' )
    expect( key.defaultPrevented ).toBe( true )
  })
})

describe('route: host data that holds a node', () => {
  const src = `<b>{ ( input.host.ownerDocument.defaultView.__lips_pwned = 'input' ) && '' }</b>`

  it('control: a node the host passes in is a way out for the template', () => {
    mount( trusted(), { default: src }, { host: document.body })
    expect( pwned() ).toBe('input')
  })

  it('untrusted: holding a node is refused when it is read', () => {
    mount( untrusted(), { default: src }, { host: document.body })
    expect( pwned() ).toBeUndefined()
    expect( refused('LIPS-U004') ).toHaveLength( 1 )
  })

  it('near miss: plain data the host passes in is read as usual', () => {
    mount( untrusted(), { default: `<b class="l">{input.label}</b>` }, { label: 'ok' })
    expect( q('.l')?.textContent ).toBe('ok')
  })
})

describe('route: console', () => {
  const src = `<b>{ console.log('lips-console') && '' }</b>`

  it('control: the interpreted mode offers console', () => {
    const log = vi.spyOn( console, 'log' ).mockImplementation( () => {} )
    mount( trusted(), { default: src })
    expect( log ).toHaveBeenCalledWith('lips-console')
  })

  it('untrusted: console is not offered — refused where it is named', () => {
    const log = vi.spyOn( console, 'log' ).mockImplementation( () => {} )
    mount( untrusted(), { default: src })
    expect( log ).not.toHaveBeenCalledWith('lips-console')
    expect( coded('LIPS-U001')[0] ).toMatchObject({ loc: at( src, 'console' ) })
  })

  it('decision: <log> still prints values — Lips makes the call, the template holds no console', () => {
    const log = vi.spyOn( console, 'log' ).mockImplementation( () => {} )
    mount( untrusted(), { state: { v: 1 }, default: `<log( 'v', state.v )>` })
    expect( log ).toHaveBeenCalledWith( 'v', 1 )
  })
})

describe('route: an event instruction names a member of self', () => {
  /**
   * `on-click( name, … )` falls back to `self[name]` when `name` is not an
   * expression value. Whatever the policy says about `self.<name>` must
   * hold for the bare name too, or a policy is one spelling away from
   * being bypassed.
   */
  const noContext = () => ({
    ...untrustedPolicy,
    self( key: string, write?: boolean ){
      return key === 'setContext' ? { code: 'LIPS-U005', message: 'no context writes' } : untrustedPolicy.self( key, write )
    }
  })
  const src = `<button class="a" on-click( setContext, 'user', 'mallory' )>a</button>`
            + `<button class="b" on-click( () => self.setContext( 'user', 'eve' ) )>b</button>`

  it('control: the default untrusted policy lets a template write its own context', async () => {
    const lips = untrusted()
    mount( lips, { default: src })
    ;( q('.a') as HTMLElement ).click()
    await settle( () => lips.getContext().user === 'mallory' )
  })

  it('a policy that refuses self.setContext refuses it by both spellings, where they are written', () => {
    const lips = untrusted( noContext() )
    mount( lips, { default: src })
    ;( q('.a') as HTMLElement ).click()
    ;( q('.b') as HTMLElement ).click()

    expect( lips.getContext().user ).toBeUndefined()
    expect( coded('LIPS-U005').map( ( d: any ) => d.loc.col ) ).toEqual([
      at( src, 'setContext' ).col,
      at( src, 'setContext', at( src, 'self.' ).col ).col
    ])
  })
})

// ================================================================= markup
describe('route: @html', () => {
  const markup = `<img class="i" src="x.png" onerror="window.__lips_pwned = 1"><b class="kept">ok</b><script>window.__lips_pwned = 2</script>`
  const template = { state: { markup }, default: `<div class="h" @html=state.markup></div>` }

  it('control: trusted @html inserts handlers and scripts as written', () => {
    mount( trusted(), template )
    expect( q('.h .i')?.hasAttribute('onerror') ).toBe( true )
    expect( q('.h script') ).not.toBeNull()
  })

  it('untrusted: the markup is held to the same element and attribute rules as the template', () => {
    mount( untrusted(), template )
    expect( q('.h .i')?.hasAttribute('onerror') ).toBe( false )
    expect( q('.h script') ).toBeNull()
    expect( q('.h .kept')?.textContent ).toBe('ok')
    expect( refused('LIPS-U020') ).toHaveLength( 1 )
    expect( refused('LIPS-U010') ).toHaveLength( 1 )
  })
})

describe('route: elements that run script, load documents or rewrite the page', () => {
  const src = `<div><script>window.__lips_pwned = 1</script><iframe src="https://evil.example/"></iframe><object data="x.swf"></object><embed src="x.swf"><base href="https://evil.example/"><meta http-equiv="refresh" content="0"><link rel="stylesheet" href="https://evil.example/x.css"><style></style><b class="ok">ok</b></div>`
  const tags = [ 'script', 'iframe', 'object', 'embed', 'base', 'meta', 'link', 'style' ]

  it('control: trusted templates emit them', () => {
    mount( trusted(), { default: src })
    for( const tag of tags ) expect( q(`#app ${tag}`), tag ).not.toBeNull()
  })

  it('untrusted: each is refused at its position and none reaches the page', () => {
    mount( untrusted(), { default: src })
    for( const tag of tags ) expect( q(`#app ${tag}`), tag ).toBeNull()
    expect( coded('LIPS-U010').map( ( d: any ) => d.loc.col ) ).toEqual( tags.map( t => at( src, `<${t}` ).col ) )
    expect( q('.ok')?.textContent ).toBe('ok')
  })
})

describe('route: dynamic tags', () => {
  const template = { state: { tag: 'script' }, default: `<div class="d"><{state.tag}>window.__lips_pwned = 'dyn'</></div>` }

  it('control: a trusted dynamic tag creates the element named by data', () => {
    mount( trusted(), template )
    expect( q('.d script') ).not.toBeNull()
  })

  it('untrusted: the tag is refused when it is resolved', () => {
    mount( untrusted(), template )
    expect( q('.d script') ).toBeNull()
    expect( refused('LIPS-U010') ).toHaveLength( 1 )
  })

  it('untrusted: a literal tag is refused where it is written', () => {
    const src = `<div><{'iframe'} src="https://evil.example/"/></div>`
    mount( untrusted(), { default: src })
    expect( q('#app iframe') ).toBeNull()
    expect( coded('LIPS-U010')[0] ).toMatchObject({ loc: at( src, `'iframe'` ) })
  })

  it('near miss: an ordinary element by name renders', () => {
    mount( untrusted(), { state: { tag: 'section' }, default: `<div class="d"><{state.tag} class="s">x</></div>` })
    expect( q('.d section.s')?.textContent ).toBe('x')
  })
})

describe('route: custom elements and customized built-ins run page script', () => {
  it('control: a trusted template instantiates any custom element by name', () => {
    mount( trusted(), { default: `<x-widget class="ce"></x-widget>` })
    expect( q('x-widget') ).not.toBeNull()
  })

  it('untrusted: an unregistered custom element is refused when it is resolved', () => {
    mount( untrusted(), { default: `<x-widget class="ce"></x-widget>` })
    expect( q('x-widget') ).toBeNull()
    expect( refused('LIPS-U011') ).toHaveLength( 1 )
  })

  it('near miss: a component the host registered renders', () => {
    const lips = untrusted()
    lips.register( 'x-card', { default: `<i class="card">card</i>` })
    mount( lips, { default: `<x-card/>` })
    expect( q('.card')?.textContent ).toBe('card')
  })

  it('untrusted: is= is refused where it is written', () => {
    const src = `<button is="x-admin">b</button>`
    mount( untrusted(), { default: src })
    expect( q('#app button')?.hasAttribute('is') ).toBe( false )
    expect( coded('LIPS-U021')[0] ).toMatchObject({ loc: at( src, 'is=' ) })
  })
})

describe('route: attributes — handlers, script URLs, srcdoc, formaction', () => {
  it('control: trusted templates emit them as written', () => {
    mount( trusted(), { default: `<b class="c" onclick="x()">x</b><a class="j" href="javascript:x()">j</a>` })
    expect( q('.c')?.getAttribute('onclick') ).toBe('x()')
    expect( q('.j')?.getAttribute('href') ).toBe('javascript:x()')
  })

  it('untrusted: each is refused at its position', () => {
    const src = `<b class="c" onclick="x()" ONMOUSEOVER="x()">x</b>`
              + `<a class="j" href="javascript:x()">j</a>`
              + `<a class="t" href=" Java\tScript:x()">t</a>`
              + `<a class="dt" href="data:text/html,<b>x</b>">d</a>`
              + `<form class="f"><button class="fa" formaction="javascript:x()">f</button></form>`
              + `<img class="sd" srcdoc="<b>x</b>">`
    mount( untrusted(), { default: src })

    expect( q('.c')?.attributes.length ).toBe( 1 ) // class only
    for( const [ sel, attr ] of [ [ '.j', 'href' ], [ '.t', 'href' ], [ '.dt', 'href' ], [ '.fa', 'formaction' ], [ '.sd', 'srcdoc' ] ] )
      expect( q( sel )?.hasAttribute( attr ), sel ).toBe( false )

    expect( coded('LIPS-U020').map( ( d: any ) => d.loc.col ) ).toEqual([ at( src, 'onclick' ).col, at( src, 'ONMOUSEOVER' ).col ])
    expect( coded('LIPS-U030').map( ( d: any ) => d.loc.col ) ).toEqual([
      at( src, 'href="javascript' ).col,
      at( src, 'href=" Java' ).col,
      at( src, 'href="data' ).col,
      at( src, 'formaction' ).col
    ])
    expect( coded('LIPS-U021')[0] ).toMatchObject({ loc: at( src, 'srcdoc' ) })
  })

  it('untrusted: a URL from data is checked when it is written', async () => {
    const c = mount( untrusted(), { state: { url: 'javascript:x()' }, default: `<a class="d" href=state.url>d</a>` })
    expect( q('.d')?.hasAttribute('href') ).toBe( false )
    expect( refused('LIPS-U030') ).toHaveLength( 1 )

    c.state.url = '/ok'
    await settle( () => q('.d')?.getAttribute('href') === '/ok' )
  })

  it('near miss: relative, http(s), mailto, tel, fragments and raster data URLs pass', () => {
    const urls = [ '/a', 'b/c', '#x', '?q=1', 'https://example.com/', 'http://example.com/', 'mailto:a@b.c', 'tel:+1', 'data:image/png;base64,iVBORw0KGgo=' ]
    mount( untrusted(), { default: urls.map( ( u, i ) => `<a class="u${i}" href="${u}">u</a>` ).join('') })
    urls.forEach( ( u, i ) => expect( q(`.u${i}`)?.getAttribute('href') ).toBe( u ) )
    expect( diagnostics() ).toEqual([])
  })
})

describe('route: attributes that reach the host page by name', () => {
  it('untrusted: id/name that clobber a document property are refused', () => {
    const src = `<img class="a" name="cookie" src="/a.png"><b class="b" id="body">b</b><input class="e" name="email">`
    mount( untrusted(), { default: src })
    expect( q('.a')?.hasAttribute('name') ).toBe( false )
    expect( q('.b')?.hasAttribute('id') ).toBe( false )
    expect( q('.e')?.getAttribute('name') ).toBe('email') // near miss
    expect( coded('LIPS-U022').map( ( d: any ) => d.loc.col ) ).toEqual([ at( src, 'name="cookie"' ).col, at( src, 'id=' ).col ])
  })

  it('untrusted: form= (joins a host form by id) is refused', () => {
    const src = `<input class="f" form="checkout" name="amount">`
    mount( untrusted(), { default: src })
    expect( q('.f')?.hasAttribute('form') ).toBe( false )
    expect( coded('LIPS-U021')[0] ).toMatchObject({ loc: at( src, 'form=' ) })
  })
})

describe('route: spreads write attributes chosen by data', () => {
  const template = {
    state: { attrs: { onclick: 'x()', href: 'javascript:x()', title: 'kept' } },
    default: `<a class="s" ...state.attrs>s</a>`
  }

  it('control: a trusted spread writes every key', () => {
    mount( trusted(), template )
    expect( q('.s')?.getAttribute('onclick') ).toBe('x()')
  })

  it('untrusted: each key is held to the attribute rules', () => {
    mount( untrusted(), template )
    expect( q('.s')?.getAttribute('title') ).toBe('kept')
    expect( q('.s')?.hasAttribute('onclick') ).toBe( false )
    expect( q('.s')?.hasAttribute('href') ).toBe( false )
    expect( refused('LIPS-U020') ).toHaveLength( 1 )
    expect( refused('LIPS-U030') ).toHaveLength( 1 )
  })
})

describe('route: a comment the parser and the browser read differently', () => {
  /**
   * `<!-->` opens AND closes an empty comment for the browser, but the
   * Lips parser reads on to the next `-->`. The compiler re-emitted the
   * comment verbatim, so markup the template parser saw as comment text
   * was parsed by the browser as elements.
   */
  const src = `<div class="cd"><!--><img class="injected" src="x.png" onerror="x()">--></div>`

  it('control: the template parser reads all of it as one comment', () => {
    const div = parseTemplate( src ).root.children[0] as any
    expect( div.children.map( ( c: any ) => c.t ) ).toEqual([ 'comment' ])
  })

  it('a comment renders as a comment — trusted', () => {
    mount( trusted(), { default: src })
    expect( q('.injected') ).toBeNull()
  })

  it('a comment renders as a comment — untrusted', () => {
    mount( untrusted(), { default: src })
    expect( q('.injected') ).toBeNull()
  })
})

describe('route: precompiled IR from the untrusted party', () => {
  const ir = { v: 1, exprs: [], root: { html: '<img class="raw" src="x.png" onerror="x()"><script></script>', scope: [], binds: [], blocks: [] } }

  it('control: trusted IR skeletons are rendered as they come', () => {
    mount( trusted(), { ir })
    expect( q('.raw')?.hasAttribute('onerror') ).toBe( true )
  })

  it('untrusted: the skeleton is checked by the same rules before its first use', () => {
    mount( untrusted(), { ir })
    expect( q('.raw')?.hasAttribute('onerror') ).toBe( false )
    expect( q('#app script') ).toBeNull()
    expect( refused('LIPS-U020') ).toHaveLength( 1 )
    expect( refused('LIPS-U010') ).toHaveLength( 1 )
  })
})

describe('route: template objects built from data', () => {
  const template = { state: { page: { default: '<b class="tp" onclick="x()">tp</b>' } }, default: `<{state.page}/>` }

  it('control: a trusted dynamic template object compiles as written', () => {
    mount( trusted(), template )
    expect( q('.tp')?.hasAttribute('onclick') ).toBe( true )
  })

  it('untrusted: it compiles under the same policy', () => {
    mount( untrusted(), template )
    expect( q('.tp')?.textContent ).toBe('tp')
    expect( q('.tp')?.hasAttribute('onclick') ).toBe( false )
    expect( coded('LIPS-U020') ).toHaveLength( 1 )
  })
})

// ================================================================= styles
describe('route: stylesheets — @import and loads', () => {
  const sheetOf = ( nsp: string ) => document.head.querySelector(`style[rel="${nsp}"]`)?.textContent ?? null

  it('control: a trusted sheet ships @import and url() as written', () => {
    mount( trusted(), { stylesheet: `@import url(https://evil.example/x.css); .a { color: red }`, default: `<b class="a">a</b>` })
    expect( sheetOf(`t${n - 1}`) ).toContain('@import')
  })

  it('untrusted: @import is refused at its position and the sheet is not injected', () => {
    const stylesheet = `.a { color: red }\n@import url(https://evil.example/x.css);`
    mount( untrusted(), { stylesheet, default: `<b class="a">a</b>` })
    expect( sheetOf(`t${n - 1}`) ).toBeNull()
    expect( coded('LIPS-U040')[0] ).toMatchObject({ loc: { line: 2, col: 1 } })
  })

  it('untrusted: escapes do not hide @import', () => {
    mount( untrusted(), { stylesheet: `@\\69mport url(https://evil.example/x.css);`, default: `<b>a</b>` })
    expect( coded('LIPS-U040') ).toHaveLength( 1 )
  })

  it('untrusted: url() is held to the URL rule, image-set() is refused', () => {
    mount( untrusted(), { stylesheet: `.a { background: url(javascript:x()) }\n.b { background: image-set("https://evil.example/x.png" 1x) }`, default: `<b>a</b>` })
    expect( sheetOf(`t${n - 1}`) ).toBeNull()
    expect( coded('LIPS-U030')[0] ).toMatchObject({ loc: { line: 1 } })
    expect( coded('LIPS-U041')[0] ).toMatchObject({ loc: { line: 2 } })
  })

  it('near miss: a sheet with ordinary rules and a relative url() is injected', () => {
    mount( untrusted(), { stylesheet: `.a { color: red; background: url(/hero.png) }`, default: `<b class="a">a</b>` })
    expect( sheetOf(`t${n - 1}`) ).toContain('url(/hero.png)')
    expect( diagnostics() ).toEqual([])
  })
})

describe('route: inline styles and reactive declarations', () => {
  it('untrusted: a literal style= is held to the CSS rule where it is written', () => {
    const src = `<b class="a" style="background: url(javascript:x())">a</b>`
    mount( untrusted(), { default: src })
    expect( q('.a')?.hasAttribute('style') ).toBe( false )
    expect( coded('LIPS-U030')[0] ).toMatchObject({ loc: at( src, 'style=' ) })
  })

  it('untrusted: a style= from data is checked when it is written', async () => {
    const c = mount( untrusted(), { state: { bg: 'url(javascript:x())' }, default: `<b class="a" style="background: {state.bg}">a</b>` })
    expect( q('.a')?.hasAttribute('style') ).toBe( false )
    expect( refused('LIPS-U030') ).toHaveLength( 1 )

    c.state.bg = 'red'
    await settle( () => ( q('.a') as HTMLElement )?.style.background === 'red' )
  })

  it('untrusted: a reactive declaration is checked when it is written', async () => {
    const c = mount( untrusted(), {
      state: { bg: 'url(javascript:x())' },
      stylesheet: `.a { --bg: {state.bg} }`,
      default: `<b class="a">a</b>`
    })
    expect( ( q('.a') as HTMLElement ).style.getPropertyValue('--bg') ).toBe('')
    expect( refused('LIPS-U030') ).toHaveLength( 1 )

    c.state.bg = 'red'
    await settle( () => ( q('.a') as HTMLElement ).style.getPropertyValue('--bg') === 'red' )
  })
})

describe('route: a scope name that closes its own selector', () => {
  /**
   * A template object's `name` becomes its scope (`[rel="<name>"]`), and
   * an untrusted one picks its own. Unescaped, a quote in it closes the
   * attribute selector and the sheet applies to the whole page; in the
   * injector's lookup it selected arbitrary <head> elements.
   */
  const nsp = 'x"],body,[rel="y'

  it('the scope wrap quotes the name', () => {
    const { ir } = compileStyle( '.a { color: red }', { nsp })
    expect( ir.css.startsWith('[rel="x\\"],body,[rel=\\"y"]{') ).toBe( true )
  })

  it('the injector looks up its own <style> only', () => {
    document.head.innerHTML = '<meta id="victim">'
    new Stylesheet( 'a"],#victim,[x="', { sheet: 'b{}' })
    expect( document.getElementById('victim')?.hasAttribute('dindex') ).toBe( false )
    expect( document.head.querySelectorAll('style') ).toHaveLength( 1 )
    document.head.innerHTML = ''
  })
})

// ===================================================== macros, slots, context
describe('route: macros, slots and context', () => {
  it('control: a trusted macro body emits its handler attribute', () => {
    mount( trusted(), { macros: `<macro name="evil"><b class="m" onclick="x()">m</b></macro>`, default: `<evil/>` })
    expect( q('.m')?.hasAttribute('onclick') ).toBe( true )
  })

  it('untrusted: a macro body is held to the policy, positioned in the macros source', () => {
    const macros = `<macro name="evil">\n  <b class="m" onclick="x()">m</b>\n</macro>`
    mount( untrusted(), { macros, default: `<evil/>` })
    expect( q('.m')?.hasAttribute('onclick') ).toBe( false )
    expect( coded('LIPS-U020')[0] ).toMatchObject({ loc: { line: 2, col: 16 } })
  })

  it('untrusted: slotted content is held to the policy of the template that wrote it', () => {
    const lips = untrusted()
    lips.register( 'card', { default: `<section class="card"><{input.renderer}/></section>` })
    const src = `<card><b class="sl" onclick="x()">s</b></card>`
    mount( lips, { default: src })
    expect( q('.card .sl')?.textContent ).toBe('s')
    expect( q('.sl')?.hasAttribute('onclick') ).toBe( false )
    expect( coded('LIPS-U020')[0] ).toMatchObject({ loc: at( src, 'onclick' ) })
  })

  it('decision: context is the untrusted instance’s own — a write never reaches another instance', async () => {
    const host = new Lips({ context: { user: 'ada' } })
    const lips = untrusted()
    mount( lips, { default: `<button class="go" on-click( setContext, 'user', 'mallory' )>go</button><context k="v"><b class="k">{context.k}</b></context>` })
    ;( q('.go') as HTMLElement ).click()
    await settle( () => lips.getContext().user === 'mallory' )
    expect( host.getContext().user ).toBe('ada')
    expect( q('.k')?.textContent ).toBe('v')
  })
})

// ================================================================= router
describe('route: the router owns the page URL', () => {
  const template = {
    state: { routes: [{ path: '/', template: { default: '<b class="home">home</b>' }, default: true }] },
    default: `<router routes=state.routes global/>`
  }

  it('control: a trusted <router global> installs window.navigate', async () => {
    mount( trusted(), template )
    await settle( () => typeof ( window as any ).navigate === 'function' )
  })

  it('untrusted: <router> is refused where it is written', () => {
    mount( untrusted(), template )
    expect( ( window as any ).navigate ).toBeUndefined()
    expect( coded('LIPS-U012')[0] ).toMatchObject({ loc: at( template.default, '<router' ) })
  })

  it('untrusted: and when it is named by data', () => {
    mount( untrusted(), { state: { r: 'router' }, default: `<{state.r} global/>` })
    expect( ( window as any ).navigate ).toBeUndefined()
    expect( refused('LIPS-U012') ).toHaveLength( 1 )
  })
})

// ============================================================ the mode itself
describe('the untrusted mode', () => {
  it('control: compiled mode constructs Functions', () => {
    const spy = vi.spyOn( globalThis, 'Function' as any )
    mount( new Lips(), { state: { u1: 'a' }, default: `<b>{state.u1 + 'x'}</b>` })
    expect( spy ).toHaveBeenCalled()
  })

  it('never constructs a Function — render, update and events', async () => {
    const spy = vi.spyOn( globalThis, 'Function' as any )
    const c = mount( untrusted(), {
      state: { n: 1, items: [ 'x', 'y' ] },
      default: `<b class="n">{state.n}</b><for [it] in=state.items><i class="it">{it}</i></for>`
              + `<button class="up" on-click( () => state.n++ )>+</button>`
    })
    ;( q('.up') as HTMLElement ).click()
    await settle( () => q('.n')?.textContent === '2' )
    expect( c.node.length ).toBeGreaterThan( 0 )
    expect( spy ).not.toHaveBeenCalled()
  })

  it('mode: "compiled" cannot switch the guard off', () => {
    const spy = vi.spyOn( globalThis, 'Function' as any )
    mount( new Lips({ untrusted: guard(), mode: 'compiled' }), { state: { u2: 'a' }, default: `<b class="m">{state.u2 + 'x'}</b><b>{ self.node }</b>` })
    expect( q('.m')?.textContent ).toBe('ax')
    expect( spy ).not.toHaveBeenCalled()
    expect( coded('LIPS-U005') ).toHaveLength( 1 )
  })

  it('takes a replacement policy — one place decides', () => {
    const seen: any[] = []
    const strict = {
      ...untrustedPolicy,
      url( value: string ){
        return /^https:/.test( value ) ? undefined : { code: 'LIPS-U030', message: `${value} is not https` }
      },
      report: ( r: any ) => seen.push( r )
    }
    mount( untrusted( strict ), { state: { u: '/relative' }, default: `<a class="a" href=state.u>a</a><a class="b" href="https://ok.example/">b</a>` })
    expect( q('.a')?.hasAttribute('href') ).toBe( false )
    expect( q('.b')?.getAttribute('href') ).toBe('https://ok.example/')
    expect( seen.map( r => r.code ) ).toEqual([ 'LIPS-U030' ])
  })

  it('reports every compile-time refusal through compileTemplate as well', () => {
    const src = `<b onclick="x()">{ self.node }</b>`
    const { diagnostics: ds } = L.compileTemplate( src, { check: checkTemplate( untrustedPolicy ) })
    expect( ds.map( ( d: any ) => [ d.code, d.loc.line, d.loc.col ] ) ).toEqual([
      [ 'LIPS-U020', 1, at( src, 'onclick' ).col ],
      [ 'LIPS-U005', 1, at( src, 'node' ).col ]
    ])
  })
})

describe('untrusted: blocks inside an svg', () => {
  const SVG = 'http://www.w3.org/2000/svg'

  it('a <for> of paths draws svg paths, swept as any skeleton is', async () => {
    mount( untrusted(), { state: { ds: [ 'M1 1h2' ] }, default: `<svg class="s"><for [d] in=state.ds><path d=d onclick="x()"/></for></svg>` })
    await settle( () => !!q('svg.s path') )
    expect( q('svg.s path')!.namespaceURI ).toBe( SVG )
    expect( q('svg.s path')!.hasAttribute('onclick') ).toBe( false )
  })

  it('@html on an svg element parses its markup as svg', async () => {
    mount( untrusted(), { state: { m: '<circle r="2"></circle>' }, default: `<svg class="h" @html=state.m></svg>` })
    await settle( () => !!q('svg.h circle') )
    expect( q('svg.h circle')!.namespaceURI ).toBe( SVG )
  })

  it('@html on a <foreignObject> parses its markup as HTML', async () => {
    mount( untrusted(), { state: { m: '<p>x</p>' }, default: `<svg><foreignObject class="f" @html=state.m></foreignObject></svg>` })
    await settle( () => !!q('.f p') )
    expect( q('.f p')!.namespaceURI ).toBe('http://www.w3.org/1999/xhtml')
  })
})
