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
import type { Template, Metavars, LipsConfig, Handler } from '../types'
import I18N from '../i18n'

/**
 * The authoring shape IS the public `Template<MT>` — one type, not a
 * parallel internal one. `FacadeTemplate` remains as the erased form
 * used where the metavars are not known (caches, dynamic resolution).
 */
type FacadeTemplate = Template<any>
type FacadeConfig<Context extends Object = Record<string, any>> =
  LipsConfig<Context> & { mode?: 'compiled' | 'interpreted' }

/**
 * Names template handlers must not override on the component
 * self — mirrors the old engine's reserved-member guard.
 */
const RESERVED_MEMBERS = new Set([
  'state', 'input', 'static', 'context', 'emit', 'on', 'once', 'off',
  'node', 'lang', 'setContext', 'setLanguage',
  'destroy', 'appendTo', 'prependTo', 'replaceWith', 'render', 'swap'
])

function guardHandlers( handler?: Handler<any> ){
  if( !handler ) return undefined

  for( const name of Object.keys( handler ) )
    if( RESERVED_MEMBERS.has( name ) )
      throw new Error(`Handler <${name}> is a reserved component member name`)

  return handler as Record<string, ( this: any, ...args: any[] ) => any>
}

// --------------------------------------------------------------- component
export class IRFacadeComponent<MT extends Metavars = Metavars> extends Events {
  readonly state: MT['State']
  private instance: IRInstance
  private contextWatcher?: () => void
  private destroyed = false

  constructor(
    private lips: IRLips<any>,
    name: string,
    private template: Template<MT>,
    input: MT['Input'] | undefined,
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
    /**
     * The OUTWARD half only. Deliberately `super.emit`, not `this.emit`:
     * `this.emit` now also drives the inward half, so routing through it
     * would deliver every internal emission to the local bus twice.
     */
    const emitExternal = ( event: string, ...args: any[] ) => super.emit( event, ...args )

    this.instance = renderIR( ir, {
      state: this.state,
      input: inputR,
      context: lips.getContext(),
      static: template.static ?? template._static,
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
    const watched = template.watchContext ?? template.context
    if( watched?.length && typeof handlers?.onContext === 'function' )
      this.contextWatcher = lips.watchContext( watched, () => {
        try { handlers.onContext!.call( this.instance.self ) }
        catch( error ){ console.error('[lips:ir]', error ) }
      })

    this.emit('component:mount')
  }

  /**
   * The component bus is bidirectional.
   *
   * Outward has always worked: a handler's `this.emit('save')` reaches
   * `component.on('save')`. Inward is this override — `component.emit(
   * 'reset')` also reaches `this.on('reset')` registered inside the
   * component, so a holder of the handle can send a command without
   * mutating state or reaching into internals.
   *
   * Argument handling matches what an internal emit already does:
   * inward is raw (the caller owns the data), outward is deep-cleaned by
   * `Events` so reactive proxies never escape the component.
   */
  emit( event: string, ...args: any[] ){
    // instance is unset only while renderIR is still running (e.g. onCreate)
    this.instance?.self?.emitLocal?.( event, ...args )
    return super.emit( event, ...args )
  }

  /**
   * Live root ELEMENTS — matching `this.node` inside a handler. The
   * instance's node list also carries the block's range markers, which
   * are an internal detail no consumer should have to filter out.
   */
  get node(): Element[] {
    return this.instance.nodes.filter( n => n.nodeType === 1 ) as Element[]
  }

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
export class IRLips<Context extends Object = Record<string, any>> {
  public debug: boolean
  private store = new Map<string, FacadeTemplate>()
  private irCache = new WeakMap<FacadeTemplate, TemplateIR>()
  private defCache = new WeakMap<FacadeTemplate, IRComponentDef>()
  private styleCache = new WeakMap<FacadeTemplate, StyleIR>()
  private context: Context
  private __root?: IRFacadeComponent<any>

  public i18n: I18N
  /** Language signal — translated binds subscribe through it */
  private getLang: () => string
  private setLang: ( v: string ) => void
  /** Dictionary revision — bumped whenever a dictionary is registered */
  private getRev!: () => number

  /**
   * Registered components resolved lazily — the runtime looks
   * names up per render, so registration order doesn't matter.
   */
  private componentsProxy: Record<string, IRComponentDef>

  constructor( private config?: FacadeConfig<Context> ){
    this.debug = !!config?.debug
    this.context = reactive( { ...( config?.context || {} ) }, true ) as Context

    this.i18n = new I18N( config?.lang )
    this.debug && ( this.i18n.onMissing = ( key, lang ) =>
      console.warn(`[lips:i18n] no <${lang}> entry for key "${key}"`) )

    const [ getLang, setLang ] = signal( this.i18n.lang )
    this.getLang = getLang
    this.setLang = setLang

    /**
     * Dictionary revision. Translated binds track it alongside the
     * language, so a dictionary registered AFTER render — a lazy load
     * resolving, or a plain `setDictionary` call at runtime — re-runs
     * them. Without it the language signal alone would not fire: the
     * language never changed, only what it resolves to.
     */
    const [ getRev, setRev ] = signal( 0 )
    this.getRev = getRev
    this.i18n.onChange = () => setRev( getRev() + 1 )

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
  register<MT extends Metavars = Metavars>( name: string, template: Template<MT> ){
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
      const result = STYLE_COMPILER( template.stylesheet, {
        nsp: name,
        layer: this.config?.styleLayer,
        preprocess: this.config?.stylePreprocessor
      })
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
        statics: template.static ?? template._static,
        context: template.watchContext ?? template.context,
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
  render<MT extends Metavars = Metavars>( name: string, template: Template<MT>, input?: MT['Input'] ){
    return new IRFacadeComponent( this, name, template, input, this.compile( template ), {
      mode: this.config?.mode,
      components: this.componentsProxy,
      /**
       * Route pages (and any `<{templateObject}/>`) are plain
       * template objects — compile + cache them on demand.
       */
      resolveTemplate: ( value: any ) =>
        value && ( typeof value.default === 'string' || value.ir )
          ? this.defFor( value.name || 'dynamic', value as FacadeTemplate )
          : undefined,
      expose: {
        setContext: ( arg: any, value?: any ) => this.setContext( arg, value ),
        /**
         * `self.setLanguage('fr-FR')` — a switcher is UI, so it needs to
         * be reachable from a template's `on-click`, not just from the
         * Lips instance.
         */
        setLanguage: ( lang: string ) => this.setLanguage( lang )
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
         * The language signal is read INSIDE the bind effect and handed
         * to i18n as the language to use. That read is what re-runs every
         * translated bind on setLanguage(), and passing the value on —
         * rather than letting i18n fall back to its own `currentLang` —
         * keeps what is rendered equal to what was tracked.
         *
         * `scoped` is the `<i18n lang=…>` override for this subtree. It
         * still tracks the global signal first: a scoped subtree whose
         * expression reads nothing else must not go stale, and tracking
         * one extra signal only costs a re-run that recomputes the same
         * string.
         */
        translate: ( text: string, key?: string, scoped?: string ) => {
          const global = this.getLang() // track unconditionally — see above
          this.getRev()                 // …and re-run when a dictionary lands
          return this.i18n.translate( text, scoped || global, key ).text
        },
        format: ( reference: string, params: any, scoped?: string ) => {
          const global = this.getLang()
          this.getRev()
          return this.i18n.format( reference, params, scoped || global ) ?? ''
        },
        lang: () => this.getLang()
      }
    })
  }
  root<MT extends Metavars = Metavars>( template: Template<MT>, selector: string ){
    this.__root = this.render<MT>( '__ROOT__', template )
    this.__root.appendTo( selector )
    return this.__root
  }

  // ---- i18n
  /**
   * The only way to change language. Writing `lips.i18n.lang` directly
   * updates the dictionary lookup but not the signal, so nothing already
   * rendered re-translates.
   */
  setLanguage( lang: string ){
    this.i18n.lang = lang
    this.setLang( lang )
    /**
     * Switch first, resolve second. The UI changes language immediately
     * — showing source wording, which is real text rather than a blank —
     * and the loaded dictionary bumps the revision to re-translate. A
     * language already registered resolves synchronously and this is a
     * no-op.
     */
    this.i18n.load( lang )
    return this
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
  /** Reactive store, indexed dynamically — Context only types the surface */
  private get ctx(){ return this.context as Record<string, any> }

  getContext(): Context { return this.context }
  setContext( arg: ( keyof Context & string ) | Partial<Context>, value?: any ){
    typeof arg === 'string'
      ? this.ctx[ arg ] = value
      : Object.entries( arg as object ).forEach( ( [ k, v ] ) => this.ctx[ k ] = v )
  }
  /**
   * Subscribe to a subset of context fields — the effect tracks
   * exactly those keys, so unrelated context writes don't fire it.
   * Returns an unsubscribe function.
   */
  watchContext( fields: ( keyof Context & string )[] | string[], fn: () => void ){
    let first = true
    const { dispose } = effect( () => {
      ;( fields as string[] ).forEach( f => this.ctx[ f ] ) // track
      first ? first = false : fn()
    })
    return dispose
  }
  useContext( fields: string[], fn: ( ctx: Partial<Context> ) => void ){
    return this.watchContext( fields, () =>
      fn( Object.fromEntries( fields.map( f => [ f, this.ctx[ f ] ] ) ) as Partial<Context> ) )
  }

  dispose(){
    this.__root?.destroy()
  }
}
