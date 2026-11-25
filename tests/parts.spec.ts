/**
 * RFC-008 — parts: popover and menu, on the DOM.
 *
 * Each promise a part makes has a check here: its roles and states, its
 * keys, where focus goes and comes back, and where its panel is placed.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import Lips from '../src/lips'
import { popover, menu, place, move, typed, type MenuItem, type PopoverApi } from '../src/parts'

const settle = ( check: () => boolean, timeout = 2000 ) => new Promise<void>( ( res, rej ) => {
  const t0 = Date.now()
  ;( function tick(){
    let ok = false
    try { ok = check() } catch {}
    if( ok ) return res()
    if( Date.now() - t0 > timeout ) return rej( new Error('settle timeout') )
    setTimeout( tick, 4 )
  })()
})
const q = ( s: string ) => document.querySelector( s ) as HTMLElement | null
const key = ( el: Element, k: string ) => el.dispatchEvent( new KeyboardEvent( 'keydown', { key: k, bubbles: true, cancelable: true }) )

const ITEMS: MenuItem[] = [
  { id: 'edit', label: 'Edit' },
  { id: 'copy', label: 'Copy', disabled: true },
  { id: 'cut', label: 'Cut' },
  { id: 'delete', label: 'Delete' }
]

let lips: any, app: any, picked: string[]
beforeEach( () => {
  document.body.innerHTML = '<div id="app"></div>'
  lips = new Lips()
  lips.use( menu )
  picked = []
})

/** A menu button, as an app writes one */
async function menuButton( items = ITEMS ){
  app = lips.render( 'app', {
    state: { open: false, items },
    handler: {
      setOpen( open: boolean ){ ( this as any ).state.open = open },
      run( item: MenuItem ){ picked.push( item.id ) }
    },
    default: `<div>
      <popover open=state.open on-change( setOpen )>
        <popover-trigger haspopup="menu" class="btn"><span>Actions</span></popover-trigger>
        <popover-menu items=state.items class="menu" item="row" on-select( run )/>
      </popover>
      <button class="after">after</button>
    </div>`
  })
  app.appendTo('#app')
  await settle( () => !!q('.btn') )
  return q('.btn')!
}
/** The popup a screen reader is told of: the menu's list */
const panel = () => q('[role="menu"]')
/** The box placed in the layer, around it */
const placed = () => panel()?.parentElement?.getAttribute('style') || ''
const active = () => panel()?.getAttribute('aria-activedescendant')?.replace( /^lips-popover-\d+-/, '' )

describe('popover', () => {
  it('a closed trigger says so and controls nothing; nothing is rendered', async () => {
    const t = await menuButton()
    expect( t.getAttribute('aria-expanded') ).toBe('false')
    expect( t.getAttribute('aria-haspopup') ).toBe('menu')
    expect( t.hasAttribute('aria-controls') ).toBe( false )
    expect( panel() ).toBeNull()
  })

  it('a tap opens it: expanded, controlling the panel, labelled by the trigger, focused, placed', async () => {
    const t = await menuButton()
    t.click()
    // Drawn before it is measured, and invisible until it is placed
    expect( placed() ).toContain('opacity: 0')
    await settle( () => placed().includes('top: 0px') && !placed().includes('opacity') && document.activeElement === panel() )
    expect( app.state.open ).toBe( true )
    expect( t.getAttribute('aria-expanded') ).toBe('true')
    expect( t.getAttribute('aria-controls') ).toBe( panel()!.id )
    expect( panel()!.getAttribute('aria-labelledby') ).toBe( t.id )
    expect( document.activeElement ).toBe( panel() )
  })

  it('the layer covers the page on the DOM, and a tap on its backdrop closes it, focus back on the trigger', async () => {
    const t = await menuButton()
    t.click()
    await settle( () => document.activeElement === panel() )
    expect( q('.lips-layer')!.getAttribute('style') ).toContain('position: fixed')
    q('.lips-backdrop')!.click()
    await settle( () => !panel() )
    expect( app.state.open ).toBe( false )
    expect( document.activeElement ).toBe( t )
  })

  it('Escape closes it and gives focus back to the trigger', async () => {
    const t = await menuButton()
    t.click()
    await settle( () => document.activeElement === panel() )
    key( panel()!, 'Escape' )
    await settle( () => !panel() )
    expect( document.activeElement ).toBe( t )
  })

  it('a second tap on the trigger closes it', async () => {
    const t = await menuButton()
    t.click()
    await settle( () => !!panel() )
    t.click()
    await settle( () => !panel() )
    expect( app.state.open ).toBe( false )
  })

  it('two popovers on a page are each their own, even for a piece drawn after both', async () => {
    app = lips.render( 'two', {
      state: { a: false, b: false, late: false },
      handler: { setA( o: boolean ){ ( this as any ).state.a = o }, setB( o: boolean ){ ( this as any ).state.b = o } },
      default: `<div>
        <popover open=state.a on-change( setA )><if( state.late )><popover-trigger class="ta"><span>A</span></popover-trigger></if><popover-content class="pa"><i>a</i></popover-content></popover>
        <popover open=state.b on-change( setB )><popover-trigger class="tb"><span>B</span></popover-trigger><popover-content class="pb"><i>b</i></popover-content></popover>
      </div>`
    })
    app.appendTo('#app')
    await settle( () => !!q('.tb') )
    app.state.late = true
    await settle( () => !!q('.ta') )
    expect( q('.ta')!.id ).not.toBe( q('.tb')!.id )
    q('.ta')!.click()
    await settle( () => !!q('.pa') )
    expect( app.state ).toMatchObject({ a: true, b: false })
    expect( q('.pb') ).toBeNull()
    expect( q('.ta')!.getAttribute('aria-controls') ).toBe( q('.pa')!.id )
  })

  it('a piece given `of` follows that controller, not the popover it sits in', async () => {
    let open = false
    const mine: PopoverApi = {
      id: 'mine', get open(){ return open }, get controls(){ return open ? 'mine' : null }, start: 'first',
      set( o ){ open = o; app.state.tick++ }, toggle(){ mine.set( !open ) }
    }
    app = lips.render( 'own', {
      state: { tick: 0 },
      static: { mine },
      default: `<div><b class="t">{state.tick}</b><popover open=false><popover-trigger of=static.mine class="own"><span>Mine</span></popover-trigger></popover></div>`
    })
    app.appendTo('#app')
    await settle( () => !!q('.own') )
    expect( q('.own')!.id ).toBe('mine-trigger')
    q('.own')!.click()
    await settle( () => q('.t')!.textContent === '1' )
    expect( open ).toBe( true )
  })

  it('is placed by the app\'s own placement when given one, told the direction', async () => {
    const asked: boolean[] = []
    app = lips.render( 'placed', {
      state: { open: false },
      static: { at: ( _t: any, _l: any, _p: any, rtl: boolean ) => ( asked.push( rtl ), { top: 7, left: 9 } ) },
      handler: { setOpen( o: boolean ){ ( this as any ).state.open = o } },
      default: `<popover open=state.open on-change( setOpen )>
        <popover-trigger class="pt"><span>P</span></popover-trigger>
        <popover-content class="pc" role="dialog" place=static.at dir="rtl"><i>in</i></popover-content>
      </popover>`
    })
    app.appendTo('#app')
    await settle( () => !!q('.pt') )
    q('.pt')!.click()
    await settle( () => ( q('.pc')?.getAttribute('style') || '' ).includes('top: 7px; left: 9px') )
    expect( asked ).toEqual([ true ])
    // The panel is the popup here: its role, its id, labelled by the trigger, focused
    expect( q('.pc')!.getAttribute('role') ).toBe('dialog')
    expect( q('.pt')!.getAttribute('aria-controls') ).toBe( q('.pc')!.id )
    expect( q('.pc')!.getAttribute('aria-labelledby') ).toBe( q('.pt')!.id )
    await settle( () => document.activeElement === q('.pc') )
  })

  it('content that is the popup itself gets the panel\'s role, id, label and focus; the panel keeps none', async () => {
    app = lips.render( 'own-popup', {
      state: { open: true },
      default: `<popover open=state.open>
        <popover-trigger class="pt"><span>P</span></popover-trigger>
        <popover-content class="pc" role="dialog" popup="content"><i class="inner">in</i></popover-content>
      </popover>`
    })
    app.appendTo('#app')
    await settle( () => ( q('.pc')?.getAttribute('style') || '' ).includes('top:') && !( q('.pc')!.getAttribute('style') || '' ).includes('opacity') )
    expect( [ 'role', 'id', 'aria-labelledby', 'tabindex' ].filter( n => q('.pc')!.hasAttribute( n ) ) ).toEqual( [] )
    expect( document.activeElement ).not.toBe( q('.pc') )
  })

  it('is placed below its trigger, above where only that fits, at its end in right-to-left, kept inside the layer', () => {
    const box = ( top: number, left: number, width: number, height: number ) => ({ top, left, width, height, right: left + width, bottom: top + height })
    const layer = box( 0, 0, 400, 800 )
    expect( place( box( 100, 20, 80, 30 ), layer, box( 0, 0, 200, 300 ) ) ).toEqual({ top: 130, left: 20 })
    expect( place( box( 700, 20, 80, 30 ), layer, box( 0, 0, 200, 300 ) ) ).toEqual({ top: 400, left: 20 })
    // No room either way: below, as given
    expect( place( box( 200, 20, 80, 30 ), layer, box( 0, 0, 200, 700 ) ) ).toEqual({ top: 230, left: 20 })
    expect( place( box( 100, 300, 80, 30 ), layer, box( 0, 0, 200, 300 ), true ) ).toEqual({ top: 130, left: 180 })
    expect( place( box( 100, 300, 80, 30 ), layer, box( 0, 0, 200, 300 ) ) ).toEqual({ top: 130, left: 200 })
    expect( place( box( 100, 10, 80, 30 ), layer, box( 0, 0, 200, 300 ), true ) ).toEqual({ top: 130, left: 0 })
  })
})

describe('menu', () => {
  it('its items are menu items, the disabled one marked', async () => {
    const t = await menuButton()
    t.click()
    await settle( () => !!panel() )
    const box = panel()!.parentElement!
    expect( [ 'role', 'id', 'aria-labelledby', 'tabindex' ].filter( n => box.hasAttribute( n ) ) ).toEqual( [] )
    const rows = [ ...document.querySelectorAll('[role="menuitem"]') ]
    expect( rows.map( r => r.textContent!.trim() ) ).toEqual([ 'Edit', 'Copy', 'Cut', 'Delete' ])
    expect( rows[ 1 ].getAttribute('aria-disabled') ).toBe('true')
    expect( rows[ 1 ].className ).toContain('is-disabled')
    expect( rows[ 0 ].hasAttribute('aria-disabled') ).toBe( false )
  })

  it('opened by a tap, it starts on the first item, marked active', async () => {
    ;( await menuButton() ).click()
    await settle( () => active() === 'edit' )
    expect( q('.row.is-active')!.textContent!.trim() ).toBe('Edit')
  })

  it('ArrowDown on the trigger opens it on the first item, ArrowUp on the last', async () => {
    const t = await menuButton()
    key( t, 'ArrowDown' )
    await settle( () => active() === 'edit' )
    key( panel()!, 'Escape' )
    await settle( () => !panel() )
    key( t, 'ArrowUp' )
    await settle( () => active() === 'delete' )
    // A tap after the keys opens it on its first item again
    key( panel()!, 'Escape' )
    await settle( () => !panel() )
    t.click()
    await settle( () => active() === 'edit' )
  })

  it('arrows open only the trigger of a menu or a listbox', async () => {
    app = lips.render( 'plain', {
      state: { open: false },
      handler: { setOpen( o: boolean ){ ( this as any ).state.open = o } },
      default: `<popover open=state.open on-change( setOpen )><popover-trigger class="pt"><span>P</span></popover-trigger><popover-content class="pc"><i>in</i></popover-content></popover>`
    })
    app.appendTo('#app')
    await settle( () => !!q('.pt') )
    key( q('.pt')!, 'ArrowDown' )
    await new Promise( r => setTimeout( r, 20 ) )
    expect( app.state.open ).toBe( false )
  })

  it('arrows move past a disabled item and wrap; Home and End go to the ends', async () => {
    ;( await menuButton() ).click()
    await settle( () => active() === 'edit' )
    const at = async ( k: string, id: string ) => { key( panel()!, k ); await settle( () => active() === id ) }
    await at( 'ArrowDown', 'cut' )
    await at( 'ArrowDown', 'delete' )
    await at( 'ArrowDown', 'edit' )
    await at( 'ArrowUp', 'delete' )
    await at( 'Home', 'edit' )
    await at( 'End', 'delete' )
  })

  it('a letter goes to the next item it starts', async () => {
    ;( await menuButton() ).click()
    await settle( () => active() === 'edit' )
    key( panel()!, 'd' )
    await settle( () => active() === 'delete' )
    key( panel()!, 'c' )
    await settle( () => active() === 'cut' )
  })

  it('Enter selects the active item, closes, and gives focus back', async () => {
    const t = await menuButton()
    t.click()
    await settle( () => active() === 'edit' )
    key( panel()!, 'ArrowDown' )
    await settle( () => active() === 'cut' )
    key( panel()!, 'Enter' )
    await settle( () => !panel() )
    expect( picked ).toEqual([ 'cut' ])
    expect( document.activeElement ).toBe( t )
  })

  it('Space selects too', async () => {
    ;( await menuButton() ).click()
    await settle( () => active() === 'edit' )
    key( panel()!, ' ' )
    await settle( () => !panel() )
    expect( picked ).toEqual([ 'edit' ])
  })

  it('a tap selects the item tapped; a disabled one does nothing', async () => {
    ;( await menuButton() ).click()
    await settle( () => !!panel() )
    ;( document.querySelectorAll('[role="menuitem"]')[ 1 ] as HTMLElement ).click()
    await new Promise( r => setTimeout( r, 20 ) )
    expect( picked ).toEqual([])
    expect( panel() ).not.toBeNull()
    ;( document.querySelectorAll('[role="menuitem"]')[ 3 ] as HTMLElement ).click()
    await settle( () => !panel() )
    expect( picked ).toEqual([ 'delete' ])
  })

  it('Tab closes it without taking focus back', async () => {
    const t = await menuButton()
    t.click()
    await settle( () => document.activeElement === panel() )
    key( panel()!, 'Tab' )
    await settle( () => !panel() )
    expect( document.activeElement ).not.toBe( t )
  })

  it('draws each item by the slot when given one, with whether it is active', async () => {
    app = lips.render( 'slotted', {
      state: { open: true, items: ITEMS },
      handler: { setOpen( o: boolean ){ ( this as any ).state.open = o } },
      default: `<popover open=state.open on-change( setOpen )>
        <popover-trigger haspopup="menu"><span>Actions</span></popover-trigger>
        <popover-menu items=state.items [item, active]><b class="cell">{item.label}{active ? '*' : ''}</b></popover-menu>
      </popover>`
    })
    app.appendTo('#app')
    await settle( () => q('.cell')?.textContent === 'Edit*' )
    expect( [ ...document.querySelectorAll('.cell') ].map( c => c.textContent ) ).toEqual([ 'Edit*', 'Copy', 'Cut', 'Delete' ])
  })

  it('moves and types past disabled items, and says when nothing can be reached', () => {
    const none: MenuItem[] = [ { id: 'a', label: 'A', disabled: true } ]
    expect( move( ITEMS, 0, 1 ) ).toBe( 2 )
    expect( move( ITEMS, 2, -1 ) ).toBe( 0 )
    expect( move( none, -1, 1 ) ).toBe( -1 )
    expect( typed( ITEMS, 0, 'C' ) ).toBe( 2 )
    expect( typed( ITEMS, 0, 'x' ) ).toBe( -1 )
  })
})
