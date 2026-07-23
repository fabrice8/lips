import { describe, it, expect, vi, beforeEach } from 'vitest'
import Lips from '../src/lips'

/**
 * BEHAVIOR SUITE — the public API contract.
 *
 * Born as the parity gate that qualified the IR engine against the
 * legacy digest engine. The legacy engine has since been deleted, so
 * this now stands as the framework's behavior contract: everything a
 * template can express, asserted through `new Lips()`.
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

const q = ( sel: string ) => document.querySelector( sel )
const qa = ( sel: string ) => [ ...document.querySelectorAll( sel ) ]

function parity( engineName: string, createLips: () => any ){
  describe(`parity: ${engineName}`, () => {
    let lips: any
    beforeEach( () => {
      document.body.innerHTML = '<div id="app"></div>'
      lips = createLips()
    })

    it('renders static templates', () => {
      lips.render('p-static', { default: `<div class="box"><span>hello</span></div>` }).appendTo('#app')
      expect( q('.box span')?.textContent ).toBe('hello')
    })

    it('interpolates state into text', () => {
      lips.render('p-interp', {
        state: { name: 'lips' },
        default: `<p>Hi {state.name}!</p>`
      }).appendTo('#app')

      expect( q('p')?.textContent ).toBe('Hi lips!')
    })

    it('binds expression attributes', () => {
      lips.render('p-attr', {
        state: { size: 4 },
        default: `<div id="{'box-' + state.size}" data-n=state.size></div>`
      }).appendTo('#app')

      const el = q('#app div')
      expect( el?.getAttribute('id') ).toBe('box-4')
      expect( el?.getAttribute('data-n') ).toBe('4')
    })

    it('updates text when state changes', async () => {
      const c = lips.render('p-count', { state: { count: 0 }, default: `<span>{state.count}</span>` })
      c.appendTo('#app')

      expect( q('span')?.textContent ).toBe('0')
      c.state.count = 7
      await settle( () => q('span')?.textContent === '7' )
    })

    it('updates on deep state mutation', async () => {
      const c = lips.render('p-deep', {
        state: { user: { name: 'Ada' } },
        default: `<b>{state.user.name}</b>`
      })
      c.appendTo('#app')

      c.state.user.name = 'Grace'
      await settle( () => q('b')?.textContent === 'Grace' )
    })

    it('invokes named handlers with arguments', async () => {
      const c = lips.render('p-args', {
        state: { picked: '' },
        handler: {
          pick( this: any, value: string ){ this.state.picked = value }
        },
        default: `<div><i>{state.picked}</i><a on-click( pick, 'red' )>red</a></div>`
      })
      c.appendTo('#app')

      ;( q('a') as HTMLElement ).click()
      await settle( () => q('i')?.textContent === 'red' )
    })

    it('toggles <if>/<else> branches', async () => {
      const c = lips.render('p-if', {
        state: { on: true },
        default: `
          <div>
            <if( state.on )><span class="yes">yes</span></if>
            <else><span class="no">no</span></else>
          </div>`
      })
      c.appendTo('#app')

      await settle( () => !!q('.yes') )
      expect( q('.no') ).toBeNull()

      c.state.on = false
      await settle( () => !!q('.no') )
      expect( q('.yes') ).toBeNull()
    })

    it('renders and mutates lists', async () => {
      const c = lips.render('p-for', {
        state: { items: [ 'a', 'b', 'c' ] },
        default: `<ul><for [item, i] in=state.items><li>{i}:{item}</li></for></ul>`
      })
      c.appendTo('#app')

      await settle( () => qa('li').length === 3 )
      expect( qa('li').map( li => li.textContent ) ).toEqual([ '0:a', '1:b', '2:c' ])

      c.state.items = [ 'c', 'a' ]
      await settle( () => qa('li').length === 2 )
      expect( qa('li').map( li => li.textContent ) ).toEqual([ '0:c', '1:a' ])
    })

    it('preserves node identity across keyed reorder', async () => {
      const c = lips.render('p-keyed', {
        state: { items: [ { id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' } ] },
        default: `<ul><for [item] in=state.items by="id"><li>{item.label}</li></for></ul>`
      })
      c.appendTo('#app')
      await settle( () => qa('li').length === 3 )

      const [ elA, elB, elC ] = qa('li')

      c.state.items = [ { id: 'c', label: 'C' }, { id: 'b', label: 'B' }, { id: 'a', label: 'A' } ]
      await settle( () => qa('li')[0]?.textContent === 'C' )

      const after = qa('li')
      expect( after[0] ).toBe( elC )
      expect( after[1] ).toBe( elB )
      expect( after[2] ).toBe( elA )
    })

    it('warns and recovers on duplicate keys', async () => {
      const warn = vi.spyOn( console, 'warn' ).mockImplementation( () => {} )

      lips.render('p-dupes', {
        state: { items: [ { id: 'a', label: 'A1' }, { id: 'a', label: 'A2' } ] },
        default: `<ul><for [item] in=state.items by="id"><li>{item.label}</li></for></ul>`
      }).appendTo('#app')

      await settle( () => qa('li').length === 2 )
      expect( qa('li').map( li => li.textContent ) ).toEqual([ 'A1', 'A2' ])
      expect( warn ).toHaveBeenCalledWith( expect.stringContaining('duplicate') )
      warn.mockRestore()
    })

    it('flows inputs into registered child components reactively', async () => {
      lips.register('p-badge', { default: `<em class="badge">{input.label}</em>` })

      const c = lips.render('p-nested', {
        state: { text: 'new' },
        default: `<div><p-badge label=state.text/></div>`
      })
      c.appendTo('#app')

      await settle( () => q('.badge')?.textContent === 'new' )

      c.state.text = 'hot'
      await settle( () => q('.badge')?.textContent === 'hot' )
    })

    it('rejects reserved handler names', () => {
      expect( () => lips.render('p-reserved', {
        handler: { destroy(){} },
        default: `<div/>`
      }) ).toThrow( /reserved/ )
    })

    it('injects and clears component stylesheets', async () => {
      const c = lips.render('p-style', {
        default: `<div class="styled">x</div>`,
        stylesheet: `.styled { color: red; }`
      })
      c.appendTo('#app')

      await settle( () => !!document.head.querySelector('style[rel="p-style"]') )

      c.destroy()
      await settle( () => !document.head.querySelector('style[rel="p-style"]') )
    })

    it('renders <switch>/<case>/<default>', async () => {
      const c = lips.render('p-switch', {
        state: { m: 'a' },
        default: `
          <div>
            <switch( state.m )>
              <case is="a"><i class="ca">A</i></case>
              <case is=['b','c']><i class="cbc">BC</i></case>
              <default><i class="cd">D</i></default>
            </switch>
          </div>`
      })
      c.appendTo('#app')

      await settle( () => !!q('.ca') )
      c.state.m = 'c'
      await settle( () => !!q('.cbc') )
      c.state.m = 'zzz'
      await settle( () => !!q('.cd') )
    })


    it('scopes <let> variables to their block', async () => {
      const c = lips.render('p-let', {
        state: { n: 3 },
        default: `<div><let doubled={ state.n * 2 }/><p class="d">{doubled}</p></div>`
      })
      c.appendTo('#app')

      await settle( () => q('.d')?.textContent === '6' )
      c.state.n = 5
      await settle( () => q('.d')?.textContent === '10' )
    })

    it('renders numeric <for from/to> ranges reactively', async () => {
      const c = lips.render('p-range', {
        state: { max: 3 },
        default: `<div><for [x] from="1" to=state.max><i class="r">{x}</i></for></div>`
      })
      c.appendTo('#app')

      await settle( () => qa('.r').length === 3 )
      c.state.max = 5
      await settle( () => qa('.r').length === 5 )
      c.state.max = 2
      await settle( () => qa('.r').map( e => e.textContent ).join('') === '12' )
    })

    it('iterates objects with key/value args', async () => {
      lips.render('p-obj', {
        state: { notes: { fr: 12, en: 15 } },
        default: `<dl><for [k, v] in=state.notes><dt class="e">{k}={v}</dt></for></dl>`
      }).appendTo('#app')

      await settle( () => qa('.e').length === 2 )
      expect( qa('.e').map( e => e.textContent ) ).toEqual([ 'fr=12', 'en=15' ])
    })

    it('binds @html and @text', async () => {
      const c = lips.render('p-meta', {
        state: { raw: '<b>bold</b>', txt: 'plain' },
        default: `<div><div class="h" @html=state.raw></div><p class="t" @text=state.txt></p></div>`
      })
      c.appendTo('#app')

      await settle( () => !!q('.h b') )
      expect( q('.t')?.textContent ).toBe('plain')

      c.state.txt = 'updated'
      await settle( () => q('.t')?.textContent === 'updated' )
    })


    it('expands macros with argv and arguments', async () => {
      lips.render('p-macro', {
        macros: `<macro [label, tone] name="chip"><em class="chip" data-tone={tone}>{label}|{arguments.extra}</em></macro>`,
        state: { l: 'hot' },
        default: `<div><chip label=state.l tone="warm" extra="x"/></div>`
      }).appendTo('#app')

      await settle( () => !!q('.chip') )
      expect( q('.chip')?.textContent ).toBe('hot|x')
      expect( q('.chip')?.getAttribute('data-tone') ).toBe('warm')
    })

    it('translates i18n-marked text on language change', async () => {
      lips.i18n.setDictionary('fr', { 'Count': 'Compter' })
      lips.setLanguage('en-US')

      lips.render('p-i18n', { default: `<button i18n class="b">Count</button>` }).appendTo('#app')
      await settle( () => q('.b')?.textContent === 'Count' )

      lips.setLanguage('fr-FR')
      await settle( () => q('.b')?.textContent === 'Compter' )
    })

    it('renders @format translations with params', async () => {
      lips.i18n.setDictionary('en', { greet: { type: 'text', value: 'Hi {name}!' } })
      lips.setLanguage('en-US')

      const c = lips.render('p-format', {
        state: { name: 'Ada' },
        default: `<p class="g" @format="greet, { name: state.name }"></p>`
      })
      c.appendTo('#app')

      await settle( () => q('.g')?.textContent === 'Hi Ada!' )
      c.state.name = 'Grace'
      await settle( () => q('.g')?.textContent === 'Hi Grace!' )
    })

    it('routes with params, query and not-found', async () => {
      const Home = { default: `<h1 class="home">Home</h1>` }
      const Item = { default: `<h1 class="item">{input.params.id}/{input.query.q}</h1>` }
      const missing: string[] = []

      const c = lips.render('p-router', {
        _static: { routes: [
          { path: '/', template: Home, default: true },
          { path: '/item/:id', template: Item }
        ] },
        handler: { onMissing( p: string ){ missing.push( p ) } },
        default: `<main><router routes=static.routes on-not-found( onMissing )></router></main>`
      })
      c.appendTo('#app')

      await settle( () => !!q('.home') )

      lips.getContext().navigate('/item/a%20b?q=1')
      await settle( () => !!q('.item') )
      expect( q('.item')?.textContent ).toBe('a b/1')

      lips.getContext().navigate('/nope')
      await settle( () => missing.length === 1 )
    })

    it('renders slotted component content in parent scope', async () => {
      lips.register('p-panel', { default: `<section class="panel"><{input.renderer}/></section>` })

      const c = lips.render('p-slot', {
        state: { who: 'Ada' },
        default: `<div><p-panel><b class="in">Hi {state.who}</b></p-panel></div>`
      })
      c.appendTo('#app')

      await settle( () => !!q('.panel .in') )
      expect( q('.in')?.textContent ).toBe('Hi Ada')

      c.state.who = 'Grace'
      await settle( () => q('.in')?.textContent === 'Hi Grace' )
    })

    it('delivers component events to parent handlers', async () => {
      const got: any[] = []

      lips.register('p-emitter', {
        handler: { fire( this: any ){ this.emit('done', 42 ) } },
        default: `<button class="fire" on-click( fire )>f</button>`
      })

      lips.render('p-events', {
        handler: { onDone( ...args: any[] ){ got.push( args ) } },
        default: `<div><p-emitter on-done( onDone, 'tag' )/></div>`
      }).appendTo('#app')

      await settle( () => !!q('.fire') )
      ;( q('.fire') as HTMLButtonElement ).click()

      expect( got ).toEqual([ [ 'tag', 42 ] ])
    })


    it('renders dynamic template objects', async () => {
      const A = { default: `<i class="da">A</i>` }
      const B = { default: `<i class="db">B</i>` }

      const c = lips.render('p-dyn', {
        state: { page: A },
        default: `<div><{state.page}/></div>`
      })
      c.appendTo('#app')

      await settle( () => !!q('.da') )
      c.state.page = B
      await settle( () => !!q('.db') )
      expect( q('.da') ).toBeNull()
    })

    it('destroys recursively — child onDestroy fires; destroy is idempotent', async () => {
      let leafDestroyed = false
      let branchDestroyed = false

      lips.register('p-leaf', {
        default: `<em class="leaf">leaf</em>`,
        handler: { onDestroy(){ leafDestroyed = true } }
      })
      lips.register('p-branch', {
        default: `<b class="branch"><p-leaf/></b>`,
        handler: { onDestroy(){ branchDestroyed = true } }
      })

      const c = lips.render('p-destroy', { default: `<div><p-branch/></div>` })
      c.appendTo('#app')
      await settle( () => !!q('.branch .leaf') )

      c.destroy()
      await settle( () => branchDestroyed && leafDestroyed )
      expect( q('.leaf') ).toBeNull()

      expect( () => { c.destroy(); c.destroy() } ).not.toThrow()
    })
  })
}


/**
 * Behaviors the deleted legacy engine got WRONG — kept as regression
 * specs so a future refactor cannot reintroduce them. Verified by
 * direct probe against the legacy engine before its removal:
 *
 *  - inline arrow instructions (`on-click( () => state.count++ )`) do
 *    not mutate state: the old evaluator passes `state.toJSON()`, a
 *    non-reactive copy, so the write lands on a throwaway object
 *  - spread attributes never remove keys that disappear from the
 *    object (stale attributes persist)
 *  - <async> arms do not render (loading/then never appear)
 *  - onAttach/onDetach ordering depends on a document-wide
 *    MutationObserver rather than ownership
 *  - onContext fires for ANY context write, not just the fields the
 *    component declared
 *
 */
describe('regressions fixed relative to the legacy engine', () => {
  let lips: any
  beforeEach( () => {
    document.body.innerHTML = '<div id="app"></div>'
    lips = new Lips()
  })

    it('renders <async> loading → then arms', async () => {
      let resolve!: ( v: any ) => void
      const promise = new Promise( r => resolve = r )

      lips.render('p-async', {
        state: { job: promise },
        default: `
          <div>
            <async await( state.job )>
              <loading><i class="load">…</i></loading>
              <then [user]><p class="done">{user.name}</p></then>
              <catch [e]><p class="err">{e}</p></catch>
            </async>
          </div>`
      }).appendTo('#app')

      await settle( () => !!q('.load') )

      resolve({ name: 'Ada' })
      await settle( () => q('.done')?.textContent === 'Ada' )
      expect( q('.load') ).toBeNull()
    })

    it('renders <async> catch arm on rejection', async () => {
      lips.render('p-async-err', {
        state: { job: Promise.reject('boom') },
        default: `
          <div>
            <async await( state.job )>
              <then [v]><p class="done">{v}</p></then>
              <catch [e]><p class="err">{e}</p></catch>
            </async>
          </div>`
      }).appendTo('#app')

      await settle( () => q('.err')?.textContent === 'boom' )
    })

    it('applies and diffs spread attributes', async () => {
      const c = lips.render('p-spread', {
        state: { attrs: { 'data-a': '1', 'data-b': '2' } },
        default: `<div class="sp" ...state.attrs>x</div>`
      })
      c.appendTo('#app')

      await settle( () => q('.sp')?.getAttribute('data-a') === '1' )

      c.state.attrs = { 'data-b': '3' }
      await settle( () => q('.sp')?.getAttribute('data-b') === '3' )
      expect( q('.sp')?.hasAttribute('data-a') ).toBe( false )
    })

    it('supports inline arrow event instructions', async () => {
      const c = lips.render('p-arrow', {
        state: { count: 0 },
        default: `<div><output>{state.count}</output><button on-click( () => state.count++ )>+</button></div>`
      })
      c.appendTo('#app')

      ;( q('button') as HTMLButtonElement ).click()
      ;( q('button') as HTMLButtonElement ).click()
      await settle( () => q('output')?.textContent === '2' )
    })

    it('fires the full lifecycle in order', async () => {
      const order: string[] = []

      lips.register('p-lc', {
        handler: {
          onCreate(){ order.push('create') },
          onInput(){ order.push('input') },
          onMount(){ order.push('mount') },
          onAttach(){ order.push('attach') },
          onDetach(){ order.push('detach') },
          onDestroy(){ order.push('destroy') }
        },
        default: `<i class="lc">{input.v}</i>`
      })

      const c = lips.render('p-lc-host', { default: `<div><p-lc v="1"/></div>` })
      c.appendTo('#app')
      await settle( () => order.includes('attach') )

      c.destroy()
      expect( order ).toEqual([ 'create', 'input', 'mount', 'attach', 'detach', 'destroy' ])
    })

    it('fires onContext for declared fields only', async () => {
      const hits: string[] = []
      lips.setContext({ theme: 'dark', other: 1 })

      lips.register('p-ctx', {
        context: [ 'theme' ],
        handler: { onContext( this: any ){ hits.push( this.context.theme ) } },
        default: `<i class="ctx">{context.theme}</i>`
      })

      lips.render('p-ctx-host', { default: `<div><p-ctx/></div>` }).appendTo('#app')
      await settle( () => !!q('.ctx') )

      lips.setContext('other', 2 )
      await new Promise( r => setTimeout( r, 20 ) )
      expect( hits ).toEqual( [] )

      lips.setContext('theme', 'light')
      await settle( () => hits.length === 1 )
      expect( hits ).toEqual([ 'light' ])
      await settle( () => q('.ctx')?.textContent === 'light' )
    })
})

parity( 'lips', () => new Lips() )
