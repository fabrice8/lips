/**
 * What a template writes on the DOM where an attribute is not enough:
 * form controls, whose property is what shows; a tag no component claims,
 * which is an element like any other; and the scope of a template placed
 * by value with no name.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import Lips from '../src/lips'

const turn = () => new Promise( r => setTimeout( r, 0 ) )
const q = ( s: string ) => document.querySelector( s ) as any

let lips: any
beforeEach( () => {
  document.body.innerHTML = '<div id="app"></div>'
  document.head.innerHTML = ''
  lips = new Lips()
})

describe('form controls: what shows is the property', () => {
  it('value= resets a field the reader has typed in', async () => {
    const c = lips.render('form-a', { state: { q: 'a' }, default: '<input value=state.q/>' }).appendTo('#app')
    const input = q('input') as HTMLInputElement

    input.value = 'typed'
    c.state.q = ''
    await turn()
    expect( input.value ).toBe('')
    expect( input.getAttribute('value') ).toBe('')
  })

  it('checked= unticks a box the reader ticked', async () => {
    const c = lips.render('form-b', { state: { on: true }, default: '<input type="checkbox" checked=state.on/>' }).appendTo('#app')
    const box = q('input') as HTMLInputElement
    expect( box.checked ).toBe( true )

    c.state.on = false
    expect( box.checked ).toBe( false )
    box.checked = true // the reader
    c.state.on = true
    c.state.on = false
    expect( box.checked ).toBe( false )
  })

  it('<textarea value=…> and <select value=…>, whose options a <for> renders', async () => {
    const c = lips.render('form-c', {
      state: { text: 'hello', pick: 'b', options: [ 'a', 'b', 'c' ] },
      default: `
        <textarea value=state.text></textarea>
        <select value=state.pick><for [o] in=state.options><option value=o>{o}</option></for></select>`
    }).appendTo('#app')

    expect( ( q('textarea') as HTMLTextAreaElement ).value ).toBe('hello')
    expect( ( q('select') as HTMLSelectElement ).value ).toBe('b')

    c.state.pick = 'c'
    expect( ( q('select') as HTMLSelectElement ).value ).toBe('c')
  })

  it('selected= on an option', () => {
    lips.render('form-d', { state: { at: 2 }, default: '<select><for [n] from=1 to=3><option selected=( n === state.at )>{n}</option></for></select>' }).appendTo('#app')
    expect( ( q('select') as HTMLSelectElement ).value ).toBe('2')
  })
})

describe('a tag no component claims is an element', () => {
  it('@text, @html and @format write its content, as on any element', () => {
    lips.i18n.setDictionary('en', { hi: 'Hi {$name}' })
    lips.setLanguage('en')
    lips.render('el-a', {
      state: { t: 'text', h: '<b>bold</b>' },
      default: `
        <no-such-a @text=state.t></no-such-a>
        <no-such-b @html=state.h></no-such-b>
        <no-such-c @format="hi, { name: 'Ada' }"></no-such-c>`
    }).appendTo('#app')

    expect( q('no-such-a').textContent ).toBe('text')
    expect( q('no-such-a').hasAttribute('@text') ).toBe( false )
    expect( q('no-such-b b')?.textContent ).toBe('bold')
    expect( q('no-such-c').textContent ).toContain('Ada')
  })
})

describe('a template placed by value with no name has a scope of its own', () => {
  it('two at once each inject their sheet and carry their own scope', () => {
    const A = { default: '<div class="a">a</div>', stylesheet: 'color: red;' }
    const B = { default: '<div class="b">b</div>', stylesheet: 'color: blue;' }
    lips.render('scope-a', { state: { A, B }, default: '<main><{state.A}/><{state.B}/><{state.A}/></main>' }).appendTo('#app')

    const css = [ ...document.head.querySelectorAll('style') ].map( s => s.textContent ).join('\n')
    expect( css ).toContain('red')
    expect( css ).toContain('blue')

    const [ a1, b, a2 ] = [ ...document.querySelectorAll('main > div') ].map( d => d.getAttribute('rel') )
    expect( a1 ).not.toBe( b )
    expect( a1 ).toBe( a2 ) // the same template, the same scope
  })

  it('a name is the scope', () => {
    lips.render('scope-b', { state: { P: { name: 'page-x', default: '<div class="x">x</div>', stylesheet: 'color: red;' } }, default: '<{state.P}/>' }).appendTo('#app')
    expect( q('.x').getAttribute('rel') ).toBe('page-x')
  })
})
