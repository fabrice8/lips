import type { Dictionary } from '../types'
import Formatters from './formatters'

export default class I18N {
  private currentLang = window.navigator.language
  private DICTIONARIES: Record<string, Dictionary> = {}

  set lang( value: string ){
    if( this.currentLang === value ) return
    this.currentLang = value
  }
  get lang(){
    return this.currentLang
  }

  setDictionary( id: string, dico: Dictionary ){
    this.DICTIONARIES[ id ] = dico
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
  translate( text: string, lang?: string ){
    lang = lang || this.currentLang

    /**
     * Translate displayable texts
     * 
     * - text content
     * - title attribute
     * - placeholder attribute
     */
    const [ id, variant ]: string[] = lang.split('-')
    if( this.DICTIONARIES[ id ] && text in this.DICTIONARIES[ id ] ){
      // Check by dictionary variant or currentLang option
      if( typeof this.DICTIONARIES[ id ][ text ] === 'object' ){
        const variants = this.DICTIONARIES[ id ][ text ] as Record<string, string>
        text = variants[ variant || '*' ] || variants['*']
      }
      
      // Single translation option
      else if( typeof this.DICTIONARIES[ id ][ text ] === 'string' )
        text = this.DICTIONARIES[ id ][ text ] as string
    }
    
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
