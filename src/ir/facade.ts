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

import type { TemplateIR } from './compiler'
import { compileTemplate } from './compiler'
import type { IRComponentDef, IRInstance, RuntimeOptions } from './runtime'
import { renderIR } from './runtime'
import { reactive, effect } from './signal'
import Events from '../events'
import Stylesheet from '../stylesheet'

interface FacadeTemplate {
  default?: string
  state?: Record<string, any>
  handler?: Record<string, ( this: any, ...args: any[] ) => any>
  _static?: Record<string, any>
  context?: string[]
  stylesheet?: string
}

interface FacadeConfig {
  engine?: string
  debug?: boolean
  context?: Record<string, any>
  mode?: 'compiled' | 'interpreted'
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
  private stylesheet?: Stylesheet
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
    this.instance = renderIR( ir, {
      state: this.state,
      input: inputR,
      context: lips.getContext(),
      static: template._static,
      handlers,
      deep: true,
      expose: {
        emit: ( event: string, ...args: any[] ) => this.emit( event, ...args ),
        context: lips.getContext()
      }
    }, options )

    template.stylesheet && ( this.stylesheet = new Stylesheet( name, { sheet: template.stylesheet } ) )

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
    // dispose() runs onDetach/onDestroy — the runtime owns lifecycle
    this.instance.dispose()
    this.stylesheet?.clear()
    this.emit('component:destroy')
  }
}

// -------------------------------------------------------------------- lips
export class IRLips {
  public debug: boolean
  private store = new Map<string, FacadeTemplate>()
  private irCache = new WeakMap<FacadeTemplate, TemplateIR>()
  private defCache = new WeakMap<FacadeTemplate, IRComponentDef>()
  private context: Record<string, any>
  private __root?: IRFacadeComponent

  /**
   * Registered components resolved lazily — the runtime looks
   * names up per render, so registration order doesn't matter.
   */
  private componentsProxy: Record<string, IRComponentDef>

  constructor( private config?: FacadeConfig ){
    this.debug = !!config?.debug
    this.context = reactive( { ...( config?.context || {} ) }, true )

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
    let ir = this.irCache.get( template )
    if( !ir ){
      const result = compileTemplate( template.default || '' )
      result.diagnostics.length
        && console.warn('[lips:ir] template diagnostics —', result.diagnostics )

      ir = result.ir
      this.irCache.set( template, ir )
    }
    return ir
  }
  private defFor( name: string, template: FacadeTemplate ): IRComponentDef {
    let def = this.defCache.get( template )
    if( !def ){
      def = {
        ir: this.compile( template ),
        state: template.state,
        statics: template._static,
        context: template.context,
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
      watchContext: ( fields, fn ) => this.watchContext( fields, fn )
    })
  }
  root( template: FacadeTemplate, selector: string ){
    this.__root = this.render( '__ROOT__', template )
    this.__root.appendTo( selector )
    return this.__root
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
