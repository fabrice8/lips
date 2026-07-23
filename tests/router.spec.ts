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

let lips: Lips
beforeEach( () => {
  document.body.innerHTML = '<div id="app"></div>'
  lips = new Lips()
})

describe('<router>', () => {
  function mountRouter(){
    const item = {
      default: `<h1>{input.params.id}#{input.query.q}</h1>`
    }
    const c = lips.render('t-router', {
      _static: {
        routes: [ { path: '/item/:id', template: item, default: true } ]
      },
      default: `<div><router routes=static.routes></router></div>`
    })
    c.appendTo('#app')
    return c
  }

  it('renders the matched route with path params', async () => {
    mountRouter()

    // onAttach auto-navigates to the default path pattern
    await settle( () => !!document.querySelector('h1') )

    const navigate = ( lips.getContext() as any ).navigate
    expect( typeof navigate ).toBe('function')

    navigate('/item/42?q=ok')
    await settle( () => document.querySelector('h1')?.textContent === '42#ok' )
  })

  it('percent-decodes path params and query values', async () => {
    mountRouter()
    await settle( () => !!document.querySelector('h1') )

    const navigate = ( lips.getContext() as any ).navigate
    navigate('/item/a%20b?q=hello%20world')

    await settle( () => document.querySelector('h1')?.textContent === 'a b#hello world' )
  })

  it('parses query values containing = and +', async () => {
    mountRouter()
    await settle( () => !!document.querySelector('h1') )

    const navigate = ( lips.getContext() as any ).navigate
    navigate('/item/7?q=a%3Db%2Bc')

    await settle( () => document.querySelector('h1')?.textContent === '7#a=b+c' )
  })
})
