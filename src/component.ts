import type Lips from './lips'
import type {
  Handler,
  Metavars,
  ComponentScope,
  ComponentOptions,
  InteractiveMetavars,
  Macro,
  Variable,
  VariableSet,
  MeshRenderer,
  MeshTemplate,
  RenderedNode,
  FGUDependencies,
  FGUDependency,
  Declaration,
  FragmentBoundaries,
  VirtualEvent,
  VirtualEventsRegistry,
  MeshWireSetup,
  SyntaxAttributes,
  DynamicTemplate,
  I18nDependency
} from './types'

import UQS from './uqs'
import Events from './events'
import Metrics from './metrics'
import $, { Cash } from 'cash-dom'
import Stylesheet from './stylesheet'
import { preprocessor } from './preprocess'
import { effect, EffectControl, signal } from './signal'
import { 
  isDiff,
  isEqual,
  deepClone,
  deepAssign,
  SPREAD_VAR_PATTERN,
  ARGUMENT_VAR_PATTERN,
  INTERPOLATE_PATTERN,
  I18N_ATTR_FLAG,
  SYNCTAX_VAR_FLAG,
  FUNCTION_ATTR_FLAG,
  EVENT_LISTENER_FLAG
} from './utils'

export default class Component<MT extends Metavars> extends Events {
  private declaration: Declaration
  private $?: Cash | null = null

  public input: MT['Input']
  public state: MT['State'] & {
    toJSON(): MT['State']
    reset(): void
  }
  public static: MT['Static']
  public context: MT['Context']

  public __name__: string
  public __path__: string
  private __lang__: string
  private __template__: string
  private __previous: InteractiveMetavars<MT>
  private __macros: Map<string, Macro> = new Map() // Cached macros templates
  private __i18nDeps: Map<string, I18nDependency> = new Map()

  // Initial FGU dependencies
  public FGUD: FGUDependencies = new Map()
  // Preserved Child Components
  private PCC: Map<string, Component<MT>> = new Map()
  // Virtual Events Registry
  private VER: VirtualEventsRegistry<Component<MT>>[] = []

  private prepath = '0'
  private debug = false
  private isRendered = false

  private __setInput: ( input: MT['Input'] ) => void
  private __setState: ( state: MT['State'] ) => void
  private __getState: () => MT['State'] | undefined

  // Update Queue System for high-frequency DOM updates
  private UQS: UQS<MT>
  // Internal Component Effect
  private ICE: EffectControl

  public lips: Lips
  public metrics: Metrics
  public stylesheet?: Stylesheet

  private __path = ''
  private __pathCounter = 0
  private __renderDepth = 0

  /**
   * Allow methods of `handler` to be dynamically
   * added to `this` component object.
   */
  ;[key: string]: any

  constructor( name: string, template: string, { input, state, context, _static, handler, stylesheet, macros, declaration }: ComponentScope<MT>, options: ComponentOptions<any> ){
    super()
    this.lips = options.lips
    
    if( options?.debug ) this.debug = options.debug || this.lips.debug
    if( options?.prepath ) this.prepath = options.prepath

    this.__name__ = name
    this.__lang__ = this.lips.i18n.lang
    this.__path__ = `${this.prepath}/${this.__name__}`
    this.__template__ = preprocessor( template )

    this.declaration = declaration || { name }

    this.input = input || {}
    this.static = _static || {}
    this.context = {}
    
    /**
     * Detect all state mutations, including deep mutations
     */
    this.state = this.lips.IUC.proxyState<MT['State']>( this.__path__, state || {} )
    
    macros && this.setMacros( macros )
    handler && this.setHandler( handler )
    stylesheet && this.setStylesheet( stylesheet )

    /**
     * Track rendering cycle metrics to evaluate
     * performance.
     * 
     */
    this.metrics = new Metrics( this.debug )
    // Track component creation
    this.metrics.inc('componentCount')
    
    /**
     * Batch Dependencies Update handler
     */
    this.UQS = new UQS( this )

    /**
     * Triggered during component creation
     * 
     * NOTE: Any state value set during this process
     * is considered initial state.
     */
    typeof this.onCreate == 'function'
    && this.onCreate.bind(this)()
    this.emit('component:create', this )

    /**
     * Triggered an initial input is provided
     */
    if( this.input
        && Object.keys( this.input ).length
        && typeof this.onInput == 'function' ){
      this.onInput.bind(this)( this.input )
      this.emit('component:input', this )
    }

    /**
     * Initialize previous interative metavars to initial metavars
     * 
     * IMPORTANT: this prevent any update effect during
     * component creating for initial input, state and
     * context
     */
    this.__previous = {
      input: deepClone( this.input ),
      state: deepClone( this.state ),
      context: deepClone( this.context )
    }

    const
    [ getInput, setInput ] = signal<MT['Input']>( this.input ),
    [ getState, setState ] = signal<MT['State']>( this.state ),
    [ getContext, setContext ] = signal<MT['Context']>( this.context )

    this.__setInput = setInput
    this.__setState = setState
    this.__getState = getState

    /**
     * Register to queue & apply update only when 
     * a new change occured on the state.
     * 
     * Merge with initial/active state.
     */
    this.lips.IUC.register( this.__path__, () => {
      isDiff( this.__previous?.state as Record<string, any>, this.state as Record<string, any> )
      && this.__setState({ ...this.__getState(), ...this.state })
    })
    
    /**
     * Set context update effect listener
     * to merge with initial/active context
     * after any occurances.
     */
    Array.isArray( context )
    && context.length
    && this.lips.useContext<MT['Context']>( context, ctx => {
      if( !isDiff( this.context as Record<string, any>, ctx ) ) return

      setContext( ctx )
      /**
       * IMPORTANT: Make `ctx` data available for the
       * onContext lifecycle event before component get
       * rendered of update.
       */
      this.context = ctx
      
      /**
       * Triggered anytime component context changed
       */
      typeof this.onContext == 'function'
      && this.onContext.bind(this)()
      this.emit('component:context', this )
    })

    /**
     * Subscribe to i18n changes
     * 
     * - `*` support all languages
     * - [...] TODO: Explicitly defined list of supported languages
     */
    this.lips.useTranslator( '*', lang => {
      /**
       * Run translation update only when the 
       * language truly changed
       */
      if( lang === this.__lang__ ) return

      this.__updateI18nDepNodes__()
      this.__lang__ = lang
    })
    
    this.ICE = effect( () => {
      const
      input = getInput(),
      state = getState(),
      /**
       * `this.context` is initialized empty so it's
       * important to set it before component render 
       * or update.
       */
      context = this.context = getContext()
      
      /**
       * Initial render - parse template and establish 
       * dependencies
       */
      if( !this.isRendered ){
        // Reset metrics before render
        this.metrics.reset()
        
        const { $log } = this.render( '', undefined, undefined, this.FGUD )
        this.$ = $log
        
        /**
         * Assign CSS relationship attribute
         * for only non-syntax components.
         */
        !declaration?.syntax && this.$?.each( ( i, el ) => typeof el.setAttribute == 'function' && el.setAttribute('rel', this.__name__ ) )

        this.isRendered = true
        
        /**
         * Triggered after component get mounted for
         * the first time.
         */
        typeof this.onMount == 'function'
        && this.onMount.bind(this)()
        this.emit('component:mount', this )

        /**
         * Watch when component's element get 
         * attached to the DOM
         */
        this.lips.watcher.watch( this as any )
      }
      else {
        /**
         * Update only dependent nodes
         */
        this.__updateDepNodes__( { state, input, context }, this.__previous )
        
        /**
         * Triggered anytime component gets updated
         */
        typeof this.onUpdate == 'function' && this.onUpdate.bind(this)()
        this.emit('component:update', this )
        
        /**
         * Save as previous meta variables for next cycle.
         * 
         * IMPORTANT: Required to check changes on the state
         *            during IUC processes.
         */
        this.__previous = {
          input: deepClone( input ),
          state: deepClone( state ),
          context: deepClone( context )
        }

        this.input = input
      }

      this.metrics.log()

      /**
       * Triggered anytime component gets rendered
       */
      typeof this.onRender == 'function' && this.onRender.bind(this)()
      this.emit('component:render', this )
    })
  }

  setContext( arg: Partial<Record<string, any>> | string, value?: any  ){
    /**
     * Set global context value from any component
     * 
     * Note: `arg` if object isn't restricted to 
     *        this component's required context fields scope.
     */
    this.lips.setContext( arg, value )
  }
  setInput( input: MT['Input'] ){
    /**
     * Apply update only when new input is different 
     * from the incoming input
     */
    if( !isDiff( this.input as Record<string, any>, input as Record<string, any> ) )
      return
    
    // Set new input.
    this.__setInput( input )
    
    /**
     * Triggered anytime component recieve new input
     */
    typeof this.onInput == 'function'
    && this.onInput.bind(this)( input )
  }
  /**
   * Inject grain/partial input to current component 
   * instead of sending a whole updated input
   */
  subInput( data: Record<string, any> ){
    if( typeof data !== 'object' )
      throw new Error('Invalid sub input data argument')

    this.setInput( deepAssign<MT['Input']>( this.input, data ) )
    return this
  }
  setMacros( template: string ){
    const 
    prepo = preprocessor( template ),
    $nodes = $(prepo)
    if( !$nodes.length ) return

    const self = this
    $nodes.each( function(){
      const
      $node = $(this),
      { argv, attrs } = self.__getAttributes__( $node )

      if( !Object.keys( attrs ) )
        throw new Error('Invalid macro component definition')

      if( !attrs.literals.name )
        throw new Error('Undefined macro `name` attribute.')

      if( self.__macros.get( attrs.literals.name ) )
        console.warn(`Duplicate macro <${attrs.literals.name}> will be override`)

      if( !$node.contents()?.length )
        throw new Error('Invalid macro component definition. Template content expected.')

      self.__macros.set( attrs.literals.name, { argv, $node } )
    } )
  }
  setHandler( list: Handler<MT> ){
    Object
    .entries( list )
    .map( ([ method, fn ]) => this[ method ] = fn?.bind(this) )
  }
  setStylesheet( sheet?: string ){
    const cssOptions = {
      sheet,
      /**
       * Inject root component styles into global meta
       * style tag.
       */
      meta: this.__name__ === '__ROOT__'
    }

    this.stylesheet = new Stylesheet( this.__name__, cssOptions )
  }

  get node(){
    if( !this.$ )
      throw new Error('node() is expected to be call after component get rendered')

    return this.$
  }
  
  render( inpath: string, $nodes?: Cash, scope: VariableSet = {}, sharedDeps?: FGUDependencies, xmlns?: boolean ): RenderedNode {
    const
    dependencies: FGUDependencies = sharedDeps || new Map(),
    attachableEvents: VirtualEvent[] = []

    if( $nodes && !$nodes.length ){
      console.warn('Undefined node element to render')
      return { $log: $nodes, dependencies }
    }

    // Start metrics measuring
    this.metrics.startRender()

    const self = this
    
    /**
     * Initialize an empty cash object to 
     * act like a DocumentFragment
     */
    let _$ = $()

    function generatePath( type: string ): string {
      const key = generateComponentName( type )
      
      self.__pathCounter++

      return self.__path ? `${self.__path}/${key}` : `${inpath ? inpath +'/' : '#'}${key}`
    }
    function generateComponentName( type: string ){
      return (type === 'component' ? 'c' : '')+ self.__pathCounter
    }
    function isMesh( arg: any ){
      return arg !== null
              && typeof arg === 'object'
              && typeof arg.mesh === 'function'
              && typeof arg.update === 'function'
    }
    function isTemplate( arg: any ){
      return arg !== null
              && typeof arg === 'object'
              && typeof arg.default
              && typeof arg.default === 'string'
    }
    function handleDynamic( $node: Cash ){
      if( !$node.attr(':dtag') || $node.prop('tagName') !== 'LIPS' )
        throw new Error('Invalid dynamic tag name')
      
      const
      dtag = $node.attr(':dtag') as string,
      result = self.__evaluate__( dtag, scope )
      
      /**
       * Process dynamic content rendering tag set by:
       * 
       * Syntax `<{input.render}/>`
       * processed to `<lips :dtag=input.render></lips>`
       */
      if( isMesh( result ) || result === null )
        return execDynamicElement( $node, dtag, result )

      /**
       * Process dynamic component rendering tag set by:
       * 
       * Syntax `<{[template-object]}/>`
       * processed to `<lips :dtag="[template-object]"></lips>`
       */
      else if( isTemplate( result ) )
        return execComponent( $node, { template: result } )

      /**
      * Process dynamic tag set by:
      * 
      * Syntax `<{[dynamic-name]}/>`
      * processed to `<lips :dtag="[dynamic-name]"></lips>`
      */
      else return execComponent( $node, { name: result } )
    }

    function execLog( $node: Cash ){
      const
      args = $node.attr(':args'),
      logPath = generatePath('log')
      if( !args ) return
      
      self.__evaluate__(`console.log(${args})`, scope )

      if( self.__isReactive__( args as string, scope ) ){
        const deps = self.__extractExpressionDeps__( args as string, scope )
        
        deps.forEach( dep => self.__trackDep__( dependencies, dep, {
          nodetype: 'log',
          target: 'argument',
          $fragment: null,
          path: logPath,
          update: memo => self.__evaluate__(`console.log(${args})`, memo ),
          memo: scope,
          batch: true
        }) )
      }
    }
    function execLet( $node: Cash ){
      const
      varPath = generatePath('var'),
      { attrs } = self.__getAttributes__( $node )
      if( !attrs ) return 
      
      Object
      .entries( attrs.literals )
      .forEach( ([ key, assign ]) => {
        if( scope[ key ] && scope[ key ].type === 'const' )
          throw new Error(`Cannot override <const ${key}=[value]/> variable`)

        scope[ key ] = { value: assign, type: 'let' }
      })

      Object
      .entries( attrs.expressions )
      .forEach( ([ key, assign ]) => {
        // Process spread assign
        if( SPREAD_VAR_PATTERN.test( key ) ){
          const spreadExtract = ( update?: boolean, memo?: VariableSet ) => {
            const spreads = self.__evaluate__( key.replace( SPREAD_VAR_PATTERN, '' ) as string, memo || scope )
            if( typeof spreads !== 'object' )
              throw new Error(`Invalid spread operator ${key}`)

            for( const _key in spreads ){
              if( scope[ _key ] && scope[ _key ].type === 'const' )
                throw new Error(`Cannot override <const ${_key}=[value]/> variable`)

              scope[ _key ] = {
                value: spreads[ _key ],
                type: 'let'
              }

              if( memo ){
                memo[ _key ] = scope[ _key ]

                /**
                 * Apply update to related dependencies
                 */
                self.__updateVarDepNodes__( _key, varPath, memo )
              }
            }

            if( update ) return { memo }
          }

          const deps = self.__extractExpressionDeps__( key as string, scope )
          deps.forEach( dep => self.__trackDep__( dependencies, dep, {
            nodetype: 'let',
            target: 'spread-attr',
            $fragment: null,
            path: `${varPath}.${key}`,
            update: memo => spreadExtract( true, memo ),
            memo: scope,
            batch: true
          }) )

          spreadExtract()
        }
        else if( assign ){
          if( self.__isReactive__( assign as string, scope ) ){
            const 
            deps = self.__extractExpressionDeps__( assign as string, scope ),
            updateVar = ( memo: VariableSet, by?: string ) => {
              if( scope[ key ] && scope[ key ].type === 'const' )
                throw new Error(`Cannot override <const ${key}=[value]/> variable`)

              memo[ key ] = 
              scope[ key ] = {
                value: self.__evaluate__( assign as string, memo ),
                type: 'let'
              }

              /**
               * Apply update to related dependencies
               */
              self.__updateVarDepNodes__( key, varPath, memo )

              return { memo }
            }

            deps.forEach( dep => self.__trackDep__( dependencies, dep, {
              nodetype: 'let',
              target: 'attr',
              $fragment: null,
              path: `${varPath}.${key}`,
              update: updateVar,
              memo: scope,
              batch: true
            }) )
          }

          if( scope[ key ] && scope[ key ].type === 'const' )
            throw new Error(`Cannot override <const ${key}=[value]/> variable`)

          scope[ key ] = {
            value: self.__evaluate__( assign as string, scope ),
            type: 'let'
          }
        }
      })
      
      /**
       * METRICS: Tracking total elements rendered
       */
      self.metrics.inc('elementCount')
    }
    function execConst( $node: Cash ){
      const
      { attrs } = self.__getAttributes__( $node )
      if( !attrs ) return
      
      Object
      .entries( attrs.literals )
      .forEach( ([ key, assign ]) => {
        if( scope[ key ] && scope[ key ].type === 'const' )
          throw new Error(`<const ${key}=[value]/> variable already defined`)

        if( !assign ) return

        scope[ key ] = { value: assign, type: 'const' }
      } )

      Object
      .entries( attrs.expressions )
      .forEach( ([ key, assign ]) => {
        // Process spread assign
        if( SPREAD_VAR_PATTERN.test( key ) ){
          const spreads = self.__evaluate__( key.replace( SPREAD_VAR_PATTERN, '' ) as string, scope )
          if( typeof spreads !== 'object' )
            throw new Error(`Invalid spread operator ${key}`)

          for( const _key in spreads ){
            if( scope[ _key ] && scope[ _key ].type === 'const' )
              throw new Error(`<const ${_key}=[value]/> by spread operator ${key}. [${_key}] variable already defined`)
          
            scope[ _key ] = {
              value: spreads[ _key ],
              type: 'const'
            }
          }
        }
        else {
          if( scope[ key ] && scope[ key ].type === 'const' )
            throw new Error(`<const ${key}=[value]/> variable already defined`)

          if( !assign ) return
          
          scope[ key ] = {
            value: self.__evaluate__( assign as string, scope ),
            type: 'const'
          }
        }
      } )
      
      /**
       * METRICS: Tracking total elements rendered
       */
      self.metrics.inc('elementCount')
    }
    function execDynamicElement( $node: Cash, dtag: string, renderer: MeshRenderer | null ): Cash {
      const
      { attrs } = self.__getAttributes__( $node ),
      elementPath = generatePath('element'),
      boundaries = self.__getBoundaries__( elementPath )
      
      let
      $fragment = $(boundaries.start),
      // Keep track of the latest mesh scope
      argvalues: VariableSet = {},
      activeRenderer = renderer

      if( activeRenderer ){
        attrs.literals && Object
        .entries( attrs.literals )
        .forEach( ([ key, value ]) => argvalues[ key ] = { type: 'arg', value } )

        attrs.expressions && Object
        .entries( attrs.expressions )
        .forEach( ([ key, value ]) => {
          if( !activeRenderer ) return
          
          if( SPREAD_VAR_PATTERN.test( key ) ){
            const
            spreads = self.__evaluate__( key.replace( SPREAD_VAR_PATTERN, '' ) as string, scope )
            if( typeof spreads !== 'object' )
              throw new Error(`Invalid spread operator ${key}`)

            for( const _key in spreads ){
              // Only consume declared arguments' value
              if( _key !== '#' && !activeRenderer.argv.includes( _key ) ) continue

              argvalues[ _key ] = {
                type: 'arg',
                value: spreads[ _key ]
              }
            }
          }
          else {
            // Only consume declared arguments' value
            if( key !== '#' && !activeRenderer.argv.includes( key ) ) return

            argvalues[ key ] = {
              type: 'arg',
              value: value ? self.__evaluate__( value, scope ) : true
            }
          }
        })

        const $log = activeRenderer.mesh( argvalues )
        if( $log && $log.length )
          $fragment = $fragment.add( $log )
        
        /**
         * IMPORTANT:
         * 
         * Set update dependency track only after $fragment 
         * contain rendered content
         */
        attrs.expressions && Object
        .entries( attrs.expressions )
        .forEach( ([ key, value ]) => {
          if( !activeRenderer ) return
          
          if( SPREAD_VAR_PATTERN.test( key ) && self.__isReactive__( key as string, scope ) ){
            const
            deps = self.__extractExpressionDeps__( key as string, scope ),
            spreadPartialUpdate = ( memo: VariableSet, by?: string ) => {
              if( !activeRenderer ) return

              const
              extracted: VariableSet = {},
              spreads = self.__evaluate__( key.replace( SPREAD_VAR_PATTERN, '' ) as string, memo )
              if( typeof spreads !== 'object' )
                throw new Error(`Invalid spread operator ${key}`)

              const toUpdateDeps: string[] = []
              for( const _key in spreads ){
                // Only update declared arguments' value
                if( _key !== '#' && !activeRenderer.argv.includes( _key ) ) continue

                argvalues[ _key ] =
                extracted[ _key ] = {
                  type: 'arg',
                  value: spreads[ _key ]
                }
                
                /**
                 * Schedule only what changed to be
                 * updated.
                 */
                ;( !memo[ _key ] || !isEqual( spreads[ _key ], memo[ _key ].value ) )
                && toUpdateDeps.push( _key )
              }

              toUpdateDeps.length 
              && activeRenderer.update( toUpdateDeps, extracted, boundaries )
            }

            deps.forEach( dep => self.__trackDep__( dependencies, dep, {
              nodetype: 'dynamic',
              target: 'spread-attr',
              $fragment: null,
              boundaries,
              path: `${elementPath}.${key}`,
              update: spreadPartialUpdate,
              memo: scope,
              batch: true
            }) )
          }
          else if( ( key === '#' || activeRenderer.argv.includes( key ) )
                    && self.__isReactive__( value as string, scope ) ) {
            const 
            deps = self.__extractExpressionDeps__( value as string, scope ),
            partialUpdate = ( memo: VariableSet, by?: string ) => {
              if( !activeRenderer ) return

              const
              _value: Variable =
              argvalues[ key ] = {
                type: 'arg',
                value: value ? self.__evaluate__( value, memo ) : true
              }
              
              activeRenderer.update( [ key ], { [ key ]: _value }, boundaries )
            }
            
            deps.forEach( dep => self.__trackDep__( dependencies, dep, {
              nodetype: 'dynamic',
              target: 'attr',
              $fragment: null,
              boundaries,
              path: `${elementPath}.${key}`,
              update: partialUpdate,
              memo: scope,
              batch: true
            }) )
          }
        } )
      }
      
      // Track FGU dependency update on the dynamic tag
      if( self.__isReactive__( dtag as string, scope ) ){
        const
        updateDynamicElement = ( memo: VariableSet, by?: string ) => {
          /**
           * Re-evaluate dynamic tag expression before 
           * re-rendering the element
           */
          const result = self.__evaluate__( dtag, memo )

          let $newContent
          /**
           * Render dynamic template only when first 
           * time renderer is `null` and the element's
           * dynamic update provide a component `template`
           * instead of a mesh `renderer`.
           */
          if( isTemplate( result ) )
            $newContent = execComponent( $node, { template: result } )
          
          /**
           * The mesh renderer changed
           */
          else if( isMesh( result ) ){
            // Update the mesh argvalues with new values
            argvalues = '#' in argvalues
                                ? { ...memo, ...argvalues['#'].value }
                                : { ...memo, ...argvalues }
                                
            activeRenderer = result
            $newContent = activeRenderer ? activeRenderer.mesh( argvalues ) : null
          }

          // Check if boundaries are in DOM
          if( !document.contains( boundaries.start ) || !document.contains( boundaries.end ) ){
            // console.warn('Dynamic element boundaries not found')
            return
          }

          // Render new content
          const
          nodesToRemove = [] // Nodes between boundaries
          let currentNode = boundaries.start.nextSibling
          
          while( currentNode && currentNode !== boundaries.end ){
            nodesToRemove.push( currentNode )
            currentNode = currentNode.nextSibling
          }
          
          // Remove old content and insert new
          $(nodesToRemove).remove()

          $newContent && $(boundaries.start).after( $newContent )
        },
        deps = self.__extractExpressionDeps__( dtag as string, scope )

        deps.forEach( dep => self.__trackDep__( dependencies, dep, {
          nodetype: 'dynamic',
          target: 'dtag',
          $fragment: null,
          boundaries,
          path: elementPath,
          update: updateDynamicElement,
          batch: true,
          memo: { ...scope, ...argvalues }
        }) )
      }

      $fragment = $fragment.add( boundaries.end )

      return $fragment
    }
    function execComponent( $node: Cash, dynamic?: DynamicTemplate<any> ): Cash {
      let
      template,
      name

      // Dynamic component template
      if( dynamic?.template ){
        template = dynamic.template
        name = generateComponentName('component')
      }
      
      // Lookup component by its name
      else {
        name = dynamic?.name || $node.prop('tagName')?.toLowerCase() as string
        
        if( !name ) throw new Error('Invalid component')
        if( name === self.__name__ ) throw new Error('Render component within itself is forbidden')

        // Import template from lips registry
        template = self.lips.import<any>( name )
      }
      
      if( !template || !name )
        throw new Error(`<${name}> template not found`)

      const
      componentPath = generatePath('component'),
      boundaries = self.__getBoundaries__( componentPath ),
      { argv, attrs, events } = self.__getAttributes__( $node ),
      TRACKABLE_ATTRS: Record<string, string> = {}

      /**
       * Parse assigned attributes to be injected into
       * the component as input.
       */
      let
      input: any = {},
      $fragment = $(boundaries.start),
      component = self.PCC.get( componentPath )

      /**
       * Cast attributes to compnent inputs
       */
      attrs.literals && Object
      .entries( attrs.literals )
      .forEach( ([ key, value ]) => {
        if( key == 'key' ) return
        input[ key ] = value
      })
      
      attrs.functions && Object
      .entries( attrs.functions )
      .forEach( ([ key, expr ]) => {
        input[ key ] = self.__evaluateFunction__( expr, [], scope )
        
        template.declaration?.syntax
                      ? TRACKABLE_ATTRS[ SYNCTAX_VAR_FLAG + FUNCTION_ATTR_FLAG + key ] = expr
                      : TRACKABLE_ATTRS[ FUNCTION_ATTR_FLAG + key ] = expr
      })
      
      attrs.expressions && Object
      .entries( attrs.expressions )
      .forEach( ([ key, value ]) => {
        if( key == 'key' ) return
        
        if( SPREAD_VAR_PATTERN.test( key ) ){
          const spreads = self.__evaluate__( key.replace( SPREAD_VAR_PATTERN, '' ) as string, scope )
          if( typeof spreads !== 'object' )
            throw new Error(`Invalid spread operator ${key}`)

          for( const _key in spreads )
            input[ _key ] = spreads[ _key ]
        }

        else input[ key ] = value
                ? self.__evaluate__( value as string, scope )
                /**
                  * IMPORTANT: An attribute without a value is
                  * considered neutral but `true` of a value by
                  * default.
                  * 
                  * Eg. <counter initial=3 throttle/>
                  * 
                  * the `throttle` attribute is hereby an input with a
                  * value `true`.
                  */
                : true

        template.declaration?.syntax
                  ? TRACKABLE_ATTRS[ SYNCTAX_VAR_FLAG + key ] = value
                  : TRACKABLE_ATTRS[ key ] = value
      })

      /**
       * Also inject component slotted body into inputs
       */
      const $nodeContents = $node.contents()
      if( $nodeContents.length ){
        // Pass in the regular body contents
        input = {
          ...input,
          ...self.__meshwire__({
            $node,
            fragmentPath: componentPath,
            fragmentBoundaries: boundaries,
            meshPath: null,
            argv,
            scope,
            xmlns,
            useAttributes: true,
            declaration: template.declaration,
          }, TRACKABLE_ATTRS )
        }

        /**
         * Parse a syntactic declaration body contents
         */
        if( template.declaration ){
          /**
           * Extract node syntax component declaration tag nodes
           */
          if( template.declaration.tags ){
            Object
            .entries( template.declaration?.tags )
            .forEach( ([ tagname, { type, many }]) => {
              switch( type ){
                case 'nexted': {
                  let $next = $node.next( tagname )
                  if( !$next.length ) return

                  if( many ){
                    input[ tagname ] = []

                    let
                    index = 0,
                    reachedEndOfChain = false
                    
                    // Continue until we reach the end of the chain
                    while( !reachedEndOfChain ){
                      input[ tagname ].push( self.__meshwire__({ 
                        $node: $next,
                        meshPath: `${tagname}[${index}]`,
                        fragmentPath: componentPath,
                        fragmentBoundaries: boundaries,
                        argv,
                        scope,
                        xmlns,
                        useAttributes: true,
                        declaration: template.declaration
                      }, TRACKABLE_ATTRS ) )

                      // Check if there's a next sibling
                      if( !$next.next( tagname ).length ){
                        reachedEndOfChain = true
                        break
                      }
                      
                      // Move to the next siblings
                      $next = $next.next( tagname )
                      index++
                    }
                  }
                  else input[ tagname ] = self.__meshwire__({
                        $node: $next,
                        meshPath: tagname,
                        fragmentPath: componentPath,
                        fragmentBoundaries: boundaries,
                        argv,
                        scope,
                        xmlns,
                        useAttributes: true,
                        declaration: template.declaration
                      }, TRACKABLE_ATTRS )
                } break

                case 'child': {
                  const $children = $node.children( tagname )
                  if( many ){
                    input[ tagname ] = []
                    $children.each(function( index ){
                      const 
                      $this = $(this),
                      // Only allowed for child tags
                      { argv } = self.__getAttributes__( $this )
                      
                      input[ tagname ].push( self.__meshwire__({ 
                        $node: $this,
                        meshPath: `${tagname}[${index}]`,
                        fragmentPath: componentPath,
                        fragmentBoundaries: boundaries,
                        argv,
                        scope,
                        xmlns,
                        useAttributes: true,
                        declaration: template.declaration
                      }, TRACKABLE_ATTRS ) )
                    })
                  }
                  else if( $node.children( tagname ).first().length ){
                    const
                    $this = $node.children( tagname ).first(),
                    // Only allowed for child tags
                    { argv } = self.__getAttributes__( $this )
                    
                    input[ tagname ] = self.__meshwire__({
                      $node: $this,
                      meshPath: tagname,
                      fragmentPath: componentPath,
                      fragmentBoundaries: boundaries,
                      argv,
                      scope,
                      xmlns,
                      useAttributes: true,
                      declaration: template.declaration
                    }, TRACKABLE_ATTRS )
                  }
                } break
              }
            } )
          }

          /**
           * Pass raw content nodes to component
           */
          else if( template.declaration.contents )
            input.__contents__ = $nodeContents
        }
      }
      
      // Use preserved child component is available
      if( component ){
        component.setInput( deepClone( input ) )
        $fragment = $fragment.add( component.node )
      }
      // Render child component
      else {
        const { declaration, state, _static, handler, context, default: _default, stylesheet } = template
        
        component = new Component( name, _default || '', {
          state: deepClone( state ),
          input: deepClone( input ),
          context,
          _static: deepClone( _static ),
          handler,
          stylesheet,
          declaration
        }, {
          debug: self.debug,
          lips: self.lips,
          prepath: componentPath
        })

        $fragment = $fragment.add( component.node )
        // Cache component for reuse.
        self.PCC.set( componentPath, component )
      }

      // Close boundaries to the initial fragment when it's added to DOM
      $fragment = $fragment.add( boundaries.end )

      // Listen to this nexted component's events
      Object
      .entries( events )
      .forEach( ([ _event, instruction ]) => !!component && self.__attachEvent__( component, _event, instruction, scope ) )
      
      /**
       * Setup input dependency track
       */
      TRACKABLE_ATTRS && Object
      .entries( TRACKABLE_ATTRS )
      .forEach( ([ key, value ]) => {
        let 
        isSyntax = false,
        isFunction = false

        if( key.startsWith( SYNCTAX_VAR_FLAG ) ){
          isSyntax = true
          key = key.replace( SYNCTAX_VAR_FLAG, '')
        }
        if( key.startsWith( FUNCTION_ATTR_FLAG ) ){
          isFunction = true
          key = key.replace( FUNCTION_ATTR_FLAG, '')
        }

        if( SPREAD_VAR_PATTERN.test( key ) ){
          const spreadvalues = ( memo: VariableSet ) => {
            const
            extracted: Record<string, any> = {},
            spreads = self.__evaluate__( key.replace( SPREAD_VAR_PATTERN, '' ) as string, memo )

            if( typeof spreads !== 'object' )
              throw new Error(`Invalid spread operator ${key}`)

            for( const _key in spreads )
              extracted[ _key ] = spreads[ _key ]

            console.log('update component spread --', extracted )
            component?.subInput( extracted )
          }
          
          if( self.__isReactive__( key as string, scope ) ){
            const deps = self.__extractExpressionDeps__( value as string, scope )
            
            deps.forEach( dep => self.__trackDep__( dependencies, dep, {
              nodetype: 'component',
              target: 'spread-attr',
              $fragment: null,
              boundaries,
              path: `${componentPath}.${key}`,
              update: spreadvalues,
              syntax: true,
              memo: scope,
              batch: true
            }) )
          }
        }
        else {
          const evalue = ( memo: VariableSet ) => {
            const _value = isFunction
                          ? self.__evaluateFunction__( value, [], memo )
                          : value ? self.__evaluate__( value as string, memo ) : true

            component?.subInput({ [key]: _value })

            console.log('update component evalue --', key, _value )
          }
          
          if( self.__isReactive__( value as string, scope ) ){
            const deps = self.__extractExpressionDeps__( value as string, scope )
            
            deps.forEach( dep => self.__trackDep__( dependencies, dep, {
              nodetype: 'component',
              target: 'attr',
              $fragment: null,
              boundaries,
              path: `${componentPath}.${key}`,
              update: evalue,
              syntax: true,
              memo: scope,
              batch: true
            }) )
          }
        }
      })

      // Track component creation
      self.metrics.inc('componentCount')

      return $fragment
    }
    function execMacro( $node: Cash ): Cash {
      const name = $node.prop('tagName')?.toLowerCase() as string
      if( !name )
        throw new Error('Invalid macro rendering call')

      const macro = self.__macros.get( name )
      if( !macro )
        throw new Error('Macro component not found')
      
      const
      macroPath = generatePath('macro'),
      boundaries = self.__getBoundaries__( macroPath ),
      { attrs } = self.__getAttributes__( $node ),
      TRACKABLE_ATTRS: Record<string, string> = {}
      
      /**
       * Parse assigned attributes to be injected into
       * the component as input.
       */
      let
      argvalues: VariableSet = {},
      allvalues: Record<string, any> = {},
      $fragment = $(boundaries.start)

      /**
       * Cast attributes to compnent inputs
       */
      attrs.literals && Object
      .entries( attrs.literals )
      .forEach( ([ key, value ]) => argvalues[ key ] = { value, type: 'arg' } )

      attrs.expressions && Object
      .entries( attrs.expressions )
      .forEach( ([ key, value ]) => {
        if( SPREAD_VAR_PATTERN.test( key ) ){
          const spreads = self.__evaluate__( key.replace( SPREAD_VAR_PATTERN, '' ) as string, scope )
          if( typeof spreads !== 'object' )
            throw new Error(`Invalid spread operator ${key}`)

          for( const _key in spreads ){
            allvalues[ _key ] = spreads[ _key ]

            if( macro.argv.includes( _key ) )
              argvalues[ _key ] = {
                value: spreads[ _key ],
                type: 'arg'
              }
          }

          /**
           * Always track spread operators for their 
           * content might be reactive
           */
          TRACKABLE_ATTRS[ key ] = value
        }

        else {
          const val = value ? self.__evaluate__( value as string, scope ) : true

          allvalues[ key ] = val

          if( macro.argv.includes( key ) ){
            argvalues[ key ] = {
              value: val,
              type: 'arg'
            }
            
            TRACKABLE_ATTRS[ key ] = value
          }
        }
          
        /**
         * VERY IMPORTANT: Cancel out invalid argv variables 
         * by `false`. It help assigning `undefined` values
         * to element's attribute that are considered `true`
         * as set.
         * 
         * Eg. <div active=undefined></div> is same as <div active></div>
         * which is considered as <div active=true></div>
         * 
         * REVIEW well before or during maintenance
         */
        macro.argv.forEach( each => {
          if( argvalues[ each ] !== undefined ) return

          argvalues[ each ] = {
            value: false, // REVIEW the `false` value assignment later.
            type: 'arg'
          }
        })
      })

      /**
       * Return all possible arguments into single object 
       * var that can be accessible in macro template 
       * beside the spreading vars effect.
       * 
       * Useful for cases where many `argv` are passed
       * to the macro but there a need to handle all in
       * a single variable.
       */
      if( macro.argv.includes('__') )
        argvalues['__'] = {
          value: allvalues,
          type: 'arg'
        }

      /**
       * - $fragment
       * - macroPath
       * - template.declaration?
       */
      const
      setup: MeshWireSetup = {
        $node: macro.$node,
        meshPath: null,
        fragmentPath: macroPath,
        fragmentBoundaries: boundaries,
        argv: macro.argv,
        scope,
        xmlns,
        useAttributes: true
      },
      macrowire = self.__meshwire__( setup, TRACKABLE_ATTRS ),
      $log = macrowire.renderer.mesh( argvalues )

      $fragment = $fragment.add( $log )
      
      /**
       * Setup input dependency track
       */
      TRACKABLE_ATTRS && Object
      .entries( TRACKABLE_ATTRS )
      .forEach( ([ key, value ]) => {
        let isSyntax = false
        if( new RegExp(`^${SYNCTAX_VAR_FLAG}`).test( key ) ){
          isSyntax = true
          key = key.replace( SYNCTAX_VAR_FLAG, '' )
        }

        if( SPREAD_VAR_PATTERN.test( key ) ){
          if( !self.__isReactive__( key as string, scope ) ) return

          const 
          deps = self.__extractExpressionDeps__( key as string, scope ),
          spreadvalues = ( memo: VariableSet ) => {
            const
            extracted: VariableSet = {},
            spreads = self.__evaluate__( key.replace( SPREAD_VAR_PATTERN, '' ) as string, memo )
            if( typeof spreads !== 'object' )
              throw new Error(`Invalid spread operator ${key}`)

            const toUpdateDeps: string[] = []
            for( const _key in spreads ){
              extracted[ _key ] = {
                value: spreads[ _key ],
                type: 'arg'
              }
              
              /**
               * Schedule only what changed to be
               * updated.
               */
              ;(!memo[ _key ] || !isEqual( spreads[ _key ], memo[ _key ].value ))
              && toUpdateDeps.push( _key )
            }
            
            // console.log('Update macro spread --', key, memo, toUpdateDeps, extracted )
            toUpdateDeps.length
            && macrowire.renderer.update( toUpdateDeps, extracted )

            return { memo: { ...memo, ...extracted } }
          }

          deps.forEach( dep => self.__trackDep__( dependencies, dep, {
            nodetype: 'macro',
            target: 'spread-attr',
            $fragment: null,
            boundaries,
            path: `${macroPath}.${key}`,
            update: spreadvalues,
            syntax: isSyntax,
            memo: { ...scope, ...argvalues },
            batch: true
          }) )
        }
        else if( self.__isReactive__( value as string, scope ) ){
          const
          deps = self.__extractExpressionDeps__( value as string, scope ),
          evalue = ( memo: VariableSet ) => {
            const
            newvalue: Variable =
            memo[ key ] = {
              value: value ? self.__evaluate__( value as string, memo ) : true,
              type: 'arg'
            }

            macrowire.renderer.update( [ key ], { [ key ]: newvalue } )

            return { memo }
          }
        
          deps.forEach( dep => self.__trackDep__( dependencies, dep, {
            nodetype: 'macro',
            target: 'attr',
            $fragment: null,
            boundaries,
            path: `${macroPath}.${key}`,
            update: evalue,
            syntax: isSyntax,
            memo: { ...scope, ...argvalues },
            batch: true
          }) )
        }
      })

      $fragment = $fragment.add( boundaries.end )

      /**
       * METRICS: Tracking total elements rendered
       */
      self.metrics.inc('elementCount')
      
      return $fragment
    }
    function execElement( $node: Cash ): Cash {
      if( !$node.length || !$node.prop('tagName') ) return $node

      /**
       * Special treatement for SVG xml tags
       * because of their delicate namespace
       * definition.
       * 
       * Note: `xmlns` to indicate to and xmlns 
       * parent tag's nexted contents, like
       * 
       * - rect
       * - path
       * - circle
       * - etc
       */
      const
      isXMLNS = $node.is('svg') || xmlns,
      $fragment = isXMLNS
                    ? $(document.createElementNS('http://www.w3.org/2000/svg', $node.prop('tagName').toLowerCase() ))
                    // Standard HTML element
                    : $(`<${$node.prop('tagName').toLowerCase()}/>`),
      $contents = $node.contents(),
      elementPath = generatePath('element')
      
      // Process contents recursively if they exist
      $contents.length
      && $fragment.append( self.__withPath__( elementPath, () => self.render( elementPath +'.n', $contents, scope, dependencies, isXMLNS ).$log ) )

      const { attrs, events } = self.__getAttributes__( $node )
      /**
       * Literal value attributes
       */
      attrs.literals && Object
      .entries( attrs.literals )
      .forEach( ([ attr, value ]) => {
        if( attr === I18N_ATTR_FLAG ) return

        /**
         * Translate standard visual attributes like:
         * 
         * - placeholder text
         * - title
         */
        const canTranslate = $node.is(`[${I18N_ATTR_FLAG}]`) && ['title', 'placeholder'].includes( attr )
        
        $fragment.attr( attr, canTranslate ? self.lips.i18n.translate( value ).text : value )

        const updateAttr = ( memo: VariableSet ) => {
          $fragment.attr( attr, canTranslate ? self.lips.i18n.translate( value ).text : value )

          // Reset track for i18n translation if needed
          canTranslate && self.__trackTranslationDep__({
            nodetype: 'element',
            target: 'attr',
            path: elementPath,
            $fragment,
            update: updateAttr,
            memo
          })
        }
        
        // Track for i18n translation
        canTranslate && self.__trackTranslationDep__({
          nodetype: 'element',
          target: 'attr',
          path: elementPath,
          $fragment,
          update: updateAttr,
          memo: scope
        })
      })

      const assignAttrs = ( list: SyntaxAttributes['expressions'], track: boolean = false ) => {
        list && Object
        .entries( list )
        .forEach( ([ attr, value ]) => {
          switch( attr ){
            // Inject inner html into the element
            case '@html': {
              const updateHTML = ( memo: VariableSet ) => {
                $fragment.html( self.__evaluate__( value as string, memo ) )
              }

              updateHTML( scope )

              if( track && self.__isReactive__( value as string, scope ) ){
                const deps = self.__extractExpressionDeps__( value as string, scope )

                deps.forEach( dep => self.__trackDep__( dependencies, dep, {
                  nodetype: 'element',
                  target: 'meta-attr',
                  $fragment,
                  path: `${elementPath}.${attr}`,
                  update: updateHTML,
                  memo: scope,
                  batch: true
                }) )
              }
            } break

            // Inject text into the element
            case '@text': {
              const 
              canTranslate = $node.is(`[${I18N_ATTR_FLAG}]`),
              updateText = ( memo: VariableSet ) => {
                $fragment.text( self.__evaluate__( value as string, memo, canTranslate ) )

                // Reset track for i18n translation if needed
                canTranslate && self.__trackTranslationDep__({
                  nodetype: 'element',
                  target: 'meta-attr',
                  path: elementPath,
                  $fragment,
                  update: updateText,
                  memo
                })
              }

              updateText( scope )
              
              if( track && self.__isReactive__( value as string, scope ) ){
                const deps = self.__extractExpressionDeps__( value as string, scope )

                deps.forEach( dep => self.__trackDep__( dependencies, dep, {
                  nodetype: 'element',
                  target: 'meta-attr',
                  $fragment,
                  path: `${elementPath}.${attr}`,
                  update: updateText,
                  memo: scope,
                  batch: true
                }) )
              }

              // Track for i18n translation
              canTranslate && self.__trackTranslationDep__({
                nodetype: 'element',
                target: 'meta-attr',
                path: elementPath,
                $fragment,
                update: updateText,
                memo: scope
              })
            } break

            // Inject formated text into the element
            case '@format': {
              const [ reference, params ] = value.split(',').map( ( part: string )=> part.trim() )
              if( !reference )
                throw new Error('Invalid @format reference')

              if( !params )
                throw new Error('Invalid @format parameters')

              const applyFormat = ( memo: VariableSet ) => {
                /**
                 * IMPORTANT: Parse parameters if provided
                 * with `!` flag to signal interpolation
                 * exception during expression evaluation.
                 */
                const _params = self.__evaluate__(`!${params.trim()}`, memo )
                if( typeof _params !== 'object' )
                  throw new Error('Invalid @format parameters')

                // Get the translation
                const text = self.lips.i18n.format( reference, _params )
                text !== undefined && $fragment.text( text )
                
                // Track for i18n translation updates
                self.__trackTranslationDep__({
                  nodetype: 'element',
                  target: 'meta-attr',
                  path: elementPath,
                  $fragment,
                  update: applyFormat,
                  memo
                })
              }

              applyFormat( scope )
              
              // Track reactive dependencies in parameters
              self
              .__extractExpressionDeps__( params, scope )
              .forEach( dep => self.__trackDep__( dependencies, dep, {
                nodetype: 'element',
                target: 'meta-attr',
                $fragment,
                path: `${elementPath}.${attr}`,
                update: applyFormat,
                memo: scope,
                batch: true
              }))
            } break

            // Convert object style attribute to string
            case 'style': {
              const updateStyle = ( memo: VariableSet ) => {
                const style = self.__evaluate__( value as string, memo )
                
                // Defined in object format
                if( typeof style === 'object' ){
                  let str = ''

                  Object
                  .entries( style )
                  .forEach( ([ k, v ]) => str += `${k}:${v};` )
                  
                  str.length && $fragment.attr('style', str )
                }
                // Defined in string format
                else $fragment.attr('style', style )
              }

              updateStyle( scope )
              
              if( track && self.__isReactive__( value as string, scope ) ){
                const deps = self.__extractExpressionDeps__( value as string, scope )

                deps.forEach( dep => self.__trackDep__( dependencies, dep, {
                  nodetype: 'element',
                  target: 'attr',
                  $fragment,
                  path: `${elementPath}.${attr}`,
                  update: updateStyle,
                  memo: scope,
                  batch: true
                }) )
              }
            } break

            // Inject the evaluation result of any other attributes
            default: {
              /**
               * Translate standard visual attributes like:
               * 
               * - placeholder text
               * - title
               */
              const 
              canTranslate = $node.is(`[${I18N_ATTR_FLAG}]`) && ['title', 'placeholder'].includes( attr ),
              updateAttrs = ( memo: VariableSet ) => {
                const res = value
                            ? self.__evaluate__( value as string, memo, canTranslate )
                            /**
                             * IMPORTANT: An attribute without a value is
                             * considered neutral but `true` of a value by
                             * default.
                             * 
                             * Eg. <counter initial=3 throttle/>
                             * 
                             * the `throttle` attribute is hereby an input with a
                             * value `true`.
                             */
                            : value !== undefined ? value : true

                /**
                 * (?) evaluation return signal to unset the attribute.
                 * 
                 * Very useful case where the attribute don't necessarily
                 * have values by default.
                 */
                if( res === undefined || res === false )
                  $fragment.removeAttr( attr )
                
                else {
                  $fragment.attr( attr, res )

                  // Reset track for i18n translation if needed
                  canTranslate && self.__trackTranslationDep__({
                    nodetype: 'element',
                    target: 'attr',
                    path: elementPath,
                    $fragment,
                    update: updateAttrs,
                    memo
                  })
                }
              }

              updateAttrs( scope )
              
              if( track && self.__isReactive__( value as string, scope ) ){
                const deps = self.__extractExpressionDeps__( value as string, scope )

                deps.forEach( dep => self.__trackDep__( dependencies, dep, {
                  nodetype: 'element',
                  target: 'attr',
                  $fragment,
                  path: `${elementPath}.${attr}`,
                  update: updateAttrs,
                  memo: scope,
                  batch: true
                }) )
              }
              
              // Track for i18n translation
              canTranslate && self.__trackTranslationDep__({
                nodetype: 'element',
                target: 'attr',
                path: elementPath,
                $fragment,
                update: updateAttrs,
                memo: scope
              })
            }
          }
        })
      }
      
      // Check, process & track expression attributes
      attrs.expressions && Object
      .keys( attrs.expressions )
      .forEach( key => {
        if( !SPREAD_VAR_PATTERN.test( key ) ) return

        const updateSpreadAttrs = ( memo: VariableSet ) => {
          const
          extracted: Record<string, any> = {},
          spreads = self.__evaluate__( key.replace( SPREAD_VAR_PATTERN, '' ) as string, memo )
          if( typeof spreads !== 'object' )
            throw new Error(`Invalid spread operator ${key}`)

          for( const _key in spreads )
            extracted[ _key ] = spreads[ _key ]

          assignAttrs( extracted )
        }

        delete attrs.expressions[ key ]
        updateSpreadAttrs( scope )

        if( key && self.__isReactive__( key, scope ) ){
          const deps = self.__extractExpressionDeps__( key, scope )

          deps.forEach( dep => self.__trackDep__( dependencies, dep, {
            nodetype: 'element',
            target: 'spread-attr',
            $fragment,
            path: `${elementPath}.${key}`,
            update: updateSpreadAttrs,
            memo: scope,
            batch: true
          }) )
        }
      })
      
      assignAttrs( attrs.expressions, true )
      
      // Record attachable events to the element
      events && Object
      .entries( events )
      .forEach( ([ _event, value ]) => {
        attachableEvents.push({
          _event,
          $fragment,
          instruction: value as string,
          scope
        })
      })

      // Track DOM insertion
      self.metrics.inc('elementCount')
      self.metrics.inc('domInsertsCount')

      return $fragment
    }
    function execText( $node: Cash ): Cash {
      const
      content = $node.text(),
      textPath = generatePath('element'),
      canTranslate = $node.parent().is(`[${I18N_ATTR_FLAG}]`),
      // Initial rendering
      $fragment = $(document.createTextNode( self.__interpolate__( content, scope, canTranslate ) ))

      // Update rendering handler
      const updateTextContent = ( memo?: VariableSet ) => {
        const text = self.__interpolate__( content, memo, canTranslate )
        if( !$fragment[0] ) return
        $fragment[0].textContent = text

        // Reset track for i18n translation if needed
        canTranslate && self.__trackTranslationDep__({
          nodetype: 'text',
          target: 'value',
          path: textPath,
          $fragment,
          update: updateTextContent,
          memo: memo || scope
        })
      }

      // Track for dependency update
      if( content && self.__isReactive__( content, scope ) ){
        const  deps = self.__extractTextDeps__( content, scope )
        
        deps.forEach( dep => self.__trackDep__( dependencies, dep, {
          nodetype: 'text',
          target: 'value',
          path: textPath,
          $fragment,
          update: updateTextContent,
          memo: scope,
          batch: deps.length > 1
        }) )
      }

      // Track for i18n translation
      canTranslate && self.__trackTranslationDep__({
        nodetype: 'text',
        target: 'value',
        path: textPath,
        $fragment,
        update: updateTextContent,
        memo: scope
      })

      // Track DOM insertion
      self.metrics.inc('elementCount')
      self.metrics.inc('domInsertsCount')

      return $fragment
    }

    function parse( $node: Cash ){
      if( $node.get(0)?.nodeType === Node.COMMENT_NODE )
        return $node

      if( $node.get(0)?.nodeType === Node.TEXT_NODE )
        return execText( $node )

      // Lips in-build scope variables syntax components
      if( $node.is('let') ) return execLet( $node )
      else if( $node.is('const') ) return execConst( $node )

      /**
       * Lips's dynamic tags like:
       * 
       * - component
       * - dynamic-tag
       */
      else if( $node.is('lips') && $node.attr(':dtag') )
        return handleDynamic( $node )
      
      /**
       * Convenient `console.log` wired into 
       * template rendering
       */
      else if( $node.is('log') ) return execLog( $node )
      
      /**
       * Identify and render macro components
       * 
       * Note: Always check `tagname` in registered 
       * macros list before in the registered components
       * list.
       */
      else if( self.__macros.has( $node.prop('tagName')?.toLowerCase() ) )
        return execMacro( $node )
      
      /**
       * Lips in-build syntax component
       * or identify and render custom components
       */
      else if( $node.is('if, for, switch, async') || self.lips.has( $node.prop('tagName')?.toLowerCase() ) )
        return execComponent( $node )
      
      /**
       * Ignore <else-if> and <else> tags as node
       * for their should be already process by <if>
       */
      else if( $node.is('else-if, else') ) return
      
      // Any other note type
      return execElement( $node )
    }

    try {
      this.__renderDepth++

      // Process nodes
      $nodes = $nodes || $(this.__template__)
      $nodes.each( function(){
        const $node = parse( $(this) )
        if( $node ) _$ = _$.add( $node )
      } )

      /**
       * Attach extracted events listeners after
       * component get rendered.
       * 
       * This to avoid loosing binding to attached
       * DOM element's events
       */
      attachableEvents.forEach( ({ $fragment, _event, instruction, scope }) => {
        this.__attachEvent__( $fragment, _event, instruction, scope )
      })

      /**
       * METRICS: Tracking total occurence of recursive rendering
       */
      self.metrics.inc('renderCount')
    }
    catch( error ){
      console.error('Rendering Failed --', error ) 
      self.metrics.trackError( error as Error )
    }
    finally {
      this.__renderDepth--
      
      // End metrics measuring
      this.metrics.endRender()
      this.metrics.trackMemory()
      
      // Clear path when main render completes
      if( this.__renderDepth === 0 ){
        this.__path = ''
        this.__pathCounter = 0
      }
    }
    
    return {
      $log: _$,
      dependencies,
      events: attachableEvents
    }
  }
  destroy(){
    /**
     * Dispose signal effect dependency of this
     * component.
     */
    this.ICE.dispose()
    /**
     * Clean up stylesheets
     */
    this.stylesheet?.clear()
    /**
     * Clean up metrics resources
     */
    this.metrics.dispose()
    /**
     * Unregister this component from IUC
     */
    this.lips.IUC.unregister( this.__path__ )
    /**
     * Stop watcher when component's element get 
     * detached from the DOM
     */
    this.lips.watcher.unwatch( this as any )

    /**
     * Detached all events
     */
    this.VER.forEach( ({ element, _event }) => this.__detachEvent__( element, _event ) )
    this.VER = []

    /**
     * Destroy nexted components as well
     */
    for( const each in this.PCC ){
      const component = this.PCC.get( each )

      component?.destroy()
      component?.delete( each )
    }

    /**
     * Cleanup
     */
    this.$?.remove()
    this.PCC?.clear()
    this.FGUD?.clear()
    // this.state.reset()
    this.__macros.clear()
    this.__i18nDeps.clear()

    // @ts-ignore
    this.__previous = null
    // @ts-ignore
    this.state = null
    // @ts-ignore
    this.input = null
    // @ts-ignore
    this.context = null

    // Clear DOM references
    if( this.$ ){
      this.$.each( ( _, el ) => {
        $(el).off() // Clear event handlers
        // $(el).removeData() // Remove custom data
      })
      
      // Clear the reference
      this.$ = null
    }

    // Trigger on-destroy lifecycle events
    typeof this.onDestroy === 'function'
    && this.onDestroy.bind(this)()
    this.emit('component:destroy', this )
  }
  
  private __meshwire__( setup: MeshWireSetup, TRACKABLE_ATTRS: Record<string, string> ){
    const
    self = this,
    {
      $node,
      meshPath,
      fragmentPath,
      fragmentBoundaries,
      argv,
      scope,
      xmlns,
      declaration,
      useAttributes
    } = setup

    let
    PARTIAL_CONTENT: Cash | undefined,
    ITERATOR_REGISTRY: Array<{ boundaries: FragmentBoundaries, argvalues?: VariableSet }> = [],
    processingUpdate = false

    const
    PARTIAL_PATHS: string[] = [],
    partialRender = ( $contents: Cash, argvalues?: VariableSet, index?: number ) => {
      // Render the partial
      const
      partialPath = `${fragmentPath}.${meshPath || 'r'}${index !== undefined ? `[${index}]` : ''}`,
      { $log, dependencies, events } = self.__withPath__( partialPath, () => self.render( partialPath, $contents, { ...scope, ...argvalues }, undefined, xmlns ) )

      PARTIAL_PATHS.push( partialPath )

      /**
       * Share partial FGU dependenies with main component thread
       * for parallel updates (main & partial) on the meshed node.
       * 
       * 1. From main FGU dependency track
       * 2. From mesh rendering track
       */
      dependencies?.forEach( ( dependents, dep ) => {
        if( !self.FGUD?.has( dep ) )
          self.FGUD.set( dep, new Map() )
        
        // Add partial dependency
        dependents.forEach( ( dependent, path ) => {
          dependent.partial?.length
                  ? dependent.partial.push( partialPath )
                  : dependent.partial = [ partialPath ]
                  
          self.FGUD.get( dep )?.set( path, dependent )
        } )
      } )
      
      self.metrics.inc('partialCount')

      /**
       * Create a dedicated boundaries for each iteration item
       */
      if( index !== undefined ){
        const boundaries = self.__getBoundaries__( partialPath )

        ITERATOR_REGISTRY[ index ] = { argvalues, boundaries }

        let $partial = $(boundaries.start)
        $partial = $partial.add($log)
        $partial = $partial.add(boundaries.end)
        
        return $partial
      }

      return $log
    },
    partialUpdate = ( deps: string[], argvalues: VariableSet, index?: number ) => {
      // Start measuring
      self.metrics.startRender()
      
      /**
       * IMPORTANT: Targeted item paths only within
       * iterator context to avoid unecessary dependency
       * checks or updates.
       */
      const targetedPaths = index !== undefined 
                                ? PARTIAL_PATHS.filter( p => p.endsWith(`r[${index}]`) )
                                : PARTIAL_PATHS

      // Execute partial mesh update
      deps.forEach( dep => {
        const dependents = self.FGUD.get( dep )
        if( !dependents ) return
        
        dependents.forEach( dependent => {
          // Process only dependents of this partial and its subpartials
          const partialPath = targetedPaths.find( p => {
            return dependent.partial?.find( pp => p == pp || self.__hasSamePathParent__( pp, p ) )
          } )
          if( !dependent.partial || !partialPath ) return
          
          if( fragmentBoundaries?.start && !document.contains( fragmentBoundaries.start ) ){
            console.warn(`${meshPath} -- partial boundaries missing in the DOM`)
            dependents.delete( dependent.path )
            return
          }
          
          if( dependent.memo?.[ dep ]
              && argvalues?.[ dep ]
              && isEqual( dependent.memo[ dep ], argvalues[ dep ] ) ) return

          dependent.memo = { ...scope, ...dependent.memo, ...argvalues }
          
          if( dependent.batch ) self.UQS.queue({ dep, dependent })
          else {
            const sync = dependent.update( dependent.memo, 'mesh-partial-updator' )
            if( sync ){
              // Adopt new memo
              typeof sync.memo === 'object'
              && dependents.set( dependent.path, { ...dependent, memo: sync.memo } )

              // Cleanup callback
              typeof sync.cleanup === 'function' && sync.cleanup()
            }
          }

          self.metrics.inc('dependencyUpdateCount')
        } )

        /**
         * Clean up if no more dependents
         */
        !dependents.size && self.FGUD.delete( dep )
      } )
      
      // Update registry
      if( index !== undefined && ITERATOR_REGISTRY[ index ] )
        ITERATOR_REGISTRY[ index ].argvalues = argvalues

      // Track update
      self.metrics.inc('partialUpdateCount')
      // Finish measuring
      self.metrics.endRender()
    },
    partialRemove = ( index: number ) => {
      if( !ITERATOR_REGISTRY[ index ] ) return
      const boundaries = ITERATOR_REGISTRY[ index ].boundaries

      ITERATOR_REGISTRY.splice( index, 1 )

      // Must have boundary markers in the DOM
      if( !document.contains( boundaries.start ) || !document.contains( boundaries.end ) ){
        console.warn(`Partial mesh item<${index}> boundaries missing`)
        return
      }
      
      // Collect all nodes between markers to remove
      const nodesToRemove = []
      let currentNode = boundaries.start.nextSibling

      while( currentNode && currentNode !== boundaries.end ){
        nodesToRemove.push( currentNode )
        currentNode = currentNode.nextSibling
      }

      // Remove existing content + boundaries
      $(nodesToRemove).remove()
      boundaries.start.remove()
      boundaries.end.remove()
    },
    wire: MeshTemplate = {
      renderer: {
        path: meshPath,
        argv,
        mesh( argvalues?: VariableSet, clone: boolean = false ){
          PARTIAL_CONTENT = $node.contents()
          if( !PARTIAL_CONTENT?.length ) return null

          /**
           * 
           */
          if( declaration?.iterator ){
            const itemsValues: VariableSet[] = argvalues?.['#'].value
            if( !Array.isArray( argvalues?.['#'].value ) )
              throw new Error('Invalid iterator argvalues')
            
            if( !itemsValues.length ) return null
            
            /**
             * Render many time subsequent content in of an iterator
             * context using the same partial path to iterate 
             * on a one time rendered $log of the same content.
             */
            let $partialLog = $()
            itemsValues.forEach( ( values, index ) => {
              if( !PARTIAL_CONTENT?.length ) return null
              $partialLog = $partialLog.add( partialRender( PARTIAL_CONTENT, values, index ) )
            } )

            return $partialLog
          }
          else return partialRender( PARTIAL_CONTENT, argvalues )
        },
        update( deps: string[], argvalues: VariableSet, boundaries?: FragmentBoundaries ){
          if( !PARTIAL_PATHS.length ) return

          // processingUpdate = true
          try {
            boundaries = boundaries || fragmentBoundaries
            
            /**
             * Granular rendering of iterator nodes
             */
            if( declaration?.iterator ){
              const newArgs: VariableSet[] = argvalues?.['#'].value
              if( !Array.isArray( newArgs ) ) return

              if( Array.isArray( ITERATOR_REGISTRY ) ){
                /**
                 * Perform granular updates when 
                 * length hasn't changed
                 */
                if( ITERATOR_REGISTRY.length === newArgs.length ){
                  // Update item's dependency without re-rendering
                  for( let i = 0; i < newArgs.length; i++ )
                    !isEqual( ITERATOR_REGISTRY[ i ].argvalues, newArgs[ i ] )
                    && partialUpdate( Object.keys( newArgs[ i ] ), newArgs[ i ], i )

                  return
                }

                /**
                 * Update incrementally existing items when 
                 * length has changed
                 */
                const existsLength = Math.min( ITERATOR_REGISTRY.length, newArgs.length )
                for( let i = 0; i < existsLength; i++ )
                  partialUpdate( Object.keys( newArgs[ i ] ), newArgs[ i ], i )
                
                // Add new items additions
                if( newArgs.length > ITERATOR_REGISTRY.length ){
                  if( !PARTIAL_CONTENT?.length ) return

                  for( let i = ITERATOR_REGISTRY.length; i < newArgs.length; i++ ){
                    const $partialLog = partialRender( PARTIAL_CONTENT, newArgs[ i ], i )
                    $(boundaries.end).before( $partialLog )
                  }
                }
                // Remove items
                else if( newArgs.length < ITERATOR_REGISTRY.length ){
                  for( let i = ITERATOR_REGISTRY.length - 1; i >= newArgs.length; i-- )
                    partialRemove( i )
                }
              }
            }
            // Update dependencies
            else partialUpdate( deps, argvalues )
          }
          /**
           * Reset the flag after the current execution cycle
           */
          finally { 
            // setTimeout( () => processingUpdate = false, 0 )
          }
        }
      }
    }

    /**
     * Allow attributes consumption as input/props.
     */
    if( useAttributes && meshPath ){
      const { attrs } = self.__getAttributes__( $node )
      
      attrs.literals && Object
      .entries( attrs.literals )
      .forEach( ([ key, value ]) => wire[ key ] = value )
      
      attrs.expressions && Object
      .entries( attrs.expressions )
      .forEach( ([ key, value ]) => {
        if( SPREAD_VAR_PATTERN.test( key ) ){
          const
          spreads = self.__evaluate__( key.replace( SPREAD_VAR_PATTERN, '' ) as string, scope )
          if( typeof spreads !== 'object' )
            throw new Error(`Invalid spread operator ${key}`)

          for( const _key in spreads )
            wire[ _key ] = spreads[ _key ]
          
          TRACKABLE_ATTRS[`${declaration?.syntax ? SYNCTAX_VAR_FLAG : ''}${meshPath}.${key}`] = value
        }
        else {
          wire[ key ] = value ? self.__evaluate__( value as string, scope ) : true
          // Record attribute to be tracked as FGU dependency
          TRACKABLE_ATTRS[`${declaration?.syntax ? SYNCTAX_VAR_FLAG : ''}${meshPath}.${key}`] = value
        }
      })
    }

    return wire
  }
  private __getBoundaries__( path: string ): FragmentBoundaries {
    // Track DOM operations for boundary creation
    this.metrics.inc('domOperations')
    this.metrics.inc('domInsertsCount')

    return {
      start: document.createComment(`s:${this.prepath}.${path}`),
      end: document.createComment(`e:${this.prepath}.${path}`)
    }
  }
  private __getAttributes__( $node: Cash ){
    const 
    extracted = ($node as any).attrs(),
    events: Record<string, any> = {},
    attrs: SyntaxAttributes = {
      literals: {},
      functions: {},
      expressions: {}
    }

    let argv: string[] = []
    
    // Process attributes including spread operator
    extracted && Object
    .entries( extracted )
    .forEach( ([ key, value ]) => {
      if( key == ':dtag' ) return

      if( key.startsWith(':')
          || key.startsWith( FUNCTION_ATTR_FLAG )
          || key.startsWith( EVENT_LISTENER_FLAG )
          || SPREAD_VAR_PATTERN.test( key )
          || ARGUMENT_VAR_PATTERN.test( key ) ){
        if( ARGUMENT_VAR_PATTERN.test( key ) ){
          const [ _, vars ] = key.match( ARGUMENT_VAR_PATTERN ) || []
          argv = vars.split(',')
        }
        else if( key.startsWith( EVENT_LISTENER_FLAG ) )
          events[ key.replace( EVENT_LISTENER_FLAG, '') ] = value

        else if( key.startsWith( FUNCTION_ATTR_FLAG ) )
          attrs.functions[ key.replace( FUNCTION_ATTR_FLAG, '') ] = value
        
        else {
          if( key.startsWith(':') )
            key = key.slice( 1, key.length )

          attrs.expressions[ key ] = value || ''
        }
      }
      // Literal value attribute
      else attrs.literals[ key ] = value
    })

    return { argv, events, attrs }
  }
  private __withPath__<T>( path: string, fn: () => T ): T {
    const prevPath = this.__path
    this.__path = path

    const result = fn()
    this.__path = prevPath

    return result
  }
  private __getPathParent__( path: string ){
    const __ = path.split('/')
    if( __.length > 1 ) __.pop()

    return __.join('/')
  }
  private __hasSamePathParent__( path: string, parentPath: string ){
    return path.startsWith( parentPath )
  }

  private __evaluate__( expr: string, scope?: VariableSet, translate?: boolean ){
    try {
      expr = expr.trim()
      const exec = ( each: string ) => {
        /**
         * Only use none-proxy state for eval
         * to avoid state mutation expression
         * during template rendering.
         */
        const _state = this.state.toJSON()

        if( scope ){
          const _scope: Record<string, any> = {}
          for( const key in scope )
            _scope[ key ] = scope[ key ].value

          const
          expression = `with( scope ){ return ${each}; }`,
          fn = new Function('self', 'input', 'state', 'static', 'context', 'scope', expression )
        
          return fn( this, this.input, _state, this.static, this.context, _scope || {} )
        }
        else {
          const 
          expression = `return ${each}`,
          fn = new Function('self', 'input', 'state', 'static', 'context', expression )

          return fn( this, this.input, _state, this.static, this.context )
        }
      }

      // Check for interpolation or object expression
      if( /{\s*([^{}]+)\s*}/.test( expr ) ){
        /**
         * IMPORTANT: Object exception flag.
         * 
         * Case where closures supposedly to define
         * interpolation are instead flagged with `!` 
         * sign to be processed as a javascript object.
         */
        if( expr.startsWith('!{') && expr.endsWith('}') )
          return exec( expr.slice(1) )

        // Interpolation
        return expr.replace( INTERPOLATE_PATTERN, ( _, expr ) => exec( expr ) )
      }

      return exec( expr )
    }
    catch( error ){ return expr }
  }
  private __evaluateFunction__( expr: string, params: any[], scope?: VariableSet ){
    /**
     * Execute function expression directly attach 
     * as attribute.
     * 
     * Eg. 
     *  `attr="() => console.log('Hello world')"`
     *  `attr="e => self.onChange(e)"`
     */
    if( /(\s*\w+|\s*\([^)]*\)|\s*)\s*=>\s*(\s*\{[^}]*\}|\s*[^\n;"]+)/g.test( expr ) )
      return this.__evaluate__( expr, scope )( ...params )

    /**
     * Execute reference handler function
     * 
     * Eg. 
     *  `attr="handleInputValue"`
     *  `attr="handleClick, this.input.count++"`
     * 
     * Note: `handleInputValue` and `handleClick` handlers
     *       must be defined as `handler` at the component
     *       level before any assignment or the execution
     *       will throw error.
     */
    else {
      let 
      [ fn, ...args ] = expr.split(/\s*,\s*/),
      _fn
      
      /**
       * Evaluate whether `fn` is a function itself or
       * a name of an expression resulting in a function.
       */
      fn = this.__evaluate__( fn, scope )

      if( typeof fn === 'function' ) _fn = fn
      else {
        if( typeof this[ fn ] !== 'function' )
          throw new Error(`Undefined <${fn}> handler method`)

        _fn = this[ fn ].bind(this)
      }
      
      if( typeof _fn !== 'function' )
        throw new Error(`Expected <${fn}> to be a function or handler method`)

      let _args = args.map( each => (this.__evaluate__( each, scope )) )

      if( params.length )
        _args = [ ..._args, ...params ]

      return _fn( ..._args )
    }
  }
  private __interpolate__( str: string, scope?: VariableSet, translate?: boolean ){
    str = str.replace( INTERPOLATE_PATTERN, ( _, expr ) => this.__evaluate__( expr, scope ) )
    // Apply translation
    if( translate )
      str = this.lips.i18n.translate( str ).text

    return str
  }
  private __attachEvent__( element: Cash | Component<MT>, _event: string, instruction: string, scope?: VariableSet ){
    /**
     * Execute function script directly attach 
     * as the listener.
     * 
     * Eg. 
     *  `on-click="() => console.log('Hello world')"`
     *  `on-change="e => self.onChange(e)"`
     * 
     * Or
     * 
     * Execute reference handler function
     * 
     * Eg. 
     *  `on-input="handleInputValue"`
     *  `on-click="handleClick, this.input.count++"`
     * 
     * Note: `handleInputValue` and `handleClick` handlers
     *       must be defined as `handler` at the component
     *       level before any assignment.
     */
    element.on( _event, ( ...params: any[] ) => this.__evaluateFunction__( instruction, params, scope ) )

    this.VER.push({ element, _event })
    
    // Track DOM operation
    this.metrics.inc('domUpdatesCount')
    this.metrics.inc('domRemovalsCount')
  }
  private __detachEvent__( $element: Cash | Component<MT>, _event: string ){
    $element.off( _event )
    // Track DOM operation
    this.metrics.inc('domOperations')
    this.metrics.inc('domRemovalsCount')
  }

  private __extractTextDeps__( expr: string, scope?: VariableSet ): string[] {
    const deps = new Set<string>()
    
    // Handle interpolation expressions
    const matches = expr.match(/{\s*([^{}]+)\s*}/g) || []
    matches.forEach( match => {
      const
      innerExpr = match.replace(/[{}]/g, '').trim(),
      exprDeps = this.__extractExpressionDeps__( innerExpr, scope )

      exprDeps.forEach( dep => deps.add( dep ) )
    })

    return Array.from( deps )
  }
  private __extractExpressionDeps__( expr: string, scope?: VariableSet ): string[] {
    const
    /**
     * Metavars pattern
     * 
     * - state.items
     * - input.name
     * - context.action
     */
    MVP = /\b(state|input|context)(?:\.[a-zA-Z_]\w*)+(?=\[|\.|$|\s|;|,|\))/g,
    /**
     * Metacall pattern
     * 
     * - self.getStyle()
     * - self.rule
     */
    MCP = /\b(self)(?:\.[a-zA-Z_]\w*)+(?=\()/g

    let matches = [
      ...Array.from( expr.matchAll( MVP ) ),
      ...Array.from( expr.matchAll( MCP ) )
    ]

    /**
     * Extract scope interpolation expressions
     */
    if( scope && Object.keys( scope ).length ){
      const scopeRegex = new RegExp(`\\b(${Object.keys( scope ).join('|')})`, 'g')
      
      matches = [
        ...matches,
        ...Array.from( expr.matchAll( scopeRegex ) )
      ]
    }
    
    // Filter out duplicate deps
    return [ ...new Set( matches.map( m => m[0] ) ) ]
  }
  private __isReactive__( expr: string, scope?: VariableSet ): boolean {
    // Reactive component variables
    if( /(state|input|context|self)\.[\w.]+/.test( expr ) ) return true
    // Reactive internal scope
    if( scope
        && Object.keys( scope ).length
        && new RegExp( Object.keys( scope ).join('|') ).test( expr ) ) return true

    return false
  }
  private __trackDep__( dependencies: FGUDependencies, dep: string, record: FGUDependency ){
    /**
     * Designate dependencies that assign or 
     * interpolate a `let` variable.
     */
    if( record.memo
        && record.memo[ dep ]
        && record.memo[ dep ].type === 'let' )
      record.haslet = true

    !dependencies.has( dep ) && dependencies.set( dep, new Map() )
    dependencies.get( dep )?.set( record.path, record )

    // Track dependency
    this.metrics.inc('dependencyTrackCount')
  }
  private __trackTranslationDep__( record: I18nDependency ){
    this.__i18nDeps.set( record.path, record )

    // i18n dependency
    this.metrics.inc('i18nTrackCount')
  }

  private __valueDep__( obj: any, path: string[] ): any {
    return path.reduce( ( curr, part ) => curr?.[ part ], obj )
  }
  private __shouldUpdate__( dep_scope: string, parts: string[], current: InteractiveMetavars<MT>, previous: InteractiveMetavars<MT> ): boolean {
    // Allow component's method `self.fn` call evaluation
    if( dep_scope === 'self' ) return true

    // Check metavars changes
    const
    ovalue = this.__valueDep__( previous[ dep_scope as keyof InteractiveMetavars<MT> ], parts ),
    nvalue = this.__valueDep__( current[ dep_scope as keyof InteractiveMetavars<MT> ], parts )

    /**
     * Skip if value hasn't changed
     */
    return !isEqual( ovalue, nvalue )
  }
  private __updateDepNodes__( current: InteractiveMetavars<MT>, previous: InteractiveMetavars<MT> ){
    if( !this.FGUD?.size ) return
    
    // Track update
    this.metrics.inc('componentUpdateCount')
    // Start measuring
    this.metrics.startRender()
    
    this.FGUD.forEach( ( dependents, dep ) => {
      const [ dep_scope, ...parts ] = dep.split('.')

      /**
       * Handle updates for each dependent node/component
       */
      if( !this.__shouldUpdate__( dep_scope, parts, current, previous ) ) return
      
      console.log('gen update --', dep_scope, parts, dependents )
      dependents.forEach( dependent => {
        const { path, batch, $fragment, boundaries, update, memo, syntax } = dependent
        try {
          /**
           * Only clean up non-syntactic dependencies 
           * or node no longer in DOM
           */
          if( !syntax
              && (boundaries?.start && !document.contains( boundaries.start ))
              || ($fragment !== null && !$fragment.closest('body').length) ){
            dependents.delete( path )
            return
          }
          
          /**
           * For batch updates, collect all updates first
           * and execute batch once.
           */
          if( batch ) this.UQS.queue({ dep, dependent })

          // Immediate update
          else {
            const sync = update( memo, 'main-updator' )
            if( sync ){
              /**
               * Post-update memo for co-dependency update 
               * processors like partial updates.
               */
              typeof sync.memo === 'object'
              && dependents.set( path, { ...dependent, memo: sync.memo } )

              /**
               * Manual cleanup callback function after
               * dependency track adopted new changes.
               * 
               * Useful for DOM cleanup for instance of 
               * complex wired $fragment.
               */
              typeof sync.cleanup === 'function' && sync.cleanup()
            }
          }

          this.metrics.inc('dependencyUpdateCount')
        }
        catch( error ){
          console.error('failed to update dependency nodes --', error )
          return
        }
      })

      /**
       * Clean up if no more dependents
       */
      !dependents.size && this.FGUD?.delete( dep )
    })

    // Finish measuring
    this.metrics.endRender()
  }
  private __updateVarDepNodes__( dep: string, varPath: string, newScope: VariableSet ){
    if( !this.FGUD?.size ) return

    // Track update
    this.metrics.inc('partialUpdateCount')
    // Start measuring
    this.metrics.startRender()
    
    const dependents = this.FGUD.get( dep )
    dependents?.forEach( ( dependent, path ) => {
      if( !dependent.haslet
          || !this.__hasSamePathParent__( path, this.__getPathParent__( varPath ) ) ) return
          
      dependent.memo = { ...dependent.memo, ...newScope }
      
      if( dependent.batch ) this.UQS.queue({ dep, dependent })
      else {
        const sync = dependent.update( dependent.memo, 'var-partial-updator' )
        typeof sync?.cleanup === 'function' && sync.cleanup()
      }
    } )

    // Finish measuring
    this.metrics.endRender()
  }
  private __updateI18nDepNodes__(){
    if( !this.__i18nDeps?.size ) return

    // Track update
    this.metrics.inc('i18nUpdateCount')
    // Start measuring
    this.metrics.startRender()
    
    this.__i18nDeps?.forEach( ( dependent, path ) => {
      /**
       * The different of i18n dependency update
       * from other updates is that they are cleared
       * as soon as the get updated. Let for the updator
       * function to reset a track if needed.
       * 
       * Advantage:
       * - No tracking of unecessarily dead node
       * - `i18n` flag or attribute changed to no-translate
       * - Keep fresh `memo` from other update processes
       * - Cleanup safety for highly interactive content UI.
       */
      if( !dependent.$fragment.closest('body').length ){
        this.__i18nDeps.delete( path )
        return
      }
      
      dependent.update( dependent.memo, 'i18n-partial-updator' )
    } )

    // Finish measuring
    this.metrics.endRender()
  }
  
  appendTo( arg: Cash | string ){
    (typeof arg == 'string' ? $(arg) : arg).append( this.node )
    // Track DOM operation
    this.metrics.inc('domOperations')

    return this
  }
  prependTo( arg: Cash | string ){
    typeof arg == 'string' ? $(arg) : arg.prepend( this.node )
    // Track DOM operation
    this.metrics.inc('domOperations')

    return this
  }
  replaceWith( arg: Cash | string ){
    (typeof arg == 'string' ? $(arg) : arg).replaceWith( this.node )
    // Track DOM operation
    this.metrics.inc('domOperations')

    return this
  }
}