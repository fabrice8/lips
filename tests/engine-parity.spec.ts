import { describe, it, expect, vi, beforeEach } from 'vitest'
import Lips from '../src/lips'

/**
 * THE PARITY GATE (RFC-001 §9)
 *
 * One shared behavior suite executed against BOTH engines through
 * the same public API — `new Lips()` vs `new Lips({ engine: 'ir' })`.
 * This file is the migration contract: the IR engine graduates by
 * passing the same specs the current engine passes.
 *
 * Known parity gaps (old-engine-only suites still cover them):
 * router, i18n, macros, component slots/events, dynamic template
 * objects — tracked in ROADMAP.
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

parity( 'current engine', () => new Lips() )
parity( 'ir engine', () => new Lips({ engine: 'ir' } as any) )
