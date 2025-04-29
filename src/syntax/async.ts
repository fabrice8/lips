import type { Declaration, Handler, Metavars, MeshRenderer, MeshTemplate, VariableSet } from '../types'

export interface Input {
  await: Promise<any>
  then: MeshTemplate
  catch?: MeshTemplate
  loading?: MeshTemplate
  renderer: MeshRenderer
}
export interface Static {
  initialized: boolean
  finalized: boolean
  prevRenderer: MeshRenderer | null
}

export const declaration: Declaration = {
  name: 'async',
  syntax: true,
  tags: {
    'then': { type: 'child' },
    'catch': { type: 'child', optional: true },
    'loading': { type: 'child', optional: true }
  }
}
export const _static: Static = {
  initialized: false,
  finalized: false,
  prevRenderer: null
}

export const handler: Handler<Metavars<Input, {}, Static>> = {
  onInput( memo ){ this.static.initialized && this.processor( this.input, memo ) },
  onSelfRender(){
    const $content = this.processor( this.input, undefined, true )
    this.static.initialized = true

    return $content
  },

  processor( options: Input, memo?: VariableSet, init = false ){
    // console.log('async await --', this.input )
    if( !options.await )
      throw new Error('Undefined async <await> attribute')

    if( !(options.await instanceof Promise) )
      throw new Error('Expected async <await> attribute value to be a function')
    
    this.static.finalized = false
    
    // Show loading content
    if( options.loading ){
      // Clean up previously rendered content
      this.static.prevRenderer?.cleanup()
      
      // Render loading content
      const $content = options.loading.renderer.mesh({}, memo )
      this.static.prevRenderer = options.loading.renderer

      this.execute( options, memo, true )

      if( this.static.finalized ) return
      if( !$content?.length ) return
      if( init ) return $content

      options.loading.renderer.fill( $content )
    }
    else this.execute( options, memo )
  },
  execute( options: Input, memo?: VariableSet, initialized = false ){
    options.await
    .then( ( response: any ) => {
      this.static.prevRenderer?.cleanup()
      if( !options.then ) return

      const
      [ rvar ] = options.then.renderer.argv,
      props: VariableSet = { [rvar]: { value: response, type: 'arg' } }
      
      // Render then content
      const $content = options.then.renderer.mesh( props, memo )
      this.static.prevRenderer = options.then.renderer

      if( !$content?.length ) return
      if( !initialized ) return $content

      options.then.renderer.fill( $content )
    })
    .catch( ( error: unknown ) => {
      this.static.prevRenderer?.cleanup()
      if( !options.catch ) return
      
      const
      [ evar ] = options.catch.renderer.argv,
      props: VariableSet = { [evar]: { value: error, type: 'arg' } }

      // Render catch content
      const $content = options.catch.renderer.mesh( props, memo )
      this.static.prevRenderer = options.catch.renderer

      if( !$content?.length ) return
      if( !initialized ) return $content

      options.catch.renderer.fill( $content )
    })
    .finally( () => this.static.finalized = true )
  }
}