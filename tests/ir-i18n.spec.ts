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

const EN = {
  'Count': 'Count',
  'Reply': 'Reply',
  'welcome_user': { type: 'text', value: 'Welcome {name}!' },
  'items_count': {
    type: 'plural',
    value: { '0': 'No items', '1': 'One item', '*': '{count} items' }
  }
}
const FR = {
  'Count': 'Compter',
  'Reply': 'Repondre',
  'Search…': 'Rechercher…',
  'welcome_user': { type: 'text', value: 'Bienvenue {name}!' }
}

let lips: any
beforeEach( () => {
  document.body.innerHTML = '<div id="app"></div>'
  lips = new Lips({ engine: 'ir' } as any )
  lips.i18n.setDictionary('en', EN )
  lips.i18n.setDictionary('fr', FR )
  lips.setLanguage('en-US')
})

describe('i18n.translate', () => {
  /**
   * Direct unit coverage. Every other spec here drives translate()
   * through a render, which only ever exercises the one-argument
   * form — that is how the two-argument form stayed inverted.
   */
  it('translates into the current language', () => {
    lips.setLanguage('fr-FR')
    expect( lips.i18n.translate('Count').text ).toBe('Compter')
  })

  it('naming the current language behaves like omitting it', () => {
    lips.setLanguage('fr-FR')

    expect( lips.i18n.translate('Count', 'fr-FR') ).toEqual( lips.i18n.translate('Count') )
    expect( lips.i18n.translate('Count', 'fr-FR').text ).toBe('Compter')
    expect( lips.i18n.translate('Count', 'fr').text ).toBe('Compter')
  })

  it('translates into an explicitly named other language', () => {
    lips.setLanguage('en-US')
    expect( lips.i18n.translate('Count', 'fr-FR').text ).toBe('Compter')
  })

  it('reports back the language it resolved against', () => {
    lips.setLanguage('en-US')

    expect( lips.i18n.translate('Count').lang ).toBe('en-US')
    expect( lips.i18n.translate('Count', 'fr-FR').lang ).toBe('fr-FR')
  })

  it('selects a region variant, including for the current language', () => {
    lips.i18n.setDictionary('en', {
      ...EN,
      'Device Screens': { '*': 'Device Screens', UK: 'Media Devices' }
    })

    // The variant must be reachable through BOTH forms
    lips.setLanguage('en-UK')
    expect( lips.i18n.translate('Device Screens').text ).toBe('Media Devices')
    expect( lips.i18n.translate('Device Screens', 'en-UK').text ).toBe('Media Devices')

    // …and an unknown region falls back to '*'
    expect( lips.i18n.translate('Device Screens', 'en-CA').text ).toBe('Device Screens')
    expect( lips.i18n.translate('Device Screens', 'en').text ).toBe('Device Screens')

    lips.i18n.setDictionary('en', EN )
  })

  it('passes unknown keys and unknown languages through unchanged', () => {
    expect( lips.i18n.translate('Untranslated').text ).toBe('Untranslated')
    expect( lips.i18n.translate('Count', 'de-DE').text ).toBe('Count')
  })
})

describe('i18n', () => {
  it('translates static text on i18n-marked elements', async () => {
    lips.render('t-static', { default: `<button i18n class="b">Count</button>` }).appendTo('#app')
    await settle( () => !!q('.b') )

    expect( q('.b')?.textContent ).toBe('Count')

    lips.setLanguage('fr-FR')
    await settle( () => q('.b')?.textContent === 'Compter' )
  })

  it('does not emit the i18n marker as a DOM attribute', async () => {
    lips.render('t-marker', { default: `<button i18n class="b">Count</button>` }).appendTo('#app')
    await settle( () => !!q('.b') )

    expect( q('.b')?.hasAttribute('i18n') ).toBe( false )
  })

  it('leaves unmarked elements untranslated', async () => {
    lips.render('t-unmarked', { default: `<button class="b">Count</button>` }).appendTo('#app')
    await settle( () => !!q('.b') )

    lips.setLanguage('fr-FR')
    await new Promise( r => setTimeout( r, 20 ) )
    expect( q('.b')?.textContent ).toBe('Count')
  })

  it('translates interpolated text under an i18n element', async () => {
    const c = lips.render('t-interp', {
      state: { word: 'Reply' },
      default: `<span i18n class="s">{state.word}</span>`
    })
    c.appendTo('#app')
    await settle( () => q('.s')?.textContent === 'Reply' )

    lips.setLanguage('fr-FR')
    await settle( () => q('.s')?.textContent === 'Repondre' )
  })

  it('translates title/placeholder attributes only when marked', async () => {
    lips.render('t-attrs', {
      default: `<div><input i18n class="i" placeholder="Search…"><b class="p" title="Count">x</b></div>`
    }).appendTo('#app')
    await settle( () => !!q('.i') )

    lips.setLanguage('fr-FR')
    await settle( () => q('.i')?.getAttribute('placeholder') === 'Rechercher…' )

    // unmarked element keeps its literal title
    expect( q('.p')?.getAttribute('title') ).toBe('Count')
  })

  it('renders @format with parameters', async () => {
    const c = lips.render('t-format', {
      state: { name: 'Ada' },
      default: `<p class="f" @format="welcome_user, { name: state.name }"></p>`
    })
    c.appendTo('#app')

    await settle( () => q('.f')?.textContent === 'Welcome Ada!' )

    c.state.name = 'Grace'
    await settle( () => q('.f')?.textContent === 'Welcome Grace!' )

    lips.setLanguage('fr-FR')
    await settle( () => q('.f')?.textContent === 'Bienvenue Grace!' )
  })

  it('supports plural-style formats', async () => {
    const c = lips.render('t-plural', {
      state: { n: 0 },
      default: `<b class="c" @format="items_count, { count: state.n }"></b>`
    })
    c.appendTo('#app')

    await settle( () => q('.c')?.textContent === 'No items' )

    c.state.n = 1
    await settle( () => q('.c')?.textContent === 'One item' )

    c.state.n = 5
    await settle( () => q('.c')?.textContent === '5 items' )
  })

  it('exposes getLanguage and useTranslator', async () => {
    expect( lips.getLanguage() ).toBe('en-US')

    const seen: string[] = []
    lips.useTranslator('*', ( lang: string ) => seen.push( lang ) )

    lips.setLanguage('fr-FR')
    await new Promise( r => setTimeout( r, 10 ) )

    expect( lips.getLanguage() ).toBe('fr-FR')
    expect( seen ).toEqual([ 'fr-FR' ])
  })

  it('translates inside loops and nested components', async () => {
    lips.register('chip', { default: `<em i18n class="chip">{input.word}</em>` })

    lips.render('t-nested', {
      state: { words: [ 'Count', 'Reply' ] },
      default: `<div><for [w] in=state.words><chip word=w/></for></div>`
    }).appendTo('#app')

    await settle( () => document.querySelectorAll('.chip').length === 2 )

    lips.setLanguage('fr-FR')
    await settle( () =>
      [ ...document.querySelectorAll('.chip') ].map( e => e.textContent ).join('|') === 'Compter|Repondre' )
  })
})
