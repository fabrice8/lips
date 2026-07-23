import { describe, it, expect, beforeEach } from 'vitest'
import Lips from '../src/lips'

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

const Home    = { default: `<h1 class="home">Home</h1>` }
const Account = { default: `<h1 class="account">Account {input.query.userid}</h1>` }
const Product = { default: `<h1 class="product">Product {input.params.id} / {input.query.category}</h1>` }

let lips: any
beforeEach( () => {
  document.body.innerHTML = '<div id="app"></div>'
  lips = new Lips({ engine: 'ir' } as any )
})

function mountRouter( extra = '' ){
  const c = lips.render('router-host', {
    _static: {
      routes: [
        { path: '/', template: Home, default: true },
        { path: '/account', template: Account },
        { path: '/product/:id', template: Product }
      ]
    },
    default: `<main><router routes=static.routes ${extra}></router></main>`
  })
  c.appendTo('#app')
  return c
}

describe('<router>', () => {
  it('renders the default route on attach', async () => {
    mountRouter()
    await settle( () => !!q('.home') )
  })

  it('navigates via the context navigate function', async () => {
    mountRouter()
    await settle( () => !!q('.home') )

    lips.getContext().navigate('/account?userid=1001')
    await settle( () => !!q('.account') )

    expect( q('.account')?.textContent ).toBe('Account 1001')
    expect( q('.home') ).toBeNull()
  })

  it('extracts path params and percent-decodes them', async () => {
    mountRouter()
    await settle( () => !!q('.home') )

    lips.getContext().navigate('/product/a%20b?category=phone')
    await settle( () => !!q('.product') )

    expect( q('.product')?.textContent ).toBe('Product a b / phone')
  })

  it('swaps pages and disposes the previous one', async () => {
    mountRouter()
    await settle( () => !!q('.home') )

    lips.getContext().navigate('/product/1?category=x')
    await settle( () => !!q('.product') )

    lips.getContext().navigate('/account?userid=7')
    await settle( () => !!q('.account') )
    expect( q('.product') ).toBeNull()
  })

  it('emits before/after around navigation', async () => {
    const events: any[] = []

    const c = lips.render('router-events', {
      _static: {
        routes: [
          { path: '/', template: Home, default: true },
          { path: '/account', template: Account }
        ]
      },
      handler: {
        onNav( this: any, kind: string, payload: any ){ events.push([ kind, payload?.toState?.path ]) }
      },
      default: `<main><router routes=static.routes
                          on-before( onNav, 'before' )
                          on-after( onNav, 'after' )></router></main>`
    })
    c.appendTo('#app')
    await settle( () => !!q('.home') )

    // first navigation has no fromState → only 'after'
    expect( events ).toEqual([ [ 'after', '/' ] ])

    lips.getContext().navigate('/account')
    await settle( () => !!q('.account') )

    expect( events ).toEqual([
      [ 'after', '/' ],
      [ 'before', '/account' ],
      [ 'after', '/account' ]
    ])
  })

  it('emits not-found for unmatched paths', async () => {
    const missing: string[] = []

    const c = lips.render('router-404', {
      _static: { routes: [ { path: '/', template: Home, default: true } ] },
      handler: { onMissing( path: string ){ missing.push( path ) } },
      default: `<main><router routes=static.routes on-not-found( onMissing )></router></main>`
    })
    c.appendTo('#app')
    await settle( () => !!q('.home') )

    lips.getContext().navigate('/nope')
    await settle( () => missing.length === 1 )

    expect( missing ).toEqual([ '/nope' ])
    expect( q('.home') ).toBeNull()   // page cleared
  })
})

describe('dynamic template objects', () => {
  it('renders a template object through <{expr}/>', async () => {
    const c = lips.render('dyn-tpl', {
      state: { page: Home },
      default: `<div><{state.page}/></div>`
    })
    c.appendTo('#app')

    await settle( () => !!q('.home') )
  })

  it('swaps between template objects reactively', async () => {
    const c = lips.render('dyn-swap', {
      state: { page: Home, params: {}, query: { userid: 9 } },
      default: `<div><{state.page} params=state.params query=state.query/></div>`
    })
    c.appendTo('#app')
    await settle( () => !!q('.home') )

    c.state.page = Account
    await settle( () => !!q('.account') )
    expect( q('.account')?.textContent ).toBe('Account 9')
    expect( q('.home') ).toBeNull()

    c.state.page = null
    await settle( () => !q('.account') )
  })

  it('passes state and handlers of the template object', async () => {
    const Counter = {
      state: { n: 0 },
      handler: { bump( this: any ){ this.state.n++ } },
      default: `<button class="cnt" on-click( bump )>{state.n}</button>`
    }

    const c = lips.render('dyn-stateful', {
      state: { page: Counter },
      default: `<div><{state.page}/></div>`
    })
    c.appendTo('#app')
    await settle( () => !!q('.cnt') )

    ;( q('.cnt') as HTMLButtonElement ).click()
    await settle( () => q('.cnt')?.textContent === '1' )
  })
})
