/**
 * RFC-008 — parts: popover, menu, dialog, toasts, icons, the blurred
 * backdrop, combobox, a region that folds, the virtual list and the date
 * picker, on the DOM.
 *
 * Each promise a part makes has a check here: its roles and states, its
 * keys, where focus goes and comes back, and where its panel is placed.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import Lips from '../src/lips'
import { popover, menu, dialog, toast, icons, combobox, reveal, virtualList, frame, datePicker, isoOf, addDays, addMonths, weeksOf, calendarWords, firstDay, ENGLISH, contains, place, move, typed, type MenuItem, type PopoverApi, type Toast, type Option } from '../src/parts'

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

// ------------------------------------------------------------------- combobox
describe('combobox', () => {
  const PEOPLE: Option[] = [
    { id: 'ada', label: 'Ada Lovelace' },
    { id: 'alan', label: 'Alan Turing', disabled: true },
    { id: 'grace', label: 'Grace Hopper' },
    { id: 'edsger', label: 'Edsger Dijkstra' }
  ]
  let chosen: string[], queries: string[]
  async function field( extra = '', slot = '', value: string | null = null ){
    lips.use( combobox )
    chosen = []
    queries = []
    app = lips.render( 'combo', {
      state: { open: false, people: PEOPLE, owner: value },
      static: { starts: ( o: Option, t: string ) => o.label.startsWith( t ) },
      handler: {
        setOpen( o: boolean ){ ( this as any ).state.open = o },
        setOwner( o: Option ){ chosen.push( o.id ); ( this as any ).state.owner = o.id },
        asked( q: string ){ queries.push( q ) }
      },
      default: `<div>
        <popover open=state.open on-change( setOpen )>
          <popover-combobox options=state.people value=state.owner class="field" list="options" option="option" label="Owner" ${extra} on-change( setOwner ) on-query( asked )${slot ? ' [option, active, selected]' : ''}>${slot}</popover-combobox>
        </popover>
      </div>`
    })
    app.appendTo('#app')
    await settle( () => !!q('.field') )
    return q('.field') as HTMLInputElement
  }
  const list = () => q('[role="listbox"]')
  const options = () => [ ...document.querySelectorAll('[role="option"]') ] as HTMLElement[]
  const labels = () => options().map( o => o.textContent!.trim() )
  const activeId = ( f: HTMLElement ) => f.getAttribute('aria-activedescendant')?.replace( /^lips-popover-\d+-/, '' )
  const type = async ( f: HTMLInputElement, text: string ) => {
    f.value = text
    f.dispatchEvent( new Event( 'input', { bubbles: true } ) )
  }

  it('closed, the field is a combobox that says so, with a list autocomplete, controlling nothing', async () => {
    const f = await field()
    expect( f.getAttribute('role') ).toBe('combobox')
    expect( f.getAttribute('aria-expanded') ).toBe('false')
    expect( f.getAttribute('aria-autocomplete') ).toBe('list')
    expect( f.getAttribute('aria-label') ).toBe('Owner')
    expect( f.hasAttribute('aria-controls') ).toBe( false )
    expect( list() ).toBeNull()
  })

  it('typing opens the list on what matches, the first active; focus stays in the field; it says the query', async () => {
    const f = await field()
    f.focus()
    await type( f, 'gr' )
    await settle( () => !!list() && labels().length === 1 )
    expect( labels() ).toEqual([ 'Grace Hopper' ])
    expect( f.getAttribute('aria-expanded') ).toBe('true')
    expect( f.getAttribute('aria-controls') ).toBe( list()!.id )
    expect( activeId( f ) ).toBe('grace')
    expect( options()[ 0 ].className ).toContain('is-active')
    expect( document.activeElement ).toBe( f )
    expect( queries ).toEqual([ 'gr' ])
  })

  it('matches in any case, anywhere in the label', async () => {
    const f = await field()
    await type( f, 'A' )
    await settle( () => labels().length === 4 )
    await type( f, 'hop' )
    await settle( () => labels().length === 1 )
    expect( labels() ).toEqual([ 'Grace Hopper' ])
  })

  it('arrows open it and move past disabled options, wrapping; Enter chooses, closes, and shows the label', async () => {
    const f = await field()
    f.focus()
    key( f, 'ArrowDown' )
    await settle( () => !!list() && activeId( f ) === 'ada' )
    key( f, 'ArrowDown' )
    await settle( () => activeId( f ) === 'grace' )
    key( f, 'ArrowUp' )
    await settle( () => activeId( f ) === 'ada' )
    key( f, 'ArrowUp' )
    await settle( () => activeId( f ) === 'edsger' )
    key( f, 'Enter' )
    await settle( () => !list() )
    expect( chosen ).toEqual([ 'edsger' ])
    expect( app.state.owner ).toBe('edsger')
    expect( f.value ).toBe('Edsger Dijkstra')
    expect( document.activeElement ).toBe( f )
  })

  it('ArrowUp on a closed field opens it on the last option', async () => {
    const f = await field()
    key( f, 'ArrowUp' )
    await settle( () => !!list() && activeId( f ) === 'edsger' )
  })

  it('Escape closes it, focus staying in the field; Tab closes it', async () => {
    const f = await field()
    f.focus()
    key( f, 'ArrowDown' )
    await settle( () => !!list() )
    key( f, 'Escape' )
    await settle( () => !list() )
    expect( document.activeElement ).toBe( f )
    key( f, 'ArrowDown' )
    await settle( () => !!list() )
    key( f, 'Tab' )
    await settle( () => !list() )
    expect( chosen ).toEqual( [] )
  })

  it('Enter with nothing active, or closed, chooses nothing', async () => {
    const f = await field()
    key( f, 'Enter' )
    // Closed with an option still active
    key( f, 'ArrowDown' )
    await settle( () => activeId( f ) === 'ada' )
    key( f, 'Escape' )
    await settle( () => !list() )
    key( f, 'Enter' )
    expect( chosen ).toEqual( [] )
    await type( f, 'zz' )
    await settle( () => !!list() )
    expect( labels() ).toEqual( [] )
    key( f, 'Enter' )
    expect( chosen ).toEqual( [] )
  })

  it('a tap chooses the option tapped; a disabled one does nothing', async () => {
    const f = await field()
    key( f, 'ArrowDown' )
    await settle( () => options().length === 4 )
    expect( options()[ 1 ].getAttribute('aria-disabled') ).toBe('true')
    expect( options()[ 1 ].className ).toContain('is-disabled')
    options()[ 1 ].click()
    expect( chosen ).toEqual( [] )
    options()[ 2 ].click()
    await settle( () => !list() )
    expect( chosen ).toEqual([ 'grace' ])
    expect( f.value ).toBe('Grace Hopper')
  })

  it('the chosen option is selected, and the field shows the label of the app\'s value', async () => {
    const f = await field( '', '', 'grace' )
    expect( f.value ).toBe('Grace Hopper')
    key( f, 'ArrowDown' )
    await settle( () => options().length === 4 )
    expect( options().map( o => o.getAttribute('aria-selected') ) ).toEqual([ 'false', 'false', 'true', 'false' ])
    expect( options()[ 2 ].className ).toContain('is-selected')
    // Typed over, then the same option chosen again: the app's value does not change, the field shows its label
    await type( f, 'Gr' )
    await settle( () => labels().length === 1 )
    key( f, 'Enter' )
    await settle( () => !list() )
    expect( chosen ).toEqual([ 'grace' ])
    expect( f.value ).toBe('Grace Hopper')
    // The app changes it: the field follows
    key( f, 'Escape' )
    app.state.owner = 'ada'
    await settle( () => f.value === 'Ada Lovelace' )
  })

  it('fewer options from the app, past the active one: nothing is active', async () => {
    const f = await field()
    key( f, 'ArrowUp' )
    await settle( () => activeId( f ) === 'edsger' )
    app.state.people = PEOPLE.slice( 0, 2 )
    await settle( () => options().length === 2 )
    expect( f.hasAttribute('aria-activedescendant') ).toBe( false )
    expect( options().some( o => o.className.includes('is-active') ) ).toBe( false )
  })

  it('finds by the app\'s own match', async () => {
    const f = await field( 'match=static.starts' )
    await type( f, 'Gr' )
    await settle( () => labels().length === 1 )
    expect( labels() ).toEqual([ 'Grace Hopper' ])
    // `contains` would find Grace by "race"; starting with it, nothing does
    await type( f, 'race' )
    await settle( () => labels().length === 0 )
  })

  it('draws each option by the slot when given one, with whether it is active and selected', async () => {
    const f = await field( '', '<b class="own">{option.label}{active ? \'*\' : \'\'}{selected ? \'!\' : \'\'}</b>', 'ada' )
    key( f, 'ArrowDown' )
    await settle( () => q('.own')?.textContent === 'Ada Lovelace*!' )
    expect( [ ...document.querySelectorAll('.own') ].map( c => c.textContent ) ).toEqual([ 'Ada Lovelace*!', 'Alan Turing', 'Grace Hopper', 'Edsger Dijkstra' ])
  })

  it('contains: the label holds the text, in any case', () => {
    expect( contains( PEOPLE[ 0 ], 'LOVE' ) ).toBe( true )
    expect( contains( PEOPLE[ 0 ], 'x' ) ).toBe( false )
  })
})

// ------------------------------------------------------------------- reveal
describe('a region that reveals and folds', () => {
  async function details( extra = '' ){
    lips.use( reveal )
    app = lips.render( 'reveal', {
      state: { open: false },
      handler: { setOpen( o: boolean ){ ( this as any ).state.open = o } },
      default: `<div>
        <popover open=state.open on-change( setOpen )>
          <popover-trigger class="more"><span>Details</span></popover-trigger>
          <reveal-region class="details" ${extra}><input class="note"/></reveal-region>
        </popover>
      </div>`
    })
    app.appendTo('#app')
    await settle( () => !!q('.more') )
    return q('.more')!
  }

  it('folded, it is not rendered; a tap reveals it in place, controlled by the button, focus left on it', async () => {
    const b = await details()
    expect( q('.details') ).toBeNull()
    expect( b.getAttribute('aria-expanded') ).toBe('false')
    b.focus()
    b.click()
    await settle( () => !!q('.details') )
    expect( b.getAttribute('aria-expanded') ).toBe('true')
    expect( b.getAttribute('aria-controls') ).toBe( q('.details')!.id )
    expect( q('.details')!.closest('.lips-layer') ).toBeNull()
    expect( q('.details')!.hasAttribute('style') ).toBe( false )
    expect( document.activeElement ).toBe( b )
    b.click()
    await settle( () => !q('.details') )
  })

  it('kept, it stays rendered and hidden while folded, and what was typed stays', async () => {
    const b = await details( 'keep=true' )
    expect( q('.details')!.getAttribute('style') ).toContain('display: none')
    b.click()
    await settle( () => !q('.details')!.hasAttribute('style') )
    ;( q('.note') as HTMLInputElement ).value = 'kept'
    b.click()
    await settle( () => !!q('.details')!.getAttribute('style') )
    expect( ( q('.note') as HTMLInputElement ).value ).toBe('kept')
  })

  it('with a role, it is a region named by its button', async () => {
    const b = await details( 'role="region"' )
    b.click()
    await settle( () => !!q('.details') )
    expect( q('.details')!.getAttribute('role') ).toBe('region')
    expect( q('.details')!.getAttribute('aria-labelledby') ).toBe( b.id )
  })
})

// ------------------------------------------------------------------- virtual list
describe('virtual list and grid', () => {
  const ROWS = Array.from( { length: 1000 }, ( _, i ) => ({ id: `r${i}`, name: `Row ${i}` }) )
  /** jsdom lays nothing out: the box is given its height */
  async function rows( extra = '', items = ROWS ){
    lips.use( virtualList )
    const real = HTMLElement.prototype.getBoundingClientRect
    HTMLElement.prototype.getBoundingClientRect = function(){
      return this.classList.contains('rows') ? { top: 0, left: 0, right: 300, bottom: 200, width: 300, height: 200, x: 0, y: 0 } as DOMRect : real.call( this )
    }
    try {
      app = lips.render( 'vl', {
        state: { items },
        default: `<div><virtual-list items=state.items size=40 class="rows" row="row" ${extra} [item, index]><span>{item.name}:{index}</span></virtual-list></div>`
      })
      app.appendTo('#app')
      await settle( () => drawn().length > 3 )
    }
    finally { HTMLElement.prototype.getBoundingClientRect = real }
  }
  const drawn = () => [ ...document.querySelectorAll('.row') ] as HTMLElement[]
  const texts = () => drawn().map( r => r.textContent )
  const scroll = ( top: number, height = 200 ) => {
    const box = q('.rows')!
    Object.defineProperty( box, 'scrollTop', { value: top, configurable: true })
    Object.defineProperty( box, 'clientHeight', { value: height, configurable: true })
    box.dispatchEvent( new Event('scroll') )
  }

  it('draws only what is in view and the overscan, each row where it falls, in a box as tall as all of them', async () => {
    await rows()
    // 200 px of 40 px rows: 5 in view, and 3 past them
    expect( texts() ).toEqual( Array.from( { length: 8 }, ( _, i ) => `Row ${i}:${i}` ) )
    expect( drawn()[ 2 ].getAttribute('style') ).toContain('top: 80px')
    expect( drawn()[ 2 ].getAttribute('style') ).toContain('height: 40px')
    expect( q('.rows')!.firstElementChild!.getAttribute('style') ).toContain('height: 40000px')
    expect( q('.rows')!.getAttribute('style') ).toContain('overflow-y: auto')
  })

  it('scrolled, it draws what is in view there', async () => {
    await rows()
    scroll( 4000 )
    // Rows 100 to 104 in view, 97 to 107 drawn
    await settle( () => texts()[ 0 ] === 'Row 97:97' )
    expect( texts().length ).toBe( 11 )
    expect( drawn()[ 0 ].getAttribute('style') ).toContain('top: 3880px')
    expect( texts()[ texts().length - 1 ] ).toBe('Row 107:107')
  })

  it('a box grown taller draws what now fits, read as it scrolls', async () => {
    await rows()
    scroll( 0, 400 )
    // 10 in view, and 3 past them
    await settle( () => drawn().length === 13 )
  })

  it('a row kept in view is the same element as it scrolls', async () => {
    await rows()
    const fourth = drawn()[ 4 ]
    scroll( 40 )
    await settle( () => texts()[ 0 ] === 'Row 0:0' && texts().length === 9 )
    expect( drawn()[ 4 ] ).toBe( fourth )
  })

  it('follows the app\'s items', async () => {
    await rows()
    app.state.items = ROWS.slice( 0, 2 )
    await settle( () => drawn().length === 2 )
    expect( q('.rows')!.firstElementChild!.getAttribute('style') ).toContain('height: 80px')
  })

  it('in columns: a row holds that many items, side by side', async () => {
    await rows( 'columns=4' )
    // 8 rows drawn, 4 items each
    expect( drawn().length ).toBe( 32 )
    expect( drawn()[ 5 ].getAttribute('style') ).toMatch( /top: 40px; left: 25%; width: 25%/ )
    expect( q('.rows')!.firstElementChild!.getAttribute('style') ).toContain('height: 10000px')
  })

  it('as a grid, it says how many rows it has and each row which it is', async () => {
    await rows( 'role="grid"' )
    expect( q('.rows')!.getAttribute('aria-rowcount') ).toBe('1000')
    expect( drawn()[ 3 ].getAttribute('role') ).toBe('row')
    expect( drawn()[ 3 ].getAttribute('aria-rowindex') ).toBe('4')
    scroll( 4000 )
    await settle( () => drawn()[ 0 ].getAttribute('aria-rowindex') === '98' )
  })

  it('as a plain list, it says neither', async () => {
    await rows()
    expect( q('.rows')!.hasAttribute('aria-rowcount') ).toBe( false )
    expect( drawn()[ 0 ].hasAttribute('aria-rowindex') ).toBe( false )
    expect( drawn()[ 0 ].hasAttribute('role') ).toBe( false )
  })

  it('frame: from the first row to draw to past the last, in items', () => {
    expect( frame( 1000, 0, 200, 40 ) ).toEqual([ 0, 8 ])
    expect( frame( 1000, 4000, 200, 40, 1, 0 ) ).toEqual([ 100, 105 ])
    expect( frame( 10, 0, 200, 40, 3, 0 ) ).toEqual([ 0, 10 ])
    expect( frame( 1000, 39000, 1000, 40 ) ).toEqual([ 972, 1000 ])
    expect( frame( 5, 0, 200, 0 ) ).toEqual([ 0, 0 ])
  })
})

// ------------------------------------------------------------------- date picker
describe('date picker', () => {
  let changed: string[], months: string[]
  async function grid( extra = '', value: string | null = '2026-11-25' ){
    lips.use( datePicker )
    changed = []
    months = []
    app = lips.render( 'date', {
      state: { due: value },
      static: { weekend: ( iso: string ) => [ 0, 6 ].includes( new Date( iso + 'T00:00:00Z' ).getUTCDay() ) },
      handler: {
        setDue( iso: string ){ changed.push( iso ); ( this as any ).state.due = iso },
        shown( m: string ){ months.push( m ) }
      },
      default: `<div><date-grid value=state.due today="2026-11-25" lang="en-GB" class="cal" day="day" ${extra} on-change( setDue ) on-month( shown )/></div>`
    })
    app.appendTo('#app')
    await settle( () => !!q('[role="grid"]') )
    return q('[role="grid"]')!
  }
  const cell = ( iso: string ) => document.querySelector( `[id$="-${iso}"]` ) as HTMLElement | null
  const active = ( g: HTMLElement ) => g.getAttribute('aria-activedescendant')!.replace( /^lips-date-\d+-/, '' )
  const title = () => q('[id$="-title"]')!.textContent
  const weeks = () => document.querySelectorAll('[role="grid"] > [role="row"]').length - 1

  it('a month as a grid of days, in the reader\'s language: its title, its weekdays from Monday, each day named in full', async () => {
    const g = await grid()
    expect( title() ).toBe('November 2026')
    expect( g.getAttribute('aria-labelledby') ).toBe( q('[id$="-title"]')!.id )
    expect( [ ...document.querySelectorAll('[role="columnheader"]') ].map( h => h.textContent ) ).toEqual([ 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun' ])
    expect( document.querySelector('[role="columnheader"]')!.getAttribute('aria-label') ).toBe('Monday')
    // From the Monday of the week holding the 1st, a Sunday: six weeks
    expect( weeks() ).toBe( 6 )
    expect( document.querySelector('[role="gridcell"]')!.id ).toMatch( /-2026-10-26$/ )
    expect( cell('2026-10-26')!.className ).toContain('is-outside')
    expect( cell('2026-11-25')!.getAttribute('aria-label') ).toBe('Wednesday, 25 November 2026')
  })

  it('the chosen day is selected and active; today is marked', async () => {
    const g = await grid( '', '2026-11-10' )
    expect( active( g ) ).toBe('2026-11-10')
    expect( cell('2026-11-10')!.getAttribute('aria-selected') ).toBe('true')
    expect( cell('2026-11-10')!.className ).toBe('day is-active is-selected')
    expect( cell('2026-11-11')!.getAttribute('aria-selected') ).toBe('false')
    expect( cell('2026-11-25')!.className ).toBe('day is-today')
  })

  it('in American English, the week starts on Sunday', async () => {
    await grid( 'lang="en-US"' )
    expect( document.querySelector('[role="columnheader"]')!.textContent ).toBe('Sun')
    expect( weeks() ).toBe( 5 )
    expect( cell('2026-11-25')!.getAttribute('aria-label') ).toBe('Wednesday, November 25, 2026')
  })

  it('the title in the language\'s own order', async () => {
    await grid( 'lang="ja"' )
    expect( title() ).toBe('2026年11月')
  })

  it('`first` sets the week\'s start', async () => {
    await grid( 'first=6' )
    expect( document.querySelector('[role="columnheader"]')!.textContent ).toBe('Sat')
  })

  it('arrows move a day and a week, Home and End to the week\'s ends', async () => {
    const g = await grid()
    for( const [ k, to ] of [ [ 'ArrowRight', '2026-11-26' ], [ 'ArrowDown', '2026-12-03' ], [ 'ArrowLeft', '2026-12-02' ], [ 'ArrowUp', '2026-11-25' ], [ 'Home', '2026-11-23' ], [ 'End', '2026-11-29' ] ] ){
      key( g, k )
      await settle( () => active( g ) === to )
    }
    expect( changed ).toEqual( [] )
  })

  it('crossing into another month shows it and says so', async () => {
    const g = await grid()
    key( g, 'ArrowDown' )
    await settle( () => active( g ) === '2026-12-02' )
    expect( title() ).toBe('December 2026')
    expect( months ).toEqual([ '2026-12' ])
    expect( cell('2026-12-02')!.className ).toContain('is-active')
  })

  it('Page Up and Down move a month, kept to its last day; with Shift, a year', async () => {
    const g = await grid( '', '2026-01-31' )
    key( g, 'PageDown' )
    await settle( () => active( g ) === '2026-02-28' )
    key( g, 'PageUp' )
    await settle( () => active( g ) === '2026-01-28' )
    g.dispatchEvent( new KeyboardEvent( 'keydown', { key: 'PageUp', shiftKey: true, bubbles: true }) )
    await settle( () => active( g ) === '2025-01-28' )
    expect( title() ).toBe('January 2025')
  })

  it('Enter or Space chooses the active day; a tap chooses the day tapped', async () => {
    const g = await grid()
    key( g, 'ArrowRight' )
    await settle( () => active( g ) === '2026-11-26' )
    key( g, 'Enter' )
    await settle( () => changed.length === 1 )
    key( g, 'ArrowRight' )
    key( g, ' ' )
    await settle( () => changed.length === 2 )
    cell('2026-11-03')!.click()
    await settle( () => changed.length === 3 )
    expect( changed ).toEqual([ '2026-11-26', '2026-11-27', '2026-11-03' ])
    expect( active( g ) ).toBe('2026-11-03')
    expect( cell('2026-11-03')!.getAttribute('aria-selected') ).toBe('true')
  })

  it('a day before min, after max or one the app refuses cannot be chosen', async () => {
    const g = await grid( 'min="2026-11-05" max="2026-11-26" disabled=static.weekend' )
    // Before min, after max (a Friday), a Saturday
    for( const iso of [ '2026-11-04', '2026-11-27', '2026-11-21' ] ){
      expect( cell( iso )!.getAttribute('aria-disabled'), iso ).toBe('true')
      expect( cell( iso )!.className, iso ).toContain('is-disabled')
      cell( iso )!.click()
    }
    // A tap on one moves nothing either
    expect( active( g ) ).toBe('2026-11-25')
    expect( cell('2026-11-24')!.hasAttribute('aria-disabled') ).toBe( false )
    // Reached by the keyboard, it is still not chosen
    key( g, 'End' )
    await settle( () => active( g ) === '2026-11-29' )
    key( g, 'Enter' )
    await new Promise( r => setTimeout( r, 20 ) )
    expect( changed ).toEqual( [] )
  })

  it('the buttons each side of the title move a month, named in words', async () => {
    const g = await grid()
    const [ prev, next ] = [ ...q('.cal')!.querySelectorAll('button') ]
    expect( prev.getAttribute('aria-label') ).toBe('Previous month')
    next.click()
    await settle( () => title() === 'December 2026' )
    expect( active( g ) ).toBe('2026-12-25')
    prev.click()
    prev.click()
    await settle( () => title() === 'October 2026' )
  })

  it('the app\'s words, where it gives them, name everything', async () => {
    lips.use( datePicker )
    const FR = { ...ENGLISH, months: ENGLISH.months.map( m => 'M-' + m ), short: [ 'di', 'lu', 'ma', 'me', 'je', 've', 'sa' ], prev: 'Mois précédent' }
    app = lips.render( 'date-words', {
      static: { fr: FR },
      default: `<div><date-grid value="2026-11-25" today="2026-11-25" words=static.fr first=1/></div>`
    })
    app.appendTo('#app')
    await settle( () => !!q('[role="grid"]') )
    expect( title() ).toBe('M-November 2026')
    expect( document.querySelector('[role="columnheader"]')!.textContent ).toBe('lu')
    expect( q('button')!.getAttribute('aria-label') ).toBe('Mois précédent')
  })

  it('a new value from the app shows its month', async () => {
    const g = await grid()
    app.state.due = '2027-03-02'
    await settle( () => title() === 'March 2027' )
    expect( active( g ) ).toBe('2027-03-02')
  })

  it('in a popover: opened, the grid has focus; a day chosen closes it, focus back on the trigger', async () => {
    lips.use( datePicker )
    changed = []
    app = lips.render( 'date-pop', {
      state: { open: false, due: '2026-11-25' },
      handler: {
        setOpen( o: boolean ){ ( this as any ).state.open = o },
        setDue( iso: string ){ changed.push( iso ); ( this as any ).state.due = iso }
      },
      default: `<div><popover open=state.open on-change( setOpen )>
        <popover-trigger haspopup="dialog" class="pick"><span>{state.due}</span></popover-trigger>
        <popover-date value=state.due label="Due date" today="2026-11-25" lang="en-GB" class="sheet" on-change( setDue )/>
      </popover></div>`
    })
    app.appendTo('#app')
    await settle( () => !!q('.pick') )
    const t = q('.pick')!
    t.click()
    await settle( () => document.activeElement === q('[role="grid"]') )
    const d = q('[role="dialog"]')!
    expect( d.getAttribute('aria-label') ).toBe('Due date')
    expect( t.getAttribute('aria-controls') ).toBe( d.id )
    key( q('[role="grid"]')!, 'ArrowRight' )
    key( q('[role="grid"]')!, 'Enter' )
    await settle( () => !q('[role="dialog"]') )
    expect( changed ).toEqual([ '2026-11-26' ])
    expect( document.activeElement ).toBe( t )
    // Escape closes it too
    t.click()
    await settle( () => !!q('[role="grid"]') )
    key( q('[role="grid"]')!, 'Escape' )
    await settle( () => !q('[role="dialog"]') )
  })

  it('days, months and weeks as ISO days, in UTC', () => {
    expect( isoOf( 2026, 11, 32 ) ).toBe('2027-01-01')
    expect( addDays( '2026-03-28', 2 ) ).toBe('2026-03-30')
    expect( addMonths( '2024-03-31', -1 ) ).toBe('2024-02-29')
    expect( addMonths( '2026-12-15', 1 ) ).toBe('2027-01-15')
    // February 2027 starts on a Monday: four weeks; 2026's, on a Sunday: five
    const w = weeksOf( '2027-02', 1 )
    expect( w.length ).toBe( 4 )
    expect( [ w[ 0 ][ 0 ], w[ 3 ][ 6 ] ] ).toEqual([ '2027-02-01', '2027-02-28' ])
    expect( weeksOf( '2026-02', 1 ).length ).toBe( 5 )
    expect( weeksOf( '2026-02', 0 )[ 0 ][ 0 ] ).toBe('2026-02-01')
  })

  it('English where Intl does not format dates; Monday where it has no week info', () => {
    const real = Intl.DateTimeFormat
    ;( Intl as any ).DateTimeFormat = class { format( v: unknown ){ return String( v ) } }
    try { expect( calendarWords('fr') ).toBe( ENGLISH ) }
    finally { ( Intl as any ).DateTimeFormat = real }
    expect( calendarWords('fr').months[ 0 ] ).toBe('janvier')
    expect( firstDay('en-US') ).toBe( 0 )
    expect( firstDay('en-GB') ).toBe( 1 )
    expect( firstDay('not a tag') ).toBe( 1 )
  })
})
