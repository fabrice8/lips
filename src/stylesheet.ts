/**
 * Component stylesheets — scoped by a `rel` attribute selector,
 * injected once per namespace and reference counted so shared
 * components clean up correctly. Native DOM only (no cash-dom).
 *
 * The CSS preprocessor (Stylis) is INJECTED, not imported, so the
 * precompiled-only `./runtime` build tree-shakes it out entirely.
 * The full `@lipsjs/lips` entry wires it (see src/lips.ts); a build
 * without it warns and skips source stylesheets rather than shipping
 * a preprocessor a precompiled/CSP app never needs.
 */

export type StyleSettings = {
  sheet?: string
  /** Inject globally instead of scoping to `[rel="<nsp>"]` */
  meta?: boolean
}

type StyleCompiler = ( css: string ) => string
let STYLE_COMPILER: StyleCompiler | null = null

/** Wire the CSS preprocessor (full build only) */
export function setStyleCompiler( fn: StyleCompiler ){ STYLE_COMPILER = fn }

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
   * Compile and inject. `dindex` counts live instances sharing this
   * namespace: it increases per instance and decreases on clear, so
   * the element is removed only by the last one out.
   */
  load( settings: StyleSettings ){
    this.settings = settings
    if( !settings.sheet ) return

    if( !STYLE_COMPILER ){
      console.warn(
        `[lips] <${this.nsp}> stylesheet skipped — this build has no CSS preprocessor. `
        + 'Use "@lipsjs/lips" (not "@lipsjs/lips/runtime") for source stylesheets.' )
      return
    }

    const existing = this.styleElement
    if( existing ){
      // Already injected — just take a reference
      existing.setAttribute('dindex', String( Number( existing.getAttribute('dindex') || 0 ) + 1 ) )
      return existing
    }

    const source = settings.meta ? settings.sheet : `[rel="${this.nsp}"] { ${settings.sheet} }`
    let sheet: string
    try { sheet = STYLE_COMPILER( source ) }
    catch( error: any ){ throw new Error(`Style compilation failed: ${error.message}`) }

    if( !sheet )
      throw new Error(`<${this.nsp}> stylesheet compilation produced no output`)

    const element = document.createElement('style')
    element.setAttribute('rel', this.rel )
    element.setAttribute('dindex', '0')
    element.textContent = sheet

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
