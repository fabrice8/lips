import type { LipsConfig, Template, ComponentOptions, Metavars } from '.'

import I18N from './i18n'
import IUC from './iuc'
import DWS from './dws'
import Component from './component'
import { effect, signal } from './signal'
import { isDiff } from './utils'
import * as If from './syntax/if'
import * as For from './syntax/for'
import * as pd from './syntax/pd'
import * as Switch from './syntax/switch'
import * as Router from './syntax/router'

export default class Lips<Context = any> {
  private debug = false
  private store: Record<string, Template<any>> = {}

  private __root?: Component<any>
  public i18n = new I18N()
  public watcher: DWS<any>
  public IUC: IUC

  private __setContext: ( ctx: Context ) => void
  private __getContext: () => Context

  constructor( config?: LipsConfig ){
    if( config?.debug ) 
      this.debug = config.debug

    this.watcher = new DWS
    this.IUC = new IUC
    
    const [ getContext, setContext ] = signal<Context>( config?.context || {} )

    this.__setContext = setContext
    this.__getContext = getContext

    /**
     * Register syntax components
     * 
     * `<router routers=[] global, ...></router>` -- Internal Routing Component
     */
    this.register('if', If )
    this.register('pd', pd )
    this.register('for', For )
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

    this.store[ name ] = template

    return this
  }
  unregister( name: string ){
    delete this.store[ name ]

    return this
  }

  has( name: string ){
    return name in this.store
  }
  import<MT extends Metavars>( pathname: string ): Template<MT> {
    // Fetch from registered component
    if( !this.has( pathname ) )
      throw new Error(`<${pathname}> component not found`)
    
    /**
     * Only syntactic component are allowed to 
     * no have template's `default` export.
     */
    if( !this.store[ pathname ].declaration?.syntax && !this.store[ pathname ].default )
      throw new Error(`Invalid <${pathname}> component`)
    
    return this.store[ pathname ]
  
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
    options: ComponentOptions = {
      debug: this.debug,
      prepath: '0',
      lips: this
    },
    component = new Component<MT>( name, _default || '', { ...scope, input }, options )

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

    return this.__root
  }

  language( lang: string ){
    this.i18n.setLang( lang )
    /**
     * Rerender root component when language changed
     */
    && this.__root?.rerender()
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
  useContext<P extends Context>( fields: (keyof Context)[], fn: ( context: P ) => void ){
    if( !fields.length ) return

    effect( () => {
      const context = this.__getContext() as Context
      if( !context ) return

      const ctx = Object.fromEntries( fields.map( field => [ field, context[ field ] ]) ) as unknown as P
      
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

  dispose(){
    this.watcher?.dispose()
    this.__root?.destroy()
  }
}