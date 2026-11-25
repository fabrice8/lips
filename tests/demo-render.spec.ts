/**
 * `demos/app`, rendered and clicked through — not only compiled.
 *
 * The demo is documentation: each panel claims a feature works. A panel
 * that compiles clean and does nothing is a wrong claim no compile check
 * sees. The reactivity page's "Re-seed both to 5" button was dead for
 * months, because `onInput` ran at creation only, and every spec passed.
 *
 * The app is the one `index.ts` mounts (`client/boot.ts`), with its
 * stand-in fetch made instant.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { boot } from '../demos/app/client/boot'

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
const turn = () => new Promise( r => setTimeout( r, 0 ) )
const q = ( s: string ) => document.querySelector( s ) as any
const qa = ( s: string ) => [ ...document.querySelectorAll( s ) ] as any[]
const text = ( s: string ) => q( s )?.textContent?.trim()
const button = ( label: string ) => qa('button').find( b => b.textContent.trim() === label )
const type = ( el: HTMLInputElement, value: string ) => {
  el.value = value
  el.dispatchEvent( new Event('input', { bubbles: true }) )
}

let app: ReturnType<typeof boot>
let errors: unknown[]
const spies: any[] = []

beforeAll( () => {
  history.replaceState( null, '', '/')
  document.body.innerHTML = '<div id="app"></div>'
  errors = []
  // What the app logs as an error, or a Lips diagnostic, is a demo that does not work
  spies.push( vi.spyOn( console, 'error' ).mockImplementation( ( ...a ) => { errors.push( a ) }) )
  spies.push( vi.spyOn( console, 'warn' ).mockImplementation( ( ...a ) => { String( a[ 0 ] ).startsWith('[lips') && errors.push( a ) }) )
  app = boot('#app', { delay: 0 })
})
afterAll( () => {
  app.app.destroy()
  spies.forEach( s => s.mockRestore() )
})

const go = async ( path: string, heading: string ) => {
  app.lips.getContext().navigate( path )
  await settle( () => text('h1')?.startsWith( heading ) )
}

beforeEach( () => { errors.length = 0 })

describe('demos/app, rendered', () => {
  it('every route renders its page, logging nothing', async () => {
    for( const [ path, heading ] of [
      [ '/', 'A UI framework' ], [ '/reactivity', 'Reactivity' ], [ '/control-flow', 'Control flow' ],
      [ '/async', 'Async' ], [ '/compose', 'Composition' ], [ '/parts', 'Parts' ], [ '/styles', 'Reactive stylesheets' ],
      [ '/i18n', 'Internationalisation' ], [ '/account?userid=7', 'Account' ], [ '/product/42?category=laptop', 'Product' ]
    ] ){
      await go( path, heading )
      expect( location.pathname, path ).toBe( path.split('?')[ 0 ] )
    }
    expect( errors ).toEqual( [] )
  })

  it('the nav bar marks the page it is on', async () => {
    await go('/compose', 'Composition')
    await settle( () => qa('.nav .on, .nav [aria-current], .nav .active').length > 0 )
  })

  it('an unknown path is the router\'s not-found', async () => {
    app.lips.getContext().navigate('/nowhere')
    await settle( () => text('.miss .path') === '/nowhere' )
    q('.miss .act').click()
    await settle( () => text('h1')?.startsWith('A UI framework') )
  })
})

describe('/reactivity', () => {
  beforeEach( () => go('/reactivity', 'Reactivity') )

  it('re-seeds both counters through their input', async () => {
    const values = () => qa('.counter .value').map( v => v.textContent )
    expect( values() ).toEqual([ '3', '3' ])

    qa('.counter .step')[ 1 ].click()
    await turn()
    expect( values() ).toEqual([ '4', '3' ]) // each instance its own state
    expect( text('.emit b') ).toBe('4') // the child's emit reached the parent's on-update

    button('Re-seed both to 5').click()
    await turn(); await turn()
    expect( values() ).toEqual([ '5', '5' ])
  })

  it('adds, ticks, removes and reorders rows, keeping their nodes', async () => {
    const field = q('input[placeholder="Add a task…"]') as HTMLInputElement
    type( field, 'Write the tests' )
    button('Add').click()
    await turn()

    const rows = () => qa('.panel ul li .text').map( t => t.textContent )
    expect( rows() ).toContain('Write the tests')
    expect( field.value ).toBe('') // state.draft = '' reset the field the reader typed in

    const first = q('.panel ul li')
    const box = first.querySelector('input[type=checkbox]')
    const was = first.classList.contains('done')
    box.click()
    await turn()
    expect( first.classList.contains('done') ).toBe( !was )
    expect( box.checked ).toBe( !was )

    const before = qa('.panel ul li')
    button('Shuffle').click()
    await turn()
    expect( new Set( qa('.panel ul li') ) ).toEqual( new Set( before ) ) // moved, not rebuilt

    const count = before.length
    qa('.panel ul li .drop')[ 0 ].click()
    await turn()
    expect( qa('.panel ul li').length ).toBe( count - 1 )
  })

  it('a context write reaches every reader', async () => {
    expect( q('.pill.on') ).toBeTruthy()
    button('Toggle').click()
    await settle( () => !!q('.pill.off') )
    button('Toggle').click()
    await settle( () => !!q('.pill.on') )
  })
})

describe('/control-flow', () => {
  beforeEach( () => go('/control-flow', 'Control flow') )

  it('branches on a range input', async () => {
    const range = q('input[type=range]') as HTMLInputElement
    for( const [ v, verdict ] of [ [ '10', 'low' ], [ '50', 'mid' ], [ '90', 'high' ] ] ){
      type( range, v )
      await settle( () => !!q(`.verdict.${verdict}`) )
    }
  })

  it('switches on a tab, an array case included', async () => {
    const tabs = qa('.tabs button')
    for( const tab of tabs ){
      tab.click()
      await turn()
      expect( tab.classList.contains('on') ).toBe( true )
      expect( q('.panel-body p') ).toBeTruthy()
    }
  })

  it('a numeric range follows its bound, and a dynamic tag changes element', async () => {
    const chips = () => qa('.chips .chip').length
    const n = chips()
    button('+').click()
    await turn()
    expect( chips() ).toBe( n + 1 )

    const tagOf = () => q('.demo-out').children[ 0 ]?.tagName
    const was = tagOf()
    button('Next tag').click()
    await turn()
    expect( tagOf() ).not.toBe( was )
  })
})

describe('/async', () => {
  beforeEach( () => go('/async', 'Async') )

  it('a profile resolves, a forced error shows the catch arm, a reload resolves again', async () => {
    await settle( () => qa('.card .name').length === 2 )
    expect( qa('.card .name').map( n => n.textContent ) ).toEqual([ 'Ada Lovelace', 'Grace Hopper' ])

    const card = q('.card')
    ;[ ...card.querySelectorAll('button') ].find( ( b: any ) => b.textContent === 'Force error' ).click()
    await settle( () => !!card.querySelector('.error') )

    ;[ ...card.querySelectorAll('button') ].find( ( b: any ) => b.textContent === 'Reload' ).click()
    await settle( () => !!card.querySelector('.name') )
  })

  it('the name field is what the first profile looks up', async () => {
    type( q('input[placeholder="Name to look up…"]'), 'Katherine Johnson' )
    await settle( () => text('.card .name') === 'Katherine Johnson' )
  })
})

describe('/compose', () => {
  beforeEach( () => go('/compose', 'Composition') )

  it('a macro row updates as an ordinary bind, and the slot reads the parent\'s scope', async () => {
    const counts = () => qa('.rowline .count').map( c => c.textContent )
    const before = counts()
    button('bump signal').click()
    await turn()
    expect( counts() ).not.toEqual( before )
    expect( q('.counter .label')?.textContent ).toMatch( /seeded from \d+ macro rows/ )
  })

  it('a spread lands on the element', () => {
    expect( q('.spread').getAttribute('data-source') ).toBe('spread')
  })
})

describe('/parts', () => {
  beforeEach( () => go('/parts', 'Parts') )

  it('the menu opens, selects, and closes', async () => {
    q('popover-trigger button, [aria-haspopup=menu]').click()
    await settle( () => qa('[role=menuitem], .menu li').length === 4 )

    const rename = qa('[role=menuitem], .menu li').find( i => i.textContent.trim() === 'Rename' )
    rename.click()
    await settle( () => text('.picked b') === 'Rename' )
    await settle( () => qa('[role=menuitem], .menu li').length === 0 )
  })

  it('Clear resets a field the reader typed in, and focuses it by its ref', async () => {
    const field = q('input.search') as HTMLInputElement
    type( field, 'typed by the reader' )
    await turn()
    expect( text('.typed') ).toBe('typed by the reader')

    q('.clear').click()
    await turn()
    expect( field.value ).toBe('')
    expect( document.activeElement ).toBe( field )
  })

  it('.stop: pinning or removing a row does not open it', async () => {
    qa('ul.rows li')[ 1 ].click()
    await turn()
    expect( text('.opened-id') ).toBe('2')

    const pin = qa('ul.rows .pin')[ 2 ]
    pin.click()
    await turn()
    expect( pin.textContent ).toBe('★')
    expect( text('.opened-id') ).toBe('2')

    qa('ul.rows .drop')[ 0 ].click()
    await turn()
    expect( qa('ul.rows li').length ).toBe( 2 )
    expect( text('.opened-id') ).toBe('2')
  })

  it('a branch that throws reaches onError, and the page goes on', async () => {
    q('.break').click()
    await settle( () => !!q('.error') )
    expect( text('.error') ).toMatch( /value/ )
    expect( text('h1') ).toBe('Parts & the DOM')

    q('.mend').click()
    await settle( () => !q('.error') )
  })
})

describe('/styles, /i18n, the router pages', () => {
  it('a reactive declaration follows state', async () => {
    await go('/styles', 'Reactive stylesheets')
    const root = q('#app [rel="page-styles"]') as HTMLElement
    const hue = () => root.style.cssText
    const before = hue()
    type( q('input[type=range]'), '120' )
    await settle( () => hue() !== before )
  })

  it('switching language re-translates keyed and source-text strings, and plurals', async () => {
    await go('/i18n', 'Internationalisation')
    const lines = () => qa('.box .line').slice( 0, 4 ).map( l => l.textContent )
    expect( lines() ).toEqual([ 'Overview', 'Reset', 'Settings', 'Undo' ])

    qa('.group button').find( b => b.title === 'Français' ).click()
    await settle( () => lines()[ 0 ] === 'Aperçu' )
    expect( lines()[ 2 ] ).toBe('Paramètres')
    expect( qa('p.line').slice( -1 )[ 0 ].textContent ).toMatch( /panier/ )

    qa('.group button').find( b => b.title === 'English' ).click()
    await settle( () => lines()[ 0 ] === 'Overview' )
  })

  it('a page reads its query and its params as inputs', async () => {
    await go('/account?userid=Ada%20L', 'Account')
    expect( text('.id') ).toBe('Ada L')
    button('no query').click()
    await settle( () => !!q('.missing') )

    await go('/product/42?category=laptop', 'Product')
    expect( qa('dd').map( d => d.textContent ) ).toEqual( expect.arrayContaining([ '42', 'laptop' ]) )
  })

  it('logged nothing on the way', () => expect( errors ).toEqual( [] ) )
})
