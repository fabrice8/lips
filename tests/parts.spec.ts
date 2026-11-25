/**
 * RFC-008 — parts: popover, menu, dialog, toasts, icons and the blurred
 * backdrop, on the DOM.
 *
 * Each promise a part makes has a check here: its roles and states, its
 * keys, where focus goes and comes back, and where its panel is placed.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import Lips from '../src/lips'
import { popover, menu, dialog, toast, icons, place, move, typed, type MenuItem, type PopoverApi, type Toast } from '../src/parts'

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

// ------------------------------------------------------------------- dialog
describe('dialog', () => {
  let placed: number
  /** A dialog opened from a button, as an app writes one */
  async function rename( extra = '' ){
    lips.use( dialog )
    placed = 0
    app = lips.render( 'dialog', {
      state: { open: false },
      handler: {
        setOpen( open: boolean ){ ( this as any ).state.open = open },
        started(){ placed++ },
        save(){ ( this as any ).state.open = false }
      },
      default: `<div>
        <button class="before">before</button>
        <popover open=state.open on-change( setOpen )>
          <popover-trigger haspopup="dialog" class="open"><span>Rename</span></popover-trigger>
          <popover-dialog class="sheet" ${extra} on-placed( started )>
            <dialog-title class="title"><span>Rename the file</span></dialog-title>
            <input class="name"/>
            <button class="save" on-click( save )>Save</button>
          </popover-dialog>
        </popover>
        <button class="after">after</button>
      </div>`
    })
    app.appendTo('#app')
    await settle( () => !!q('.open') )
    return q('.open')!
  }
  const box = () => q('[role="dialog"], [role="alertdialog"]')
  const opened = async ( t: HTMLElement ) => {
    t.click()
    await settle( () => !!box() && document.activeElement === box() && placed === 1 )
  }

  it('opened: a centred modal panel, labelled by its title, controlled by its trigger, focused; it says it is placed', async () => {
    const t = await rename()
    expect( box() ).toBeNull()
    await opened( t )
    const d = box()!
    expect( d.getAttribute('aria-modal') ).toBe('true')
    expect( d.getAttribute('aria-labelledby') ).toBe( q('.title')!.id )
    expect( q('.title')!.getAttribute('role') ).toBe('heading')
    expect( t.getAttribute('aria-expanded') ).toBe('true')
    expect( t.getAttribute('aria-controls') ).toBe( d.id )
    expect( q('.lips-layer')!.getAttribute('style') ).toContain('justify-content: center')
    // Over the backdrop, which is positioned
    expect( d.getAttribute('style') ).toContain('position: relative')
  })

  it('holds the page behind it inert, the backdrop and itself aside, and gives it back when it closes', async () => {
    const t = await rename()
    await opened( t )
    expect( q('.before')!.hasAttribute('inert') ).toBe( true )
    expect( q('.after')!.hasAttribute('inert') ).toBe( true )
    expect( t.hasAttribute('inert') ).toBe( true )
    expect( q('.lips-backdrop')!.hasAttribute('inert') ).toBe( false )
    expect( box()!.closest('[inert]') ).toBeNull()
    // Only the body's content: the head and the root are left as they are
    expect( document.head.hasAttribute('inert') || document.body.hasAttribute('inert') ).toBe( false )
    key( box()!, 'Escape' )
    await settle( () => !box() )
    expect( document.querySelectorAll('[inert]').length ).toBe( 0 )
  })

  it('what was inert before it opened is left inert when it closes', async () => {
    const t = await rename()
    q('.before')!.setAttribute( 'inert', '' )
    await opened( t )
    key( box()!, 'Escape' )
    await settle( () => !box() )
    expect( q('.before')!.hasAttribute('inert') ).toBe( true )
    expect( q('.after')!.hasAttribute('inert') ).toBe( false )
  })

  it('Tab and Shift+Tab go round what can be focused in it', async () => {
    const t = await rename()
    await opened( t )
    const name = q('.name')!, save = q('.save')!
    const tab = ( el: Element, shift = false ) => el.dispatchEvent( new KeyboardEvent( 'keydown', { key: 'Tab', shiftKey: shift, bubbles: true, cancelable: true }) )
    // From the panel itself, back goes to the last
    tab( box()!, true )
    expect( document.activeElement ).toBe( save )
    tab( save )
    expect( document.activeElement ).toBe( name )
    tab( name, true )
    expect( document.activeElement ).toBe( save )
    // Between the ends, Tab is the browser's own
    name.focus()
    expect( tab( name ) ).toBe( true )
  })

  it('Escape closes it, and focus goes back to the trigger', async () => {
    const t = await rename()
    await opened( t )
    key( box()!, 'Escape' )
    await settle( () => !box() )
    expect( app.state.open ).toBe( false )
    expect( document.activeElement ).toBe( t )
  })

  it('a tap on the backdrop closes it', async () => {
    const t = await rename()
    await opened( t )
    q('.lips-backdrop')!.click()
    await settle( () => !box() )
    expect( app.state.open ).toBe( false )
  })

  it('closed by the app, from its own button: the page given back, focus on the trigger', async () => {
    const t = await rename()
    await opened( t )
    q('.save')!.click()
    await settle( () => !box() )
    expect( document.querySelectorAll('[inert]').length ).toBe( 0 )
    expect( document.activeElement ).toBe( t )
  })

  it('with a label it is named by it; its role may be the app\'s', async () => {
    const t = await rename( 'label="Rename" role="alertdialog"' )
    await opened( t )
    expect( box()!.getAttribute('role') ).toBe('alertdialog')
    expect( box()!.getAttribute('aria-label') ).toBe('Rename')
    expect( box()!.hasAttribute('aria-labelledby') ).toBe( false )
  })

  it('a blurred backdrop: backdrop-filter on the web, the radius given, its class the app\'s, a tap closes', async () => {
    const t = await rename( 'blur=8 backdrop="scrim"' )
    await opened( t )
    const b = q('.lips-backdrop')!
    expect( b.localName ).toBe('blur-view')
    expect( b.className ).toBe('lips-backdrop scrim')
    expect( b.getAttribute('blur-radius') ).toBe('8px')
    expect( b.getAttribute('style') ).toContain('backdrop-filter: blur(8px)')
    expect( b.getAttribute('style') ).toContain('position: absolute')
    b.click()
    await settle( () => !box() )
  })
})

// ------------------------------------------------------------------- toasts
describe('toasts', () => {
  let asked: string[], acted: string[]
  async function region( items: Toast[], extra = '', slot = '' ){
    lips.use( toast )
    asked = []
    acted = []
    app = lips.render( 'toasts', {
      state: { items },
      handler: {
        drop( t: Toast ){ asked.push( t.id ); ( this as any ).state.items = ( this as any ).state.items.filter( ( x: Toast ) => x.id !== t.id ) },
        undo( t: Toast ){ acted.push( t.id ) }
      },
      default: `<div><toast-region items=state.items class="toasts" item="toast" act="undo" ${extra} on-dismiss( drop ) on-act( undo )${slot ? " [item]" : ""}>${slot}</toast-region></div>`
    })
    app.appendTo('#app')
    await settle( () => !!q('.toasts') )
  }
  const wait = ( ms: number ) => new Promise( r => setTimeout( r, ms ) )
  const texts = () => [ ...document.querySelectorAll('.toast') ].map( t => t.textContent!.trim() )

  it('the region is drawn empty, a polite status, so what comes into it is announced; or an alert', async () => {
    await region( [] )
    expect( q('.toasts')!.getAttribute('role') ).toBe('status')
    expect( q('.toasts')!.children.length ).toBe( 0 )
    app.state.items = [ { id: 'a', text: 'Saved', duration: 10000 } ]
    await settle( () => texts()[ 0 ] === 'Saved' )
    document.body.innerHTML = '<div id="app"></div>'
    lips = new Lips()
    await region( [], 'role="alert"' )
    expect( q('.toasts')!.getAttribute('role') ).toBe('alert')
  })

  it('a toast asks to go after its duration, and the app takes it out', async () => {
    await region( [ { id: 'a', text: 'Saved', duration: 30 }, { id: 'b', text: 'Later', duration: 10000 } ] )
    expect( texts() ).toEqual([ 'Saved', 'Later' ])
    await settle( () => texts().length === 1 )
    expect( asked ).toEqual([ 'a' ])
    expect( texts() ).toEqual([ 'Later' ])
  })

  it('the region\'s duration stands for a toast that gives none', async () => {
    await region( [ { id: 'a', text: 'Saved' } ], 'duration=30' )
    await settle( () => asked.length === 1 )
  })

  it('held while the pointer is on it, it goes on from where it was when it leaves', async () => {
    await region( [ { id: 'a', text: 'Saved', duration: 60 } ] )
    const t = q('.toast')!
    t.dispatchEvent( new MouseEvent( 'mouseenter' ) )
    await wait( 120 )
    expect( asked ).toEqual( [] )
    t.dispatchEvent( new MouseEvent( 'mouseleave' ) )
    await settle( () => asked.length === 1 )
  })

  it('held while the focus is in it', async () => {
    await region( [ { id: 'a', text: 'Saved', duration: 60 } ] )
    const t = q('.toast')!
    t.dispatchEvent( new FocusEvent( 'focusin', { bubbles: true } ) )
    await wait( 120 )
    expect( asked ).toEqual( [] )
    t.dispatchEvent( new FocusEvent( 'focusout', { bubbles: true } ) )
    await settle( () => asked.length === 1 )
  })

  it('held, it goes on from the time it had left, and asks once, even of an app that keeps it', async () => {
    vi.useFakeTimers()
    try {
      lips.use( toast )
      asked = []
      app = lips.render( 'timed', {
        state: { items: [ { id: 'a', text: 'Saved', duration: 100 } ] },
        handler: { note( t: Toast ){ asked.push( t.id ) } },
        default: `<div><toast-region items=state.items item="toast" on-dismiss( note )/></div>`
      })
      app.appendTo('#app')
      await vi.advanceTimersByTimeAsync( 0 )
      const t = q('.toast')!
      await vi.advanceTimersByTimeAsync( 60 )
      t.dispatchEvent( new MouseEvent( 'mouseenter' ) )
      await vi.advanceTimersByTimeAsync( 500 )
      expect( asked ).toEqual( [] )
      t.dispatchEvent( new MouseEvent( 'mouseleave' ) )
      // 40 ms were left
      await vi.advanceTimersByTimeAsync( 39 )
      expect( asked ).toEqual( [] )
      await vi.advanceTimersByTimeAsync( 2 )
      expect( asked ).toEqual([ 'a' ])
      // Kept by the app: it does not ask again
      t.dispatchEvent( new MouseEvent( 'mouseenter' ) )
      t.dispatchEvent( new MouseEvent( 'mouseleave' ) )
      await vi.advanceTimersByTimeAsync( 1000 )
      expect( asked ).toEqual([ 'a' ])
    }
    finally { vi.useRealTimers() }
  })

  it('one the app takes out before its time never asks', async () => {
    vi.useFakeTimers()
    try {
      lips.use( toast )
      asked = []
      app = lips.render( 'gone', {
        state: { items: [ { id: 'a', text: 'Saved', duration: 100 } ] },
        handler: { note( t: Toast ){ asked.push( t.id ) } },
        default: `<div><toast-region items=state.items item="toast" on-dismiss( note )/></div>`
      })
      app.appendTo('#app')
      await vi.advanceTimersByTimeAsync( 0 )
      expect( q('.toast') ).not.toBeNull()
      app.state.items = []
      await vi.advanceTimersByTimeAsync( 0 )
      expect( q('.toast') ).toBeNull()
      await vi.advanceTimersByTimeAsync( 500 )
      expect( asked ).toEqual( [] )
    }
    finally { vi.useRealTimers() }
  })

  it('one that offers an action never leaves by itself; its button says act', async () => {
    await region( [ { id: 'a', text: 'Deleted', action: 'Undo', duration: 20 } ] )
    await wait( 80 )
    expect( asked ).toEqual( [] )
    const b = q('.undo')!
    expect( b.textContent ).toBe('Undo')
    b.click()
    await settle( () => acted.length === 1 )
    expect( acted ).toEqual([ 'a' ])
  })

  it('is drawn by the slot when given one, with its item', async () => {
    await region( [ { id: 'a', text: 'Saved', duration: 10000 } ], '', '<b class="own">{item.text}!</b>' )
    await settle( () => q('.own')?.textContent === 'Saved!' )
  })
})

// ------------------------------------------------------------------- icons
describe('icons', () => {
  const SET = {
    check: { paths: [ 'M5 12l5 5L20 7' ], stroke: 2 },
    dot: { paths: [ 'M0 0h8v8H0z', 'M2 2h4v4H2z' ], box: '0 0 8 8' }
  }
  async function draw( markup: string ){
    lips.use( icons( SET ) )
    app = lips.render( 'icons', { default: `<div class="host">${markup}</div>` })
    app.appendTo('#app')
    await settle( () => !!q('.host') )
  }

  it('a line icon: its paths, no fill, stroked in the colour given, round, sized', async () => {
    await draw( '<icon name="check" size=16 color="red" class="i"/>' )
    const svg = q('svg.i')!
    expect( svg.getAttribute('viewBox') ).toBe('0 0 24 24')
    expect( svg.getAttribute('width') ).toBe('16')
    expect( svg.getAttribute('height') ).toBe('16')
    expect( svg.getAttribute('fill') ).toBe('none')
    expect( svg.getAttribute('stroke') ).toBe('red')
    expect( svg.getAttribute('stroke-width') ).toBe('2')
    expect( svg.getAttribute('stroke-linecap') ).toBe('round')
    expect( svg.getAttribute('stroke-linejoin') ).toBe('round')
    expect( [ ...svg.querySelectorAll('path') ].map( p => p.getAttribute('d') ) ).toEqual( SET.check.paths )
  })

  it('a filled icon: filled in the text\'s colour on the web by default, its own box, every path', async () => {
    await draw( '<icon name="dot"/>' )
    const svg = q('svg')!
    expect( svg.getAttribute('fill') ).toBe('currentColor')
    expect( svg.hasAttribute('stroke') ).toBe( false )
    expect( svg.getAttribute('viewBox') ).toBe('0 0 8 8')
    expect( svg.getAttribute('width') ).toBe('24')
    expect( svg.querySelectorAll('path').length ).toBe( 2 )
  })

  it('with no label it is hidden from a screen reader; with one, an image by that name', async () => {
    await draw( '<icon name="dot" class="a"/><button class="b"><icon name="check" label="Done"/></button>' )
    expect( q('svg.a')!.getAttribute('aria-hidden') ).toBe('true')
    expect( q('svg.a')!.hasAttribute('role') ).toBe( false )
    const named = q('.b svg')!
    expect( named.getAttribute('role') ).toBe('img')
    expect( named.getAttribute('aria-label') ).toBe('Done')
    expect( named.hasAttribute('aria-hidden') ).toBe( false )
  })

  it('a name the set does not hold draws nothing', async () => {
    await draw( '<icon name="nope"/>' )
    expect( q('svg') ).toBeNull()
  })

  it('one set per Lips: a second is refused', () => {
    lips.use( icons( SET ) )
    expect( () => lips.use( icons({}) ) ).toThrow( /two plugins named <icons>/ )
  })
})
