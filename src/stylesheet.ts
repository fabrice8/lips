import $, { type Cash } from 'cash-dom'
import { compile, serialize, stringify, middleware } from 'stylis'

type StyleSettings = {
  sheet?: string
  meta?: boolean
  custom?: {
    enabled: boolean
    allowedRules: string[]
    allowedProperties: string[]
  }
}

export default class Stylesheet {
  private nsp: string
  private settings: StyleSettings
  private $head: Cash

  constructor( nsp: string, settings?: StyleSettings ){
    if( typeof nsp !== 'string' ) 
      throw new Error('Undefined or invalid styles attachement element(s) namespace')
    
    /**
     * Unique namespace identifier of targeted 
     * views/elements
     */
    this.nsp = nsp

    /**
     * Head element of the DOM in where stylesheet
     * will be injected.
     */
    this.$head = $('head')

    /**
     * Styles settings
     * 
     * - sheet
     * - custom
     */
    this.settings = settings || {}

    // Auto-load defined sheet rules
    this.settings && this.load( this.settings )
  }

  /**
   * Process sheet string using Stylis
   */
  compile( str: string ): string {
    try { return serialize( compile( str ), middleware([ stringify ]) ) } 
    catch( error: any ){
      throw new Error(`Style compilation failed: ${error.message}`)
    }
  }

  /**
   * Wait for styles to be applied
   */
  private waitForStyles( selector: string ): Promise<void>{
    return new Promise( resolve => {
      const observer = new MutationObserver( () => {
        const element = document.querySelector( selector )
        if( element && getComputedStyle( element ).cssText ){
          observer.disconnect()
          resolve()
        }
      } )

      observer.observe( document.documentElement, {
        attributes: true,
        childList: true,
        subtree: true
      } )
    } )
  }

  /**
   * Compile and inject a style chunk in the DOM
   * using `<style mv-style="*">...</style>` tag
   */
  private async inject( str: string ): Promise<HTMLStyleElement>{
    if( !str )
      throw new Error('Invalid injection arguments')

    const selector = `rel="${this.settings.meta ? '@' : ''}${this.nsp}"`

    /**
     * Defined meta sheet properties or sheet by view 
     * elements by wrapping in a closure using the 
     * namespaces selector.
     */
    str = this.settings.meta ? str : `[rel="${this.nsp}"] { ${str} }`

    try {
      const sheet = this.compile( str )
      if( !sheet )
        throw new Error(`<component:${this.nsp}> sheet compilation failed`)

      // Create new style element
      const styleSheet = document.createElement('style')
      styleSheet.setAttribute('rel', `${this.settings.meta ? '@' : ''}${this.nsp}` )
      styleSheet.textContent = sheet

      /**
       * `dindex` is a deletion index to keep track of
       * the share dependency of this style element by
       * all components bind to it.
       * 
       * Every component `on-destroy` automatically
       * cleanup it's stylesheet but on if it's rendered
       * only once. In case of multiple renderings, the
       * index indicate the number of current rendering instances
       * of the component.
       * 
       * - on instance created, `dindex` value increases
       * - on instance destroyed, `dindex` value decreases
       * - on instance destroyed, when `dindex` value == 0, 
       *   the style element is removed
       */
      let dindex = 0

      /**
       * Check for Existing Shared Style
       */
      const $ESS = this.$head.find(`style[${selector}]`)
      if( $ESS.length ){
        dindex = parseInt( $ESS.attr('dindex') as string ) + 1
        $ESS.remove()
      }

      /**
       * Assign deletion index
       */
      styleSheet.setAttribute('dindex', String( dindex ) )

      // Insert new style element
      this.settings.meta
              ? document.head.prepend( styleSheet )
              : document.head.appendChild( styleSheet )

      return styleSheet
    }
    catch( error: any ){
      throw new Error(`Style injection failed: ${error.message}`)
    }
  }

  /**
   * Load/inject predefined sheet to the document
   */
  async load( settings: StyleSettings ){
    this.settings = settings
    if( typeof this.settings !== 'object' )
      throw new Error('Undefined styles settings')
    
    if( this.settings.sheet ){
      const styleElement = await this.inject( this.settings.sheet )
      await this.waitForStyles(`style[rel="${this.settings.meta ? '@' : ''}${this.nsp}"]`)
    }
  }

  /**
   * Retreive this view's main node styles including natively 
   * defined ones.
   */
  get(){
    
  }

  /**
   * Remove all injected styles from the DOM
   */
  async clear(){
    const $ESS = this.$head.find(`style[rel="${this.settings.meta ? '@' : ''}${this.nsp}"]`)
    if( !$ESS.length ) return
    
    /**
     * Procedure to clear an Existing Shared Style
     * 
     * @note refere to the comment in `inject()` to
     *        know more.
     */
    const dindex = parseInt( $ESS.attr('dindex') as string )
    dindex === 0 ?
          // Last instance dependency: Remove the style from DOM
          $ESS.remove()
          // Keep the style for active instance dependencies
          : $ESS.attr('dindex', String( dindex - 1 ) )
  }

  /**
   * Return css custom properties
   */
  async custom(): Promise<Record<string, string>>{
    return {}
  }

  /**
   * Overridable function to return an element 
   * style attribute value as JSON object.
   */
  async style(): Promise<Record<string, string>>{
    return {}
  }
}