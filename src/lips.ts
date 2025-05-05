import type { LipsConfig, Template, ComponentOptions, Metavars } from './types'

import TPS from './tps'
import IUC from './iuc'
import DWS from './dws'
import I18N from './i18n'
import Stylesheet from './stylesheet'
import ComponentClass from './component'
import { effect, signal } from './signal'
import { isDiff } from './utils'
import * as If from './syntax/if'
import * as For from './syntax/for'
import * as Async from './syntax/async'
import * as Switch from './syntax/switch'
import * as Router from './syntax/router'

export * from './types'
export type Component<MT extends Metavars> = ComponentClass<MT>

export default class Lips<Context extends Object = {}> {
  public debug = false
  public stylesheets: Stylesheet[] = []
  private config?: LipsConfig<Context> = {}
  private store: Map<string, Template<any>> = new Map()

  private __root?: ComponentClass<any>
  public preprocessor: TPS
  public i18n = new I18N()
  public watcher: DWS<any>
  public IUC: IUC

  private __setLang: ( lang: string ) => void
  private __getLang: () => string
  private __setContext: ( ctx: Context ) => void
  private __getContext: () => Context

  constructor( config?: LipsConfig<Context> ){
    this.config = config

    if( this.config?.debug ) 
      this.debug = this.config.debug

    this.preprocessor = new TPS( this.store )
    this.watcher = new DWS
    this.IUC = new IUC
    
    const [ getLang, setLang ] = signal<string>( this.i18n.lang )
    const [ getContext, setContext ] = signal<Context>( config?.context || {} as Context )

    this.__setLang = setLang
    this.__getLang = getLang
    this.__setContext = setContext
    this.__getContext = getContext


    /**
     * Register syntax components
     * 
     * `<router routers=[] global, ...></router>` -- Internal Routing Component
     */
    this.register('if', If )
    this.register('for', For )
    this.register('async', Async )
    this.register('switch', Switch )
    this.register('router', Router )
  }

  register<MT extends Metavars>( name: string, template: Template<MT> ){
    /**
     * TODO: Register component by providing file path.
     */
    // if( typeof template == 'string' ){
    //   try { this.store[ name ] = await import( template ) as Template }
    //   catch( error ){ throw new Error(`Component <${name}> template not found at ${template}`) }

    //   return
    // }

    this.store.set( name, template )

    return this
  }
  unregister( name: string ){
    this.store.delete( name )

    return this
  }

  has( name: string ){
    return this.store.has( name )
  }
  import<MT extends Metavars>( pathname: string ): Template<MT> {
    // Fetch from registered component
    if( !this.has( pathname ) )
      throw new Error(`<${pathname}> component not found`)
    
    /**
     * Only syntactic component are allowed to 
     * no have template's `default` export.
     */
    const component = this.store.get( pathname )
    if( !component?.declaration?.syntax && !component?.default )
      throw new Error(`Invalid <${pathname}> component`)
    
    return component
  
    /**
     * TODO: Import component directly from a file
     */
    // try {
    //   const template = await import( pathname ) as Template
    //   if( !template?.default )
    //     throw null

    //   this.register( pathname, template )
    //   return template
    // }
    // catch( error ){ throw new Error(`No <${pathname}> component found`) }
  }
  render<MT extends Metavars>( name: string, template: Template<MT>, input?: MT['Input'] ){
    const
    { default: _default, ...scope } = template,
    options: ComponentOptions<Context> = {
      debug: this.debug,
      prepath: '0',
      lips: this
    },
    component = new ComponentClass<MT>( name, _default || '', { ...scope, input }, options )

    // Perform synchronous cleanup operations
    window.addEventListener( 'beforeunload', () => {
      this.dispose()
      component.destroy()

      // REVIEW: Modern browsers ignore return value
      return null
    })

    // Enhanced page lifecycle handling
    window.addEventListener( 'pagehide', (event) => {
      !event.persisted && this.dispose()
    });
    
    // Visibility change for edge cases
    document.addEventListener( 'visibilitychange', () => {
      // Prep for potential unload
      if( document.visibilityState !== 'hidden' ) return
      
      this.IUC.prepareForPotentialUnload()
    })

    return component
  }
  root<MT extends Metavars>( template: Template<MT>, selector: string ){
    this.__root = this.render('__ROOT__', template )
    this.__root.appendTo( selector )

    /**
     * Inject root component stylesheets with 
     * global meta style tags.
     */
    if( this.config?.stylesheets )
      this.stylesheets = this.config.stylesheets.map( sheet => new Stylesheet('root', { sheet, meta: true }) )
      
    return this.__root
  }

  setLanguage( lang: string ){
    this.i18n.lang = lang
    this.__setLang( lang )
  }
  getLanguage(){
    return this.__getLang()
  }

  setContext( arg: Context | string, value?: any ){
    // Always get latest state
    const currentContext = this.__getContext()

    /**
     * Change context only when tangible updates
     * are detected.
     * 
     * Note: Context may not be initialize at instanciation
     * of Lips.
     */
    if( typeof arg === 'string' ){
      const updates = { ...currentContext, [arg]: value }
      isDiff( currentContext, updates ) && this.__setContext( updates )
    }
    /**
     * no-array object guard
     */
    else if( !Array.isArray( arg ) ){
      const updates = { ...currentContext, ...arg }
      isDiff( currentContext, updates ) && this.__setContext( updates )
    }
    
    else throw new Error('Invalid context data')
  }
  getContext(){
    return this.__getContext()
  }
  useContext<P extends Context>( fields: (keyof P)[], fn: ( context: P ) => void ){
    if( !fields.length ) return

    effect( () => {
      const context = this.__getContext()
      if( !context ) return

      const ctx = Object.fromEntries( fields.map( field => [ field, context[ field as keyof Context ] ]) ) as unknown as P
      
      /**
       * Propagate context change effect to component 
       * only when its registered scope have changed
       */
      ctx
      && typeof fn === 'function'
      && Object.keys( ctx ).length
      && fn( ctx )
    })
  }
  useTranslator( support: string | string[], fn: ( lang: string ) => void ){
    effect( () => {
      const lang = this.__getLang()
      if( !lang ) return
      
      /**
       * Propagate language change effect to 
       * component that support it.
       */
      ;(support === '*' || (Array.isArray( support ) && support.includes( lang )))
      && typeof fn === 'function'
      && fn( lang )
    })
  }

  dispose(){
    this.watcher?.dispose()
    this.__root?.destroy()

    /**
     * Clear all global stylesheets if exists
     */
    this.stylesheets.forEach( stylesheet => stylesheet.clear() )
  }
}