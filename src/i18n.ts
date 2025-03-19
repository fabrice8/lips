import $, { type Cash } from 'cash-dom'
import type { LanguageDictionary } from '.'

export default class I18N {
  private default = window.navigator.language
  private LANGUAGE_DICTIONARIES: Record<string, LanguageDictionary> = {}

  setLang( lang: string ): boolean {
    if( this.default !== lang ){
      this.default = lang
      return true
    }

    return false
  }

  setDictionary( id: string, dico: LanguageDictionary ){
    this.LANGUAGE_DICTIONARIES[ id ] = dico
  }

  /**
   * 
   */
  translate( text: string, lang?: string ){
    // No translation required
    if( lang && this.default == lang )
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

  propagate( $node: Cash ){
    const self = this
    function apply( this: HTMLElement ){
      const
      $this = $(this),
      _content = $this.html(),
      _title = $this.attr('title'),
      _placeholder = $this.attr('placeholder')

      let _lang

      if( !/<\//.test( _content ) && $this.text() ){
        const { text, lang } = self.translate( $this.text() )

        $this.text( text )
        _lang = lang
      }
      if( _title ){
        const { text, lang } = self.translate( _title )

        $this.attr('title', text )
        _lang = lang
      }
      if( _placeholder ){
        const { text, lang } = self.translate( _placeholder )
        
        $this.attr('placeholder', text )
        _lang = lang
      }

      _lang && $this.attr('lang', _lang )
    }

    $node.children().each( apply )

    return $node
  }
}
