import { describe, it, expect, beforeEach, vi } from 'vitest'
import Lips from '../src/lips'
import I18N, { lookupTags } from '../src/i18n'
import { parseMessage } from 'messageformat'
import { messageFormat } from '../src/mf2'
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
/** Text as read: MF2 isolates each placeholder (U+2066–2069), which no reader sees */
const bare = ( s?: string | null ) => s?.replace( /[\u2066-\u2069]/g, '' )
const txt = ( sel: string ) => bare( q( sel )?.textContent )

const EN = {
  'Count': 'Count',
  'Reply': 'Reply',
  'welcome_user': 'Welcome {$name}!',
  'items_count': `.input {$count :integer}
                  .match $count
                  0   {{No items}}
                  one {{One item}}
                  *   {{{$count} items}}`
}
const FR = {
  'Count': 'Compter',
  'Reply': 'Repondre',
  'Search…': 'Rechercher…',
  'welcome_user': 'Bienvenue {$name}!'
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

  it('serves a regional dictionary first, and its language for what it lacks', () => {
    lips.i18n.setDictionary('en-GB', { 'Device Screens': 'Media Devices' })
    lips.i18n.setDictionary('en', { ...EN, 'Device Screens': 'Device Screens' })

    // The region must be reachable through BOTH forms
    lips.setLanguage('en-GB')
    expect( lips.i18n.translate('Device Screens').text ).toBe('Media Devices')
    expect( lips.i18n.translate('Device Screens', 'en-GB').text ).toBe('Media Devices')
    expect( lips.i18n.translate('Count', 'en-GB').text ).toBe('Count')

    // …and another region reads its language
    expect( lips.i18n.translate('Device Screens', 'en-CA').text ).toBe('Device Screens')
    expect( lips.i18n.translate('Device Screens', 'en').text ).toBe('Device Screens')
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

    await settle( () => txt('.f') === 'Welcome Ada!' )

    c.state.name = 'Grace'
    await settle( () => txt('.f') === 'Welcome Grace!' )

    lips.setLanguage('fr-FR')
    await settle( () => txt('.f') === 'Bienvenue Grace!' )
  })

  it('selects plurals by the reader\'s CLDR categories, an exact number first', async () => {
    const c = lips.render('t-plural', {
      state: { n: 0 },
      default: `<b class="c" @format="items_count, { count: state.n }"></b>`
    })
    c.appendTo('#app')

    await settle( () => txt('.c') === 'No items' )

    c.state.n = 1
    await settle( () => txt('.c') === 'One item' )

    c.state.n = 5
    await settle( () => txt('.c') === '5 items' )
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

describe('lazy dictionaries', () => {
  it('loads a dictionary on demand when the language switches', async () => {
    const l: any = new Lips({ lang: 'en-US' })
    l.i18n.setLoader( async ( id: string ) => id === 'fr' ? { Count: 'Compter' } : undefined )

    l.render('t-lazy', { default: `<b i18n class="z">Count</b>` }).appendTo('#app')
    await settle( () => txt('.z') === 'Count' )

    l.setLanguage('fr-FR')
    await settle( () => txt('.z') === 'Compter' )
  })

  it('switches immediately and back-fills — source wording is the placeholder', async () => {
    let release: ( d: any ) => void = () => {}
    const l: any = new Lips({ lang: 'en-US' })
    l.i18n.setLoader( () => new Promise( r => { release = r }) )

    l.render('t-lazy2', { default: `<b i18n class="p">Count</b>` }).appendTo('#app')
    await settle( () => txt('.p') === 'Count' )

    l.setLanguage('fr-FR')
    await new Promise( r => setTimeout( r, 20 ) )

    // language already switched, dictionary not in yet
    expect( l.getLanguage() ).toBe('fr-FR')
    expect( txt('.p') ).toBe('Count')

    release({ Count: 'Compter' })
    await settle( () => txt('.p') === 'Compter' )
  })

  it('asks for each tag of the lookup chain, each only once', async () => {
    const calls: string[] = []
    const l: any = new Lips({ lang: 'en-US' })
    l.i18n.setLoader( async ( tag: string ) => { calls.push( tag ); return tag === 'fr' ? { Count: 'Compter' } : undefined })

    l.setLanguage('fr-FR')
    await new Promise( r => setTimeout( r, 20 ) )
    l.setLanguage('en-US')
    l.setLanguage('fr-CA')   // `fr` again — must not refetch
    l.setLanguage('fr-FR')   // answered `undefined` once — must not refetch
    await new Promise( r => setTimeout( r, 20 ) )

    expect( calls ).toEqual([ 'fr-FR', 'fr', 'en-US', 'en', 'fr-CA' ])
  })

  it('does not re-fetch a language whose load failed', async () => {
    let calls = 0
    const l: any = new Lips({ lang: 'en-US' })
    l.i18n.setLoader( async () => { calls++; throw new Error('404') })

    l.setLanguage('fr-FR')
    await new Promise( r => setTimeout( r, 20 ) )
    l.setLanguage('fr-FR')
    await new Promise( r => setTimeout( r, 20 ) )

    expect( calls ).toBe( 2 )   // `fr-FR` and `fr`, once each
  })

  it('skips the loader for a dictionary already registered', async () => {
    const calls: string[] = []
    const l: any = new Lips({ lang: 'en-US' })
    l.i18n.setDictionary('fr', { Count: 'Compter' })
    l.i18n.setLoader( async ( tag: string ) => { calls.push( tag ); return undefined })

    l.setLanguage('fr-FR')
    await new Promise( r => setTimeout( r, 20 ) )

    expect( calls ).toEqual([ 'fr-FR' ])   // `fr` is registered; only the region is asked for
  })

  it('re-translates when a dictionary is registered after render', async () => {
    const l: any = new Lips({ lang: 'fr-FR' })
    l.render('t-late', { default: `<b i18n class="late">Count</b>` }).appendTo('#app')
    await settle( () => txt('.late') === 'Count' )

    l.i18n.setDictionary('fr', { Count: 'Compter' })
    await settle( () => txt('.late') === 'Compter' )
  })

  it('reports whether a language is registered', () => {
    const l: any = new Lips({ lang: 'en-US' })
    l.i18n.setDictionary('fr', { Count: 'Compter' })

    expect( l.i18n.has('fr-CA') ).toBe( true )
    expect( l.i18n.has('FR') ).toBe( true )
    expect( l.i18n.has('de') ).toBe( false )
  })
})

describe('MessageFormat 2', () => {
  it('isolates each placeholder, so a value in another direction cannot reorder the text', async () => {
    lips.render('t-bidi', { default: `<p class="iso" @format="welcome_user, { name: 'Ada' }"></p>` }).appendTo('#app')
    await settle( () => !!q('.iso')?.textContent )

    expect( q('.iso')?.textContent ).toBe('Welcome ⁨Ada⁩!')
  })

  it('selects plurals by the reader\'s CLDR categories', () => {
    const i = new I18N( 'pl', messageFormat )
    i.setDictionary('pl', { files: `.input {$n :integer}
                                    .match $n
                                    one  {{{$n} plik}}
                                    few  {{{$n} pliki}}
                                    many {{{$n} plików}}
                                    *    {{{$n} pliku}}` })

    expect( [ 1, 3, 5, 22, 12 ].map( n => bare( i.format( 'files', { n } ) ) ) )
      .toEqual([ '1 plik', '3 pliki', '5 plików', '22 pliki', '12 plików' ])
  })

  it('formats in the reader\'s own language, from a dictionary of its parent', () => {
    const i = new I18N( 'en', messageFormat )
    i.setDictionary('en', { total: 'Total: {$n :number}' })

    expect( bare( i.format( 'total', { n: 1234567.5 } ) ) ).toBe('Total: 1,234,567.5')
    expect( bare( i.format( 'total', { n: 1234567.5 }, 'en-IN' ) ) ).toBe('Total: 12,34,567.5')
  })

  it('has the default functions and the draft ones: currency from the data, dates, units', () => {
    const i = new I18N( 'en-US', messageFormat )
    i.setDictionary('en', {
      price:  'Costs {$amount :currency currency=$currency}',
      due:    'Due {$on :date length=long}',
      weight: 'Weighs {$kg :unit unit=kilogram}',
      share:  '{$part :percent} done'
    })

    expect( bare( i.format( 'price', { amount: 1234.5, currency: 'EUR' } ) ) ).toBe('Costs €1,234.50')
    expect( bare( i.format( 'due', { on: new Date('2026-03-01T12:00:00Z') } ) ) ).toBe('Due March 1, 2026')
    expect( bare( i.format( 'weight', { kg: 3 } ) ) ).toBe('Weighs 3 kg')
    expect( bare( i.format( 'share', { part: 0.25 } ) ) ).toBe('25% done')
  })

  it('takes a message as its data model, as a server that parsed it serves it', () => {
    const i = new I18N( 'fr', messageFormat )
    i.setDictionary('fr', { greet: JSON.parse( JSON.stringify( parseMessage('Salut {$name}') ) ) })

    expect( bare( i.format( 'greet', { name: 'Ada' } ) ) ).toBe('Salut Ada')
  })

  it('takes a host\'s own function, named with a namespace', () => {
    const i = new I18N( 'en', messageFormat )
    i.functions['app:upper'] = ( _ctx, _options, input ) => {
      const value = String( input ).toUpperCase()
      return { type: 'string', source: '', toString: () => value, toParts: () => [{ type: 'string', value }] } as any
    }
    i.setDictionary('en', { shout: 'Hey {$who :app:upper}' })

    expect( bare( i.format( 'shout', { who: 'ada' } ) ) ).toBe('Hey ADA')
  })

  it('reports a message that does not parse or cannot fill, and renders around it', () => {
    const errors: string[] = []
    const i = new I18N( 'en', messageFormat )
    i.onError = ( _e, key ) => errors.push( key )
    i.setDictionary('en', { broken: 'Hello {$name', unfilled: 'Hello {$name}' })

    expect( i.translate( 'Hello', 'en', 'broken' ).text ).toBe('Hello')
    expect( bare( i.format( 'unfilled', {} ) ) ).toBe('Hello {$name}')
    expect( errors ).toEqual([ 'broken', 'unfilled' ])
  })

  it('never evaluates what a dictionary holds — no code runs, under any CSP', () => {
    const errors: unknown[] = []
    const i = new I18N( 'en', messageFormat )
    i.onError = e => errors.push( e )
    i.setDictionary('en', { cond: { type: 'condition', value: { '(globalThis.__lipsRan = 1)': 'x' } } as any })

    expect( i.format( 'cond', {} ) ).toBeUndefined()
    expect( ( globalThis as any ).__lipsRan ).toBeUndefined()
    expect( errors ).toHaveLength( 1 )
  })
})

describe('the engine', () => {
  it('is handed in, so a build that never translates ships without it', () => {
    const bare = new I18N('fr')
    expect( bare.translate('Count').text ).toBe('Count')
    expect( () => bare.setDictionary( 'fr', { Count: 'Compter' } ) ).toThrow(/without a MessageFormat engine/)
  })

  it('is what the full build wires in, and what a config passes', () => {
    expect( () => new Lips({ lang: 'fr' } as any ).i18n.setDictionary( 'fr', { Count: 'Compter' } ) ).not.toThrow()
    const l: any = new Lips({ lang: 'fr', messageFormat } as any )
    l.i18n.setDictionary( 'fr', { Count: 'Compter' } )
    expect( l.i18n.translate('Count').text ).toBe('Compter')
  })
})

describe('language lookup', () => {
  it('is RFC 4647 Lookup, the RFC\'s own example', () => {
    expect( lookupTags('zh-Hant-CN-x-private1-private2') )
      .toEqual([ 'zh-Hant-CN-x-private1-private2', 'zh-Hant-CN-x-private1', 'zh-Hant-CN', 'zh-Hant', 'zh' ])
  })

  it('serves a script before its language, whatever the casing', () => {
    const i = new I18N( 'zh-Hant-TW', messageFormat )
    i.setDictionary('zh', { tea: '茶 (简)' })
    i.setDictionary('ZH-hant', { tea: '茶 (繁)' })

    expect( i.translate( 'Tea', undefined, 'tea' ).text ).toBe('茶 (繁)')
    expect( i.translate( 'Tea', 'zh-CN', 'tea' ).text ).toBe('茶 (简)')
  })

  it('picks a translatable name\'s text the same way, and follows the language', async () => {
    const site = { default: 'en', names: { en: 'North yard', fr: 'Cour nord', 'zh-Hant': '北院' } }
    expect( lips.i18n.pick( site, 'fr-CA' ) ).toBe('Cour nord')
    expect( lips.i18n.pick( site, 'zh-Hant-HK' ) ).toBe('北院')
    expect( lips.i18n.pick( site, 'de' ) ).toBe('North yard')

    lips.render('t-pick', { state: { site }, default: `<b class="pk">{self.pick( state.site )}</b>` }).appendTo('#app')
    await settle( () => txt('.pk') === 'North yard' )

    lips.setLanguage('fr-FR')
    await settle( () => txt('.pk') === 'Cour nord' )
  })
})

describe('an engine with no Intl', () => {
  it('gets the least MF2 needs: plain numbers, exact matches, every plural `other`', async () => {
    vi.stubGlobal( 'Intl', undefined )
    try {
      vi.resetModules()
      const { messageFormat: fresh } = await import('../src/mf2')
      const i = new I18N( 'pl', fresh )
      i.setDictionary('pl', {
        files: `.input {$n :integer}
                .match $n
                1    {{one file}}
                one  {{{$n} plik}}
                *    {{{$n} files}}`,
        total: 'Total {$n :number}',
        on:    'On {$d :datetime}'
      })

      expect( bare( i.format( 'files', { n: 1 } ) ) ).toBe('one file')
      expect( bare( i.format( 'files', { n: 5 } ) ) ).toBe('5 files')
      expect( bare( i.format( 'total', { n: 1234.5 } ) ) ).toBe('Total 1234.5')
      expect( bare( i.format( 'on', { d: new Date('2026-03-01T00:00:00Z') } ) ) ).toBe('On 2026-03-01T00:00:00.000Z')
    }
    finally { vi.unstubAllGlobals() }
  })

  it('leaves a real Intl alone', async () => {
    const real = Intl
    vi.resetModules()
    await import('../src/mf2')
    expect( Intl ).toBe( real )
    expect( new Intl.PluralRules('pl').select( 3 ) ).toBe('few')
  })
})
