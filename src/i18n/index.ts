import type { Dictionary } from '../types'
import Formatters from './formatters'

/**
 * Last-resort language. Only reached when the host has no
 * `navigator` (SSR, a worker, a test runner) and the caller named
 * no language either.
 */
const DEFAULT_LANG = 'en-US'

export default class I18N {
  private currentLang: string
  private DICTIONARIES: Record<string, Dictionary> = {}

  /**
   * Reports a stable key that no dictionary entry answers. Left unset
   * translation stays silent; the facade wires it to a console warning
   * under `debug`, and a generator can wire it to collect the gaps.
   */
  public onMissing?: ( key: string, lang: string ) => void

  /**
   * Fires whenever the dictionary set changes. The facade bumps a
   * revision signal from here, which is what makes a dictionary that
   * arrives LATE — an async load resolving after the language already
   * switched — re-translate what is already on screen.
   */
  public onChange?: () => void

  /** Async dictionary source, set by `setLoader` */
  private loader?: ( id: string ) => Promise<Dictionary | undefined>
  /** In-flight and settled loads, keyed by language root */
  private loading = new Map<string, Promise<void>>()

  /**
   * `lang` is the initial language, normally `LipsConfig.lang`. Left
   * out, it is read from the browser — which is the right default for
   * an app that should follow the user's locale, but is not something
   * a server render or a test can rely on being there.
   */
  constructor( lang?: string ){
    this.currentLang = lang
                      || ( typeof navigator !== 'undefined' && navigator.language )
                      || DEFAULT_LANG
  }

  set lang( value: string ){
    if( this.currentLang === value ) return
    this.currentLang = value
  }
  get lang(){
    return this.currentLang
  }

  setDictionary( id: string, dico: Dictionary ){
    this.DICTIONARIES[ id ] = dico
    this.onChange?.()
  }
  /** Has a dictionary for this language root been registered? */
  has( lang: string ){ return !!this.DICTIONARIES[ lang.split('-')[0] ] }

  /**
   * Register an async dictionary source — one language root per call,
   * resolved on demand:
   *
   *   lips.i18n.setLoader( id => import(`./languages/${id}.json`).then( m => m.default ) )
   *
   * Bundling every language up front costs every user all of them. With
   * a loader, `setLanguage()` switches immediately (untranslated source
   * text is a fine placeholder — it is real wording, not a blank) and
   * the strings resolve when the dictionary lands.
   */
  setLoader( fn: ( id: string ) => Promise<Dictionary | undefined> ){
    this.loader = fn
    return this
  }

  /**
   * Ensure the dictionary for `lang` is registered. Resolves
   * immediately when it already is, or when no loader is set — a
   * missing dictionary is not an error, it just means untranslated
   * output. Each root is attempted ONCE: a rejected load is remembered
   * so a missing language file does not re-fetch on every switch.
   */
  load( lang: string ): Promise<void> {
    const id = lang.split('-')[0]
    if( this.DICTIONARIES[ id ] || !this.loader ) return Promise.resolve()

    let inflight = this.loading.get( id )
    if( !inflight ){
      inflight = this.loader( id )
        .then( dico => { dico && this.setDictionary( id, dico ) } )
        .catch( error => console.warn(`[lips:i18n] <${id}> dictionary failed to load —`, error ) )
      this.loading.set( id, inflight )
    }
    return inflight
  }

  /**
   * Translate a source string into `lang`, defaulting to the current
   * language.
   *
   * Dictionaries are keyed by the language ROOT — `fr-CA` and `fr-FR`
   * both read `DICTIONARIES.fr` — and the region half selects a variant
   * when the entry is an object:
   *
   *   'Device Screens': { '*': 'Device Screens', UK: 'Media Devices' }
   *
   * A missing dictionary or a missing key is not an error: the source
   * text passes through unchanged, so a partially translated dictionary
   * degrades to the original wording rather than to a blank.
   *
   * NB: naming the current language explicitly must behave exactly like
   * omitting it. An earlier guard returned the source text whenever
   * `lang === currentLang`, which is precisely when a translation IS
   * wanted — and it made region variants unreachable through the
   * two-argument form.
   */
  /**
   * Translate a source string into `lang`, defaulting to the current
   * language.
   *
   * Dictionaries are keyed by the language ROOT — `fr-CA` and `fr-FR`
   * both read `DICTIONARIES.fr` — and the region half selects a variant
   * when the entry is an object:
   *
   *   'Device Screens': { '*': 'Device Screens', UK: 'Media Devices' }
   *
   * A missing dictionary or a missing key is not an error: the source
   * text passes through unchanged, so a partially translated dictionary
   * degrades to the original wording rather than to a blank.
   *
   * `key` is a STABLE id (RFC-005 §3). Given one, it is what the
   * dictionary is consulted for, and `text` becomes only the fallback
   * wording — so rewording the source string keeps the translation.
   * Without it the source text IS the key (the gettext model), which is
   * fine for hand-written UI and lossy for generated UI.
   *
   * NB: naming the current language explicitly must behave exactly like
   * omitting it. An earlier guard returned the source text whenever
   * `lang === currentLang`, which is precisely when a translation IS
   * wanted — and it made region variants unreachable through the
   * two-argument form.
   */
  translate( text: string, lang?: string, key?: string ){
    lang = lang || this.currentLang

    /**
     * Translate displayable texts
     * 
     * - text content
     * - title attribute
     * - placeholder attribute
     */
    const
    [ id, variant ]: string[] = lang.split('-'),
    lookup = key || text,
    dico = this.DICTIONARIES[ id ]

    if( dico && lookup in dico ){
      const entry = dico[ lookup ]

      // Check by dictionary variant or currentLang option
      if( typeof entry === 'object' && entry !== null ){
        const variants = entry as Record<string, string>
        text = variants[ variant || '*' ] || variants['*']
      }
      
      // Single translation option
      else if( typeof entry === 'string' )
        text = entry
    }
    /**
     * A key that resolves to nothing is a real authoring fault — the
     * template names an id the dictionary does not carry — whereas a
     * missing source-text entry is just an untranslated string. Only
     * the first is worth reporting.
     */
    else if( key ) this.onMissing?.( key, lang )
    
    return { text, lang }
  }

  /**
   * 
   */
  format( reference: string, params: Record<string, any>, local?: string ){
    /**
     * Format `local` defined as language or country
     * 
     * Eg.
     * - `en-UK`, `de-GR`
     * - `TG`, `US`
     */
    local = local || this.currentLang

    const [ id, variant ]: string[] = local.split('-')
    if( !this.DICTIONARIES[ id ] ){
      console.warn(`Undefined <${local}> format dictionary`)
      return
    }
    
    // In case no-format reference is found
    if( !this.DICTIONARIES[ id ][ reference ] ){
      console.warn(`Undefined <${local}[${reference}]> format reference`)
      return
    }
    
    const format = this.DICTIONARIES[ id ][ reference ]
    if( typeof format === 'string' ){
      console.warn(`Invalid <${local}[${reference}]> format reference. Expected object`)
      return
    }
    
    if( typeof format !== 'object' 
        || format === null
        || Array.isArray( format ) ){
      console.warn(`Invalid <${local}[${reference}]> format value`)
      return
    }

    return Formatters( format.type, reference, format.value, params, variant )
  }
}
