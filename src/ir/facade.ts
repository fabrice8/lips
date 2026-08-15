/**
 * Phase 2 — engine facade (RFC-001 §9)
 *
 * The old public Lips API backed by the IR engine, activated via
 * `new Lips({ engine: 'ir' })`. Templates are the same plain
 * objects ({ default, state, handler, _static, stylesheet, … });
 * behind the API: parse → IR → renderIR with deep-reactive state.
 *
 * Parity gaps this facade does not yet cover (tracked in ROADMAP):
 * router, i18n, macros, component contents/slots + events,
 * declaration-driven syntax components.
 */

import type { TemplateIR, CompileResult, CompileOptions } from './compiler'

/**
 * The template compiler is INJECTED, not imported, so a
 * precompiled-only build can tree-shake the parser and compiler out
 * entirely (see src/runtime.ts vs src/lips.ts).
 */
type CompilerFn = ( src: string, options?: CompileOptions ) => CompileResult
let COMPILER: CompilerFn | null = null

export function setCompiler( fn: CompilerFn ){ COMPILER = fn }

/**
 * The style compiler is INJECTED for the same reason the template one is:
 * a static import would pull the CSS scanner (and Stylis behind it) into
 * the `./runtime` bundle, which exists precisely to ship neither.
 */
type StyleCompilerFn = ( src: string, options: StyleCompileOptions ) => StyleCompileResult
let STYLE_COMPILER: StyleCompilerFn | null = null
export function setStyleCompiler( fn: StyleCompilerFn ){ STYLE_COMPILER = fn }

/**
 * Built-in components (e.g. `<router>`) are INJECTED by the full
 * entry rather than imported here, so the precompiled-only
 * `./runtime` build — which can't compile their source templates
 * anyway — tree-shakes them out.
 */
const BUILTINS: Record<string, any> = {}
export function registerBuiltin( name: string, template: any ){ BUILTINS[ name ] = template }

import type { IRComponentDef, IRInstance, RuntimeOptions } from './runtime'
import { renderIR } from './runtime'
import { reactive, effect, signal } from './signal'
import Events from '../events'
import Stylesheet from '../stylesheet'
import type { StyleIR, StyleCompileResult, StyleCompileOptions } from './style'
import I18N from '../i18n'

interface FacadeTemplate {
  default?: string
  /** Precompiled IR — skips parsing entirely (see src/precompile.ts) */
  ir?: TemplateIR
  macros?: string
  state?: Record<string, any>
  handler?: Record<string, ( this: any, ...args: any[] ) => any>
  _static?: Record<string, any>
  context?: string[]
  stylesheet?: string
  /** Precompiled StyleIR — skips CSS compilation entirely (RFC-004) */
  style?: StyleIR
}

interface FacadeConfig {
  engine?: string
  debug?: boolean
  context?: Record<string, any>
  mode?: 'compiled' | 'interpreted'
  /**
   * Emit component sheets inside `@layer <name>` (RFC-004 §9). Absent by
   * default, and absent output is byte-identical to no layer at all —
   * only Tailwind-style utility users need this.
   */
  styleLayer?: string
}

/**
 * Names template handlers must not override on the component
 * self — mirrors the old engine's reserved-member guard.
 */
const RESERVED_MEMBERS = new Set([
  'state', 'input', 'static', 'context', 'emit', 'on', 'once', 'off',
  'node', 'destroy', 'appendTo', 'prependTo', 'replaceWith', 'render', 'swap'
])

function guardHandlers( handler?: FacadeTemplate['handler'] ){
  if( !handler ) return undefined

  for( const name of Object.keys( handler ) )
    if( RESERVED_MEMBERS.has( name ) )
      throw new Error(`Handler <${name}> is a reserved component member name`)

  return handler
}

// --------------------------------------------------------------- component
export class IRFacadeComponent extends Events {
  readonly state: Record<string, any>
  private instance: IRInstance
  private contextWatcher?: () => void
  private destroyed = false

  constructor(
    private lips: IRLips,
    name: string,
    private template: FacadeTemplate,
    input: Record<string, any> | undefined,
    ir: TemplateIR,
    options: RuntimeOptions
  ){
    super()
    const handlers = guardHandlers( template.handler )

    this.state = reactive( { ...( template.state || {} ) }, true )
    const inputR = input ? reactive( { ...input }, true ) : undefined

    /**
     * The runtime owns the whole lifecycle (create → input →
     * render → mount → attach → destroy) for root and nested
     * components alike — the facade only supplies wiring.
     */
    const emitExternal = ( event: string, ...args: any[] ) => this.emit( event, ...args )

    this.instance = renderIR( ir, {
      state: this.state,
      input: inputR,
      context: lips.getContext(),
      static: template._static,
      handlers,
      deep: true,
      // Compiled stylesheet — the runtime stamps `rel`, injects, and binds
      stylesheet: lips.styleFor( name, template ),
      nsp: name,
      expose: {
        /**
         * Component emissions reach BOTH buses: the facade's Events
         * (external `component.on(…)`) and the runtime's own bus
         * (`self.on(…)` inside handlers/controls). `emitLocal` is
         * installed by the runtime before expose is merged.
         */
        emit( this: any, event: string, ...args: any[] ){
          this.emitLocal?.( event, ...args )
          emitExternal( event, ...args )
        },
        context: lips.getContext()
      }
    }, options )

    /**
     * Context subscription: components declaring `context: [...]`
     * get onContext whenever a declared field changes.
     */
    if( template.context?.length && typeof handlers?.onContext === 'function' )
      this.contextWatcher = lips.watchContext( template.context, () => {
        try { handlers.onContext!.call( this.instance.self ) }
        catch( error ){ console.error('[lips:ir]', error ) }
      })

    this.emit('component:mount')
  }

  get node(){ return this.instance.nodes }

  appendTo( selector: string | Element ){
    const target = typeof selector === 'string' ? document.querySelector( selector ) : selector
    target && this.instance.mount( target as Element )
    return this
  }

  swap( newIR: TemplateIR ){ return this.instance.swap( newIR ) }

  destroy(){
    if( this.destroyed ) return
    this.destroyed = true

    this.contextWatcher?.()
    // dispose() runs onDetach/onDestroy and clears the scoped stylesheet
    this.instance.dispose()
    this.emit('component:destroy')
  }
}

// -------------------------------------------------------------------- lips
export class IRLips {
  public debug: boolean
  private store = new Map<string, FacadeTemplate>()
  private irCache = new WeakMap<FacadeTemplate, TemplateIR>()
  private defCache = new WeakMap<FacadeTemplate, IRComponentDef>()
  private styleCache = new WeakMap<FacadeTemplate, StyleIR>()
  private context: Record<string, any>
  private __root?: IRFacadeComponent

  public i18n = new I18N()
  /** Language signal — translated binds subscribe through it */
  private getLang: () => string
  private setLang: ( v: string ) => void

  /**
   * Registered components resolved lazily — the runtime looks
   * names up per render, so registration order doesn't matter.
   */
  private componentsProxy: Record<string, IRComponentDef>

  constructor( private config?: FacadeConfig ){
    this.debug = !!config?.debug
    this.context = reactive( { ...( config?.context || {} ) }, true )

    const [ getLang, setLang ] = signal( this.i18n.lang )
    this.getLang = getLang
    this.setLang = setLang

    // Built-in components (their templates are source — need the compiler)
    COMPILER && Object.entries( BUILTINS ).forEach( ( [ name, template ] ) => this.register( name, template ) )

    const self = this
    this.componentsProxy = new Proxy( {} as Record<string, IRComponentDef>, {
      get( _, name: string ){
        const template = self.store.get( name )
        return template ? self.defFor( name, template ) : undefined
      },
      has( _, name: string ){ return self.store.has( name as string ) }
    })
  }

  // ---- registry
  register( name: string, template: FacadeTemplate ){
    this.store.set( name, template )
    return this
  }
  unregister( name: string ){
    this.store.delete( name )
    return this
  }
  has( name: string ){ return this.store.has( name ) }

  private compile( template: FacadeTemplate ): TemplateIR {
    // Precompiled: nothing to parse
    if( template.ir ) return template.ir

    let ir = this.irCache.get( template )
    if( !ir ){
      if( !COMPILER )
        throw new Error(
          'This build has no template compiler — templates must be precompiled to `ir` '
          + '(import from "@lipsjs/lips" instead of "@lipsjs/lips/runtime")' )

      const result = COMPILER( template.default || '', { macros: template.macros })
      result.diagnostics.length
        && console.warn('[lips:ir] template diagnostics —', result.diagnostics )

      ir = result.ir
      this.irCache.set( template, ir )
    }
    return ir
  }
  /**
   * Compile `stylesheet` source to StyleIR, or take a precompiled `style`
   * as-is. Cached per template object like the template IR — the sheet is
   * per component type, so this runs once no matter how many instances.
   */
  styleFor( name: string, template: FacadeTemplate ): StyleIR | undefined {
    if( template.style ) return template.style
    if( !template.stylesheet ) return

    if( !STYLE_COMPILER ){
      console.warn(
        `[lips:ir] <${name}> stylesheet skipped — this build has no style compiler. `
        + 'Precompile it to StyleIR, or import "@lipsjs/lips" instead of "@lipsjs/lips/runtime".' )
      return
    }

    let style = this.styleCache.get( template )
    if( !style ){
      const result = STYLE_COMPILER( template.stylesheet, { nsp: name, layer: this.config?.styleLayer })
      result.diagnostics.length
        && console.warn('[lips:ir] style diagnostics —', result.diagnostics )

      style = result.ir
      this.styleCache.set( template, style )
    }
    return style
  }

  private defFor( name: string, template: FacadeTemplate ): IRComponentDef {
    let def = this.defCache.get( template )
    if( !def ){
      def = {
        ir: this.compile( template ),
        state: template.state,
        statics: template._static,
        context: template.context,
        stylesheet: this.styleFor( name, template ),
        nsp: name,
        handlers: guardHandlers( template.handler ),
        deep: true
      }
      this.defCache.set( template, def )
    }
    return def
  }

  // ---- rendering
  render( name: string, template: FacadeTemplate, input?: Record<string, any> ){
    return new IRFacadeComponent( this, name, template, input, this.compile( template ), {
      mode: this.config?.mode,
      components: this.componentsProxy,
      watchContext: ( fields, fn ) => this.watchContext( fields, fn ),
      /**
       * Route pages (and any `<{templateObject}/>`) are plain
       * template objects — compile + cache them on demand.
       */
      resolveTemplate: ( value: any ) =>
        value && ( typeof value.default === 'string' || value.ir )
          ? this.defFor( value.name || 'dynamic', value as FacadeTemplate )
          : undefined,
      expose: {
        setContext: ( arg: any, value?: any ) => this.setContext( arg, value )
      },
      /**
       * Scoped-stylesheet factory. Undefined in a build without a CSS
       * preprocessor (`./runtime`), so the runtime skips injection.
       */
      createStylesheet: ( nsp: string, css: string ) => {
        const sheet = new Stylesheet( nsp, { sheet: css })
        return { clear: () => sheet.clear() }
      },
      i18n: {
        /**
         * Reading the language signal inside the bind effect is
         * what makes setLanguage() re-translate every marked node.
         */
        translate: ( text: string ) => {
          this.getLang() // track — passing the lang would short-circuit translate()
          return this.i18n.translate( text ).text
        },
        format: ( reference: string, params: any ) => {
          this.getLang()
          return this.i18n.format( reference, params ) ?? ''
        }
      }
    })
  }
  root( template: FacadeTemplate, selector: string ){
    this.__root = this.render( '__ROOT__', template )
    this.__root.appendTo( selector )
    return this.__root
  }

  // ---- i18n
  setLanguage( lang: string ){
    this.i18n.lang = lang
    this.setLang( lang )
  }
  getLanguage(){ return this.getLang() }
  useTranslator( support: string | string[], fn: ( lang: string ) => void ){
    let first = true
    const { dispose } = effect( () => {
      const lang = this.getLang()
      if( first ){ first = false; return }
      ;( support === '*' || ( Array.isArray( support ) && support.includes( lang ) ) ) && fn( lang )
    })
    return dispose
  }

  // ---- context
  getContext(){ return this.context }
  setContext( arg: string | Record<string, any>, value?: any ){
    typeof arg === 'string'
      ? this.context[ arg ] = value
      : Object.entries( arg ).forEach( ( [ k, v ] ) => this.context[ k ] = v )
  }
  /**
   * Subscribe to a subset of context fields — the effect tracks
   * exactly those keys, so unrelated context writes don't fire it.
   * Returns an unsubscribe function.
   */
  watchContext( fields: string[], fn: () => void ){
    let first = true
    const { dispose } = effect( () => {
      fields.forEach( f => this.context[ f ] ) // track
      first ? first = false : fn()
    })
    return dispose
  }
  useContext( fields: string[], fn: ( ctx: Record<string, any> ) => void ){
    return this.watchContext( fields, () =>
      fn( Object.fromEntries( fields.map( f => [ f, this.context[ f ] ] ) ) ) )
  }

  dispose(){
    this.__root?.destroy()
  }
}
