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
  onInput(){
    // console.log('async await --', this.input )
    if( !this.input.await )
      throw new Error('Undefined async <await> attribute')

    if( !(this.input.await instanceof Promise) )
      throw new Error('Expected async <await> attribute value to be a function')
    
    // Show loading content
    if( this.input.loading ){
      this.state.renderer = this.input.loading.renderer
      this.state.props = {}
    }

    this.input.await
    .then( ( response: any ) => {
      if( !this.input.then ) return
      this.state.renderer = this.input.then.renderer

      const [ rvar ] = this.input.then.renderer.argv
      this.state.props = {
        [rvar]: { value: response, type: 'arg' } 
      }
    })
    .catch( ( error: unknown ) => {
      if( !this.input.catch ) return
      this.state.renderer = this.input.catch.renderer
      
      const [ evar ] = this.input.then.renderer.argv
      this.state.props = { 
        [evar]: { value: error, type: 'arg' }
      }
    })
  }
}

export default `<{state.renderer} #=state.props/>`