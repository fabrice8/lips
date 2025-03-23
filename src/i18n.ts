import type { LanguageDictionary } from '.'

export default class I18N {
  private default = window.navigator.language
  private LANGUAGE_DICTIONARIES: Record<string, LanguageDictionary> = {}

  set lang( value: string ){
    if( this.default === value ) return
    this.default = value
  }
  get lang(){
    return this.default
  }

  setDictionary( id: string, dico: LanguageDictionary ){
    this.LANGUAGE_DICTIONARIES[ id ] = dico
  }

  /**
   * 
   */
  translate( text: string, lang?: string ){
    // No translation required
    if( lang && this.default === lang )
      return { text, lang: this.default }

    lang = lang || this.default

    /**
     * Translate displayable texts
     * 
     * - text content
     * - title attribute
     * - placeholder attribute
     */
    const [ id, variant ]: string[] = lang.split('-')
    if( this.LANGUAGE_DICTIONARIES[ id ] && text in this.LANGUAGE_DICTIONARIES[ id ] ){
      // Check by language variant or default option
      if( typeof this.LANGUAGE_DICTIONARIES[ id ][ text ] === 'object' ){
        const variants = this.LANGUAGE_DICTIONARIES[ id ][ text ] as Record<string, string>
        text = variants[ variant || '*' ] || variants['*']
      }
      
      // Single translation option
      else if( typeof this.LANGUAGE_DICTIONARIES[ id ][ text ] === 'string' )
        text = this.LANGUAGE_DICTIONARIES[ id ][ text ] as string
    }
    
    return { text, lang }
  }

  format( key: string, params: Record<string, any>, lang?: string ){
    const { text } = this.translate( key, lang )
      
    // Replace parameters
    return text.replace(/{(\w+)}/g, ( _, name ) => params[ name ] || '')
  }
}
