import { describe, it, expect, beforeEach, vi } from 'vitest'
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

const lis = () => [ ...document.querySelectorAll('li') ]
const texts = () => lis().map( li => li.textContent )

let lips: Lips
beforeEach( () => {
  document.body.innerHTML = '<div id="app"></div>'
  lips = new Lips({ engine: 'runtime' })
})

function renderList( name: string, items: any[] ){
  const c = lips.render( name, {
    state: { items },
    default: `
      <ul>
        <for [item, i] in=state.items by="id">
          <li>{i}:{item.label}</li>
        </for>
      </ul>`
  })
  c.appendTo('#app')
  return c
}

describe('<for by=...> keyed reconciliation', () => {
  it('renders the initial keyed list', async () => {
    renderList('k-initial', [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' }
    ])

    await settle( () => lis().length === 2 )
    expect( texts() ).toEqual([ '0:A', '1:B' ])
  })

  it('preserves DOM node identity across a full reorder', async () => {
    const c = renderList('k-reorder', [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C' }
    ])
    await settle( () => lis().length === 3 )

    const [ elA, elB, elC ] = lis()

    c.state.items = [
      { id: 'c', label: 'C' },
      { id: 'b', label: 'B' },
      { id: 'a', label: 'A' }
    ]
    await settle( () => texts()[0] === '0:C' && texts()[2] === '2:A' )

    const after = lis()
    expect( texts() ).toEqual([ '0:C', '1:B', '2:A' ])
    // Same node instances, relocated — not re-created
    expect( after[0] ).toBe( elC )
    expect( after[1] ).toBe( elB )
    expect( after[2] ).toBe( elA )
  })

  it('prepends without recreating existing nodes', async () => {
    const c = renderList('k-prepend', [
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C' }
    ])
    await settle( () => lis().length === 2 )

    const [ elB, elC ] = lis()

    c.state.items = [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C' }
    ]
    await settle( () => lis().length === 3 && texts()[0] === '0:A' )

    const after = lis()
    expect( texts() ).toEqual([ '0:A', '1:B', '2:C' ])
    expect( after[1] ).toBe( elB )
    expect( after[2] ).toBe( elC )
  })

  it('removes mid-list items and keeps the survivors', async () => {
    const c = renderList('k-remove', [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C' }
    ])
    await settle( () => lis().length === 3 )

    const [ elA, , elC ] = lis()

    c.state.items = [
      { id: 'a', label: 'A' },
      { id: 'c', label: 'C' }
    ]
    await settle( () => lis().length === 2 && texts()[1] === '1:C' )

    const after = lis()
    expect( texts() ).toEqual([ '0:A', '1:C' ])
    expect( after[0] ).toBe( elA )
    expect( after[1] ).toBe( elC )
  })

  it('patches item content in place on data change', async () => {
    const c = renderList('k-patch', [ { id: 'a', label: 'old' } ])
    await settle( () => lis().length === 1 )

    const el = lis()[0]

    c.state.items = [ { id: 'a', label: 'new' } ]
    await settle( () => texts()[0] === '0:new' )
    expect( lis()[0] ).toBe( el )
  })

  it('preserves nested component state across reorder', async () => {
    lips.register('tally', {
      state: { n: 0 },
      handler: {
        bump(){ this.state.n++ }
      },
      default: `<button class="tally" on-click(bump)>{state.n}</button>`
    })

    const c = lips.render('k-nested-state', {
      state: {
        items: [ { id: 'x' }, { id: 'y' } ]
      },
      default: `
        <div>
          <for [item] in=state.items by="id">
            <section><b>{item.id}</b><tally/></section>
          </for>
        </div>`
    })
    c.appendTo('#app')

    await settle( () => document.querySelectorAll('section').length === 2 )

    // Bump y's tally to 1
    const yTally = document.querySelectorAll('section')[1].querySelector('.tally') as HTMLButtonElement
    yTally.click()
    await settle( () => yTally.textContent === '1' )

    // Reorder: y first
    c.state.items = [ { id: 'y' }, { id: 'x' } ]
    await settle( () => document.querySelectorAll('section')[0]?.querySelector('b')?.textContent === 'y' )

    const first = document.querySelectorAll('section')[0]
    // y's internal component state traveled with its key
    expect( first.querySelector('.tally')?.textContent ).toBe('1')
    expect( first.querySelector('.tally') ).toBe( yTally )
  })

  it('supports a key function via expression', async () => {
    const c = lips.render('k-fn', {
      state: { items: [ { code: 7, label: 'seven' }, { code: 9, label: 'nine' } ] },
      _static: {
        keyOf: ( item: any ) => item.code
      },
      default: `
        <ul>
          <for [item, i] in=state.items by=static.keyOf>
            <li>{i}:{item.label}</li>
          </for>
        </ul>`
    })
    c.appendTo('#app')

    await settle( () => lis().length === 2 )
    const [ el7, el9 ] = lis()

    c.state.items = [ { code: 9, label: 'nine' }, { code: 7, label: 'seven' } ]
    await settle( () => texts()[0] === '0:nine' )

    expect( lis()[0] ).toBe( el9 )
    expect( lis()[1] ).toBe( el7 )
  })

  it('falls back to index reconciliation on duplicate keys', async () => {
    const warn = vi.spyOn( console, 'warn' ).mockImplementation( () => {} )

    const c = renderList('k-dupes', [
      { id: 'a', label: 'A1' },
      { id: 'a', label: 'A2' }
    ])
    await settle( () => lis().length === 2 )
    expect( texts() ).toEqual([ '0:A1', '1:A2' ])
    expect( warn ).toHaveBeenCalledWith( expect.stringContaining('duplicate') )

    // Still updates through the fallback path
    c.state.items = [
      { id: 'a', label: 'A1' },
      { id: 'a', label: 'A2' },
      { id: 'a', label: 'A3' }
    ]
    await settle( () => lis().length === 3 )

    warn.mockRestore()
  })
})
