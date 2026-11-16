import type { MessageFormat } from 'messageformat'
import type { MessageFunction } from 'messageformat/functions'
import type { Dictionary, MessageFormatEngine } from '../types'
import { lookupTags, pick, type TranslatableName } from './lookup'

export { lookupTags, pick, type TranslatableName }

/**
 * Last-resort language. Only reached when the host has no
 * `navigator` (SSR, a worker, a test runner) and the caller named
 * no language either.
 */
const DEFAULT_LANG = 'en-US'

/**
 * Every message is Unicode MessageFormat 2 (CLDR 47), formatted by
 * `messageformat` — the same implementation the platform that serves
 * the dictionaries checks them with, so a message means one thing on
 * both sides of the wire. The engine is handed in (`./engine`), so a
 * build that never translates ships without it. An entry is MF2 source:
 *
 *   'cart.items': `.input {$count :integer}
 *                  .match $count
 *                  0   {{Your cart is empty}}
 *                  one {{One item in your cart}}
 *                  *   {{{$count} items in your cart}}`
 *
 * or the same message as its data model (`parseMessage`'s JSON), which is
 * how a server that parsed it once serves it.
 *
 * Dictionaries are keyed by full language tag (`fr`, `fr-CA`, `zh-Hant`)
 * and read through RFC 4647 Lookup: a `fr-CA` reader is served from
 * `fr-CA`, then `fr`, so a regional dictionary carries only what differs.
 */
export default class I18N {
  private currentLang: string
  private DICTIONARIES: Record<string, Dictionary> = {}

  /**
   * MF2 functions a message may call, beyond the default ones built in
   * (`:number`, `:integer`, `:currency`, `:percent`, `:offset`,
   * `:string`). Starts with the draft set — `:date`, `:time`,
   * `:datetime`, `:unit` — and takes a host's own, named with a
   * namespace (`:app:money`) as MF2 asks of custom functions.
   */
  public functions: Record<string, MessageFunction<any, any>>

  /**
   * Reports a stable key that no dictionary entry answers. Left unset
   * translation stays silent; the facade wires it to a console warning
   * under `debug`, and a generator can wire it to collect the gaps.
   */
  public onMissing?: ( key: string, lang: string ) => void

  /**
   * Reports a message that does not parse, or that fails as it formats:
   * a variable not given, an unknown function, a value its function
   * cannot take. Rendering never throws for it — MF2 writes a fallback
   * (`{$name}`) where the failing part was — so this is where it shows.
   */
  public onError?: ( error: unknown, key: string, lang: string ) => void

  /**
   * Fires whenever the dictionary set changes. The facade bumps a
   * revision signal from here, which is what makes a dictionary that
   * arrives LATE — an async load resolving after the language already
   * switched — re-translate what is already on screen.
   */
  public onChange?: () => void

  /** Async dictionary source, set by `setLoader` */
  private loader?: ( tag: string ) => Promise<Dictionary | undefined>
  /** In-flight and settled loads, keyed by language tag */
  private loading = new Map<string, Promise<void>>()
  /** Each message as read by one language, parsed once: `null` where it does not parse */
  private formatters = new Map<string, MessageFormat<any, any> | null>()

  /**
   * `lang` is the initial language, normally `LipsConfig.lang`. Left
   * out, it is read from the browser — which is the right default for
   * an app that should follow the user's locale, but is not something
   * a server render or a test can rely on being there.
   */
  constructor( lang?: string, private engine?: MessageFormatEngine ){
    this.currentLang = lang
                      || ( typeof navigator !== 'undefined' && navigator.language )
                      || DEFAULT_LANG
    this.functions = { ...engine?.functions }
  }

  set lang( value: string ){
    if( this.currentLang === value ) return
    this.currentLang = value
  }
  get lang(){
    return this.currentLang
  }

  /** Register the dictionary for one language tag — `fr`, `fr-CA`, `zh-Hant` — whatever its casing. */
  setDictionary( tag: string, dico: Dictionary ){
    /**
     * Refused rather than read some other way: a dictionary is MF2, and
     * without the engine there is nothing that reads MF2.
     */
    if( !this.engine ) throw new Error(`[lips:i18n] <${tag}> dictionary without a MessageFormat engine — pass \`messageFormat\` from '@lipsjs/lips/i18n' to new Lips()`)
    this.DICTIONARIES[ tag.toLowerCase() ] = dico
    this.formatters.clear()
    this.onChange?.()
  }
  /** Is a dictionary registered that a reader of `lang` is served from? */
  has( lang: string ){ return lookupTags( lang.toLowerCase() ).some( tag => !!this.DICTIONARIES[ tag ] ) }

  /**
   * Register an async dictionary source, asked once per language tag:
   *
   *   lips.i18n.setLoader( tag => import(`./languages/${tag}.json`).then( m => m.default ) )
   *
   * Bundling every language up front costs every user all of them. With
   * a loader, `setLanguage()` switches immediately (untranslated source
   * text is a fine placeholder — it is real wording, not a blank) and
   * the strings resolve when the dictionary lands. A `fr-CA` reader asks
   * for `fr-CA` and `fr`: a source with no `fr-CA` answers `undefined`.
   */
  setLoader( fn: ( tag: string ) => Promise<Dictionary | undefined> ){
    this.loader = fn
    return this
  }

  /**
   * Ensure the dictionaries a reader of `lang` is served from are
   * registered. Resolves immediately when they are, or when no loader is
   * set — a missing dictionary is not an error, it just means
   * untranslated output. Each tag is attempted ONCE: a rejected load is
   * remembered so a missing language file does not re-fetch on every
   * switch.
   */
  load( lang: string ): Promise<void> {
    return Promise.all( lookupTags( lang ).map( tag => {
      const id = tag.toLowerCase()
      if( this.DICTIONARIES[ id ] || !this.loader ) return

      let inflight = this.loading.get( id )
      if( !inflight ){
        inflight = this.loader( tag )
          .then( dico => { dico && this.setDictionary( tag, dico ) } )
          .catch( error => console.warn(`[lips:i18n] <${tag}> dictionary failed to load —`, error ) )
        this.loading.set( id, inflight )
      }
      return inflight
    }) ).then( () => {} )
  }

  /**
   * The message `key` as a reader of `lang` reads it: from the first
   * dictionary of the lookup chain that has it, formatting in `lang`
   * itself — a `fr-CA` reader of a `fr` message still gets Canadian
   * number and date conventions. `undefined` when no dictionary has it;
   * `null` when the one that does holds a message that does not parse.
   */
  private message( key: string, lang: string ){
    const id = `${lang}\n${key}`
    if( this.formatters.has( id ) ) return this.formatters.get( id )

    let mf: MessageFormat<any, any> | null | undefined
    for( const tag of lookupTags( lang.toLowerCase() ) ){
      const dico = this.DICTIONARIES[ tag ]
      if( !dico || !Object.prototype.hasOwnProperty.call( dico, key ) ) continue

      try { mf = new this.engine!.MessageFormat( lang, dico[ key ], { functions: this.functions } ) }
      catch( error ){
        this.onError?.( error, key, lang )
        mf = null
      }
      break
    }
    mf !== undefined && this.formatters.set( id, mf )
    return mf
  }

  /**
   * Translate a source string into `lang`, defaulting to the current
   * language. A missing dictionary or a missing key is not an error: the
   * source text passes through unchanged, so a partially translated
   * dictionary degrades to the original wording rather than to a blank.
   *
   * `key` is a STABLE id (RFC-005 §3). Given one, it is what the
   * dictionary is consulted for, and `text` becomes only the fallback
   * wording — so rewording the source string keeps the translation.
   * Without it the source text IS the key (the gettext model), which is
   * fine for hand-written UI and lossy for generated UI.
   *
   * The entry is an MF2 message with nothing to fill: plain text, its
   * `{`, `}` and `\` escaped as MF2 has them.
   *
   * NB: naming the current language explicitly must behave exactly like
   * omitting it — an earlier guard returned the source text whenever
   * `lang === currentLang`, which is precisely when a translation IS wanted.
   */
  translate( text: string, lang?: string, key?: string ){
    const
    as = lang || this.currentLang,
    lookup = key || text,
    mf = this.message( lookup, as )

    if( mf ) text = mf.format( undefined, error => this.onError?.( error, lookup, as ) )
    /**
     * A key that resolves to nothing is a real authoring fault — the
     * template names an id the dictionary does not carry — whereas a
     * missing source-text entry is just an untranslated string. Only
     * the first is worth reporting.
     */
    else if( mf === undefined && key ) this.onMissing?.( key, as )

    return { text, lang: as }
  }

  /**
   * The message `reference` formatted with `params` in `lang`, defaulting
   * to the current language — what `@format="reference, { params }"`
   * renders. `undefined` when no dictionary has it, reported as missing.
   */
  format( reference: string, params: Record<string, unknown>, lang?: string ){
    const
    as = lang || this.currentLang,
    mf = this.message( reference, as )

    if( mf ) return mf.format( params, error => this.onError?.( error, reference, as ) )
    mf === undefined && this.onMissing?.( reference, as )
  }

  /** The text of a translatable name a reader of `lang` reads, defaulting to the current language. */
  pick( name: TranslatableName, lang?: string ){ return pick( name, lang || this.currentLang ) }
}
