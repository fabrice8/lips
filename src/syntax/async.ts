import type { Declaration, Handler, Metavars, MeshRenderer, MeshTemplate, VariableSet } from '../types'

export interface Input {
  await: Promise<any>
  then: MeshTemplate
  catch?: MeshTemplate
  loading?: MeshTemplate
  renderer: MeshRenderer
}
export interface State {
  renderer: MeshRenderer | null
  props: VariableSet
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
export const state: State = {
  renderer: null,
  props: {}
}

export const handler: Handler<Metavars<Input, State>> = {
  onInput(){ this.processor( this.input ) },

  processor( options: Input ){
    // console.log('async await --', this.input )
    if( !options.await )
      throw new Error('Undefined async <await> attribute')

    if( !(options.await instanceof Promise) )
      throw new Error('Expected async <await> attribute value to be a function')
    
    // Show loading content
    if( options.loading ){
      this.state.renderer = options.loading.renderer
      this.state.props = {}
    }

    options.await
    .then( ( response: any ) => {
      if( !options.then ) return
      this.state.renderer = options.then.renderer

      const [ rvar ] = options.then.renderer.argv
      this.state.props = {
        [rvar]: { value: response, type: 'arg' } 
      }
    })
    .catch( ( error: unknown ) => {
      if( !options.catch ) return
      this.state.renderer = options.catch.renderer
      
      const [ evar ] = options.then.renderer.argv
      this.state.props = { 
        [evar]: { value: error, type: 'arg' }
      }
    })
  }
}

export default `<{state.renderer} #=state.props/>`