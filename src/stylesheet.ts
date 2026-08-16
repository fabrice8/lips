/**
 * Component stylesheets — injected once per namespace and reference
 * counted so shared components clean up correctly. Native DOM only.
 *
 * Compilation lives in `ir/style.ts` and happens at COMPILE time: what
 * arrives here is final, flat, scoped, prefixed CSS (StyleIR.css). That
 * is what lets the precompiled-only `./runtime` build ship styles with
 * no CSS preprocessor at all — see RFC-004 §1.
 */

export type StyleSettings = {
  /** Final CSS — already scoped and preprocessed */
  sheet?: string
  /** Marks a globally-injected sheet (prepended, so authors can override) */
  meta?: boolean
}

export default class Stylesheet {
  private nsp: string
  private settings: StyleSettings

  constructor( nsp: string, settings?: StyleSettings ){
    if( typeof nsp !== 'string' || !nsp )
      throw new Error('Undefined or invalid stylesheet namespace')

    this.nsp = nsp
    this.settings = settings || {}

    this.settings.sheet && this.load( this.settings )
  }

  private get rel(){
    return `${this.settings.meta ? '@' : ''}${this.nsp}`
  }
  private get styleElement(){
    return document.head.querySelector<HTMLStyleElement>(`style[rel="${this.rel}"]`)
  }

  /**
   * Inject. `dindex` counts live instances sharing this namespace: it
   * increases per instance and decreases on clear, so the element is
   * removed only by the last one out.
   */
  load( settings: StyleSettings ){
    this.settings = settings
    if( !settings.sheet ) return

    const existing = this.styleElement
    if( existing ){
      // Already injected — just take a reference
      existing.setAttribute('dindex', String( Number( existing.getAttribute('dindex') || 0 ) + 1 ) )
      return existing
    }

    const element = document.createElement('style')
    element.setAttribute('rel', this.rel )
    element.setAttribute('dindex', '0')
    element.textContent = settings.sheet

    settings.meta
      ? document.head.prepend( element )
      : document.head.appendChild( element )

    return element
  }

  /** Release this instance's reference; removes the element at zero */
  clear(){
    const element = this.styleElement
    if( !element ) return

    const dindex = Number( element.getAttribute('dindex') || 0 )

    dindex <= 0
      ? element.remove()
      : element.setAttribute('dindex', String( dindex - 1 ) )
  }
}
