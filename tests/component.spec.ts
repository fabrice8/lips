import { describe, it, expect, beforeEach } from 'vitest'
import Lips from '../src/lips'

/**
 * Integration specs: render real components into happy-dom.
 * Framework updates flow through microtask/timer queues, so
 * assertions on updates poll the DOM until settled.
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

let lips: Lips
beforeEach( () => {
  document.body.innerHTML = '<div id="app"></div>'
  lips = new Lips()
})

describe('basic rendering', () => {
  it('renders static template content', () => {
    const c = lips.render('t-static', {
      default: `<div class="box"><span>hello</span></div>`
    })
    c.appendTo('#app')

    const el = document.querySelector('.box span')
    expect( el?.textContent ).toBe('hello')
  })

  it('interpolates state into text content', () => {
    const c = lips.render('t-interp', {
      state: { name: 'lips' },
      default: `<p>Hi {state.name}!</p>`
    })
    c.appendTo('#app')

    expect( document.querySelector('p')?.textContent ).toBe('Hi lips!')
  })

  it('binds expression attributes', () => {
    const c = lips.render('t-attr', {
      state: { size: 4 },
      default: `<div id="{'box-' + state.size}" data-n=state.size></div>`
    })
    c.appendTo('#app')

    const el = document.querySelector('#app div')
    expect( el?.getAttribute('id') ).toBe('box-4')
    expect( el?.getAttribute('data-n') ).toBe('4')
  })
})

describe('reactive state updates', () => {
  it('updates text when state changes', async () => {
    const c = lips.render('t-count', {
      state: { count: 0 },
      default: `<span>{state.count}</span>`
    })
    c.appendTo('#app')

    expect( document.querySelector('span')?.textContent ).toBe('0')

    c.state.count = 7
    await settle( () => document.querySelector('span')?.textContent === '7' )
  })

  it('updates on deep state mutation', async () => {
    const c = lips.render('t-deep', {
      state: { user: { name: 'Ada' } },
      default: `<b>{state.user.name}</b>`
    })
    c.appendTo('#app')

    c.state.user.name = 'Grace'
    await settle( () => document.querySelector('b')?.textContent === 'Grace' )
  })
})

describe('event handling', () => {
  it('invokes a named handler and applies its state change', async () => {
    const c = lips.render('t-click', {
      state: { count: 0 },
      handler: {
        inc(){ this.state.count++ }
      },
      default: `<div><output>{state.count}</output><button on-click(inc)>+</button></div>`
    })
    c.appendTo('#app')

    ;( document.querySelector('button') as HTMLButtonElement ).click()
    await settle( () => document.querySelector('output')?.textContent === '1' )
  })

  it('passes handler arguments', async () => {
    const c = lips.render('t-args', {
      state: { picked: '' },
      handler: {
        pick( value: string ){ this.state.picked = value }
      },
      default: `<div><i>{state.picked}</i><a on-click(pick, 'red')>red</a></div>`
    })
    c.appendTo('#app')

    ;( document.querySelector('a') as HTMLElement ).click()
    await settle( () => document.querySelector('i')?.textContent === 'red' )
  })
})

describe('<if> / <else>', () => {
  it('renders the matching branch and toggles on update', async () => {
    const c = lips.render('t-if', {
      state: { on: true },
      default: `
        <div>
          <if( state.on )><span class="yes">yes</span></if>
          <else><span class="no">no</span></else>
        </div>`
    })
    c.appendTo('#app')

    await settle( () => !!document.querySelector('.yes') )
    expect( document.querySelector('.no') ).toBeNull()

    c.state.on = false
    await settle( () => !!document.querySelector('.no') )
    expect( document.querySelector('.yes') ).toBeNull()
  })
})

describe('<for>', () => {
  it('renders array items with value and index', async () => {
    const c = lips.render('t-for', {
      state: { items: [ 'a', 'b', 'c' ] },
      default: `
        <ul>
          <for [item, i] in=state.items>
            <li>{i}:{item}</li>
          </for>
        </ul>`
    })
    c.appendTo('#app')

    await settle( () => document.querySelectorAll('li').length === 3 )
    expect( [ ...document.querySelectorAll('li') ].map( li => li.textContent ) )
      .toEqual([ '0:a', '1:b', '2:c' ])
  })

  it('appends and removes items on state change', async () => {
    const c = lips.render('t-for-mut', {
      state: { items: [ 'x' ] },
      default: `<div><for [item] in=state.items><p>{item}</p></for></div>`
    })
    c.appendTo('#app')

    await settle( () => document.querySelectorAll('p').length === 1 )

    c.state.items = [ 'x', 'y', 'z' ]
    await settle( () => document.querySelectorAll('p').length === 3 )

    c.state.items = [ 'z' ]
    await settle( () => document.querySelectorAll('p').length === 1 )
    expect( document.querySelector('p')?.textContent ).toBe('z')
  })
})

describe('nested components', () => {
  it('renders a registered child component with input', async () => {
    lips.register('badge', {
      default: `<em class="badge">{input.label}</em>`
    })

    const c = lips.render('t-nested', {
      state: { text: 'new' },
      default: `<div><badge label=state.text/></div>`
    })
    c.appendTo('#app')

    await settle( () => document.querySelector('.badge')?.textContent === 'new' )

    c.state.text = 'hot'
    await settle( () => document.querySelector('.badge')?.textContent === 'hot' )
  })
})

describe('teardown', () => {
  it('removes root component DOM on destroy()', async () => {
    const c = lips.render('t-destroy', {
      default: `<section><span>gone soon</span></section>`
    })
    c.appendTo('#app')
    expect( document.querySelector('section') ).not.toBeNull()

    c.destroy()
    await settle( () => document.querySelector('section') === null )
  })

  it('destroys nested child components recursively on parent destroy()', async () => {
    let leafDestroyed = false
    let branchDestroyed = false

    lips.register('leaf', {
      default: `<em class="leaf">leaf</em>`,
      handler: { onDestroy(){ leafDestroyed = true } }
    })
    lips.register('branch', {
      default: `<b class="branch"><leaf/></b>`,
      handler: { onDestroy(){ branchDestroyed = true } }
    })

    const c = lips.render('t-nested-destroy', {
      default: `<div><branch/></div>`
    })
    c.appendTo('#app')

    await settle( () => !!document.querySelector('.branch .leaf') )

    c.destroy()
    await settle( () => branchDestroyed && leafDestroyed )
    expect( document.querySelector('.leaf') ).toBeNull()
  })

  // Remaining Phase 1 gap: syntax components (<if>, <for>, …) are
  // intentionally excluded from the PCC cache, so their instances are
  // still never destroyed with the parent — needs instance tracking.
  it.todo('destroys syntax-component instances on parent destroy()')
})
