import { describe, it, expect, beforeEach, vi } from 'vitest'
import Lips from '../src/lips'
import I18N from '../src/i18n'
import { compileTemplate } from '../src/ir/compiler'

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
const txt = ( sel: string ) => q( sel )?.textContent

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

describe('self.lang', () => {
  /**
   * Before this existed there was no way to READ the active language
   * from a template, which is what pushed apps into mirroring it into
   * context by hand (RFC-005 §2).
   */
  it('renders the active language and follows setLanguage', async () => {
    lips.render('t-selflang', { default: `<span class="l">{self.lang}</span>` }).appendTo('#app')
    await settle( () => txt('.l') === 'en-US' )

    lips.setLanguage('fr-FR')
    await settle( () => txt('.l') === 'fr-FR' )
  })

  it('switches language from a template handler', async () => {
    lips.render('t-switcher', {
      default: `<div>
        <button class="fr" on-click( () => self.setLanguage('fr-FR') )>fr</button>
        <b class="w" i18n>Count</b>
      </div>`
    }).appendTo('#app')

    await settle( () => txt('.w') === 'Count' )
    ;( q('.fr') as HTMLElement ).click()

    await settle( () => txt('.w') === 'Compter' && lips.getLanguage() === 'fr-FR' )
  })

  /**
   * `self` is ONE object per component, so a `<i18n lang=…>` block in
   * the middle of a template cannot give `self.lang` two values at once.
   * The rule is per-component: a component reports the language of the
   * place it was INSTANTIATED. Scoped translation still applies to every
   * bind in the subtree — only `self.lang` is component-grained.
   */
  it('is component-grained: a same-template <i18n> block does not change it', async () => {
    lips.render('t-selfsame', {
      default: `<i18n lang="de-DE"><i class="in">{self.lang}</i></i18n>`
    }).appendTo('#app')

    await settle( () => !!txt('.in') )
    expect( txt('.in') ).toBe('en-US')
  })

  it('reports the scoped language in a component placed under <i18n>', async () => {
    lips.register('shower', { default: `<em class="sh">{self.lang}</em>` })

    lips.render('t-selfscoped', {
      default: `<div>
        <shower/>
        <i18n lang="de-DE"><shower/></i18n>
      </div>`
    }).appendTo('#app')

    await settle( () => document.querySelectorAll('.sh').length === 2 )

    expect( [ ...document.querySelectorAll('.sh') ].map( e => e.textContent ) )
      .toEqual([ 'en-US', 'de-DE' ])
  })
})

describe('stable translation keys', () => {
  const KEYED_FR = { 'hero.title': 'Bienvenue', 'search.hint': 'Rechercher…' }

  beforeEach( () => lips.i18n.setDictionary('fr', { ...FR, ...KEYED_FR }) )

  it('translates through the key, not the source text', async () => {
    lips.render('t-key', { default: `<h1 i18n="hero.title" class="h">Welcome</h1>` }).appendTo('#app')
    await settle( () => txt('.h') === 'Welcome' )

    lips.setLanguage('fr-FR')
    await settle( () => txt('.h') === 'Bienvenue' )
  })

  it('survives a reworded source string — the whole point', async () => {
    // Same key, different English wording: the translation must hold
    lips.setLanguage('fr-FR')
    lips.render('t-reworded', {
      default: `<h1 i18n="hero.title" class="r">Welcome back, friend</h1>`
    }).appendTo('#app')

    await settle( () => txt('.r') === 'Bienvenue' )
  })

  it('loses the translation without a key, by design', async () => {
    lips.setLanguage('fr-FR')
    // 'Count' is in the dictionary; a reworded 'Counter' is not
    lips.render('t-unkeyed', { default: `<b i18n class="n">Counter</b>` }).appendTo('#app')

    await settle( () => txt('.n') === 'Counter' )
  })

  it('keys a marked attribute with i18n-<attr>', async () => {
    lips.setLanguage('fr-FR')
    lips.render('t-attrkey', {
      default: `<input i18n i18n-placeholder="search.hint" class="i" placeholder="Find things">`
    }).appendTo('#app')

    await settle( () => q('.i')?.getAttribute('placeholder') === 'Rechercher…' )
  })

  it('emits neither i18n nor i18n-* as DOM attributes', async () => {
    lips.render('t-nokeyattr', {
      default: `<input i18n i18n-placeholder="search.hint" class="i" placeholder="x">`
    }).appendTo('#app')
    await settle( () => !!q('.i') )

    expect( q('.i')?.hasAttribute('i18n') ).toBe( false )
    expect( q('.i')?.hasAttribute('i18n-placeholder') ).toBe( false )
  })

  it('falls back to the source wording when the key is absent', async () => {
    lips.setLanguage('fr-FR')
    lips.render('t-misskey', { default: `<b i18n="nope.missing" class="m">Fallback</b>` }).appendTo('#app')

    await settle( () => txt('.m') === 'Fallback' )
  })

  it('reports a missing key through onMissing', async () => {
    const seen: string[] = []
    lips.i18n.onMissing = ( key: string ) => seen.push( key )
    lips.setLanguage('fr-FR')

    lips.render('t-onmissing', { default: `<b i18n="nope.missing" class="m">Fallback</b>` }).appendTo('#app')
    await settle( () => seen.includes('nope.missing') )
  })

  it('stays silent for an untranslated string that has no key', async () => {
    const seen: string[] = []
    lips.i18n.onMissing = ( key: string ) => seen.push( key )
    lips.setLanguage('fr-FR')

    lips.render('t-silent', { default: `<b i18n class="s">Nowhere</b>` }).appendTo('#app')
    await settle( () => txt('.s') === 'Nowhere' )

    expect( seen ).toEqual( [] )
  })

  it('rejects a key on text split into several runs', () => {
    const { diagnostics } = compileTemplate(`<h1 i18n="k">Hello {state.name}</h1>`)
    expect( diagnostics.some( d => d.code === 'LIPS-C015' ) ).toBe( true )
  })

  it('warns about an i18n-* key with no i18n marker', () => {
    const { diagnostics } = compileTemplate(`<input i18n-placeholder="k" placeholder="x">`)
    expect( diagnostics.some( d => d.code === 'LIPS-C014' ) ).toBe( true )
  })
})

describe('<i18n lang=…> scoped language', () => {
  it('translates its subtree in another language', async () => {
    lips.render('t-scoped', {
      default: `<div>
        <b class="out" i18n>Count</b>
        <i18n lang="fr-FR"><i class="in" i18n>Count</i></i18n>
      </div>`
    }).appendTo('#app')

    await settle( () => txt('.in') === 'Compter' )
    expect( txt('.out') ).toBe('Count')
  })

  it('keeps the unscoped part following the global language', async () => {
    lips.render('t-mixed', {
      default: `<div>
        <b class="out" i18n>Reply</b>
        <i18n lang="fr-FR"><i class="in" i18n>Reply</i></i18n>
      </div>`
    }).appendTo('#app')

    await settle( () => txt('.in') === 'Repondre' )

    lips.setLanguage('fr-FR')
    await settle( () => txt('.out') === 'Repondre' )
    // …and the scoped half is unmoved
    expect( txt('.in') ).toBe('Repondre')
  })

  it('tracks a scoped language that comes from state', async () => {
    const c = lips.render('t-scopedyn', {
      state: { doc: 'en-US' },
      default: `<i18n lang=state.doc><i class="d" i18n>Count</i></i18n>`
    })
    c.appendTo('#app')

    await settle( () => txt('.d') === 'Count' )

    c.state.doc = 'fr-FR'
    await settle( () => txt('.d') === 'Compter' )
  })

  it('applies to a component rendered inside it', async () => {
    lips.register('chip2', { default: `<em i18n class="c2">{input.word}</em>` })

    lips.render('t-scopedcomp', {
      default: `<i18n lang="fr-FR"><chip2 word="Count"/></i18n>`
    }).appendTo('#app')

    await settle( () => txt('.c2') === 'Compter' )
  })

  it('applies to @format too', async () => {
    const c = lips.render('t-scopedfmt', {
      state: { name: 'Ada' },
      default: `<i18n lang="fr-FR"><p class="f" @format="welcome_user, { name: state.name }"></p></i18n>`
    })
    c.appendTo('#app')

    await settle( () => txt('.f') === 'Bienvenue Ada!' )
  })

  it('nests, nearest wins', async () => {
    lips.render('t-scopednest', {
      default: `<i18n lang="fr-FR">
        <b class="mid" i18n>Count</b>
        <i18n lang="en-US"><i class="deep" i18n>Count</i></i18n>
      </i18n>`
    }).appendTo('#app')

    await settle( () => !!txt('.deep') )

    expect( txt('.mid') ).toBe('Compter')
    expect( txt('.deep') ).toBe('Count')
  })

  it('requires a lang attribute', () => {
    const { diagnostics } = compileTemplate(`<i18n><b>x</b></i18n>`)
    expect( diagnostics.some( d => d.code === 'LIPS-C018' ) ).toBe( true )
  })
})

describe('i18n initial language', () => {
  it('defaults to the browser language', () => {
    const l: any = new Lips()
    expect( l.getLanguage() ).toBe( navigator.language )
  })

  it('takes LipsConfig.lang over the browser language', () => {
    const l: any = new Lips({ lang: 'fr-FR' })
    expect( l.getLanguage() ).toBe('fr-FR')
    expect( l.i18n.lang ).toBe('fr-FR')
  })

  it('translates from the configured language with no setLanguage call', async () => {
    const l: any = new Lips({ lang: 'fr-FR' })
    l.i18n.setDictionary('fr', FR )

    l.render('t-cfg', { default: `<button i18n class="cfg">Count</button>` }).appendTo('#app')
    await settle( () => q('.cfg')?.textContent === 'Compter' )
  })

  it('falls back to en-US where there is no navigator', () => {
    vi.stubGlobal('navigator', undefined )
    try { expect( new I18N().lang ).toBe('en-US') }
    finally { vi.unstubAllGlobals() }
  })
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
