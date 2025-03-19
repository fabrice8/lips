// function execAsync( $node: Cash ){
//   const attr = $node.attr('await') as string
//   if( !attr )
//     throw new Error('Undefined async <await> attribute')

//   const
//   $preload = $node.find('preload').clone(),
//   $resolve = $node.find('resolve').clone(),
//   $catch = $node.find('catch').clone()
//   let $fragment = $()

//   // Initially append preload content
//   const preloadContent = $preload.contents()
//   if( preloadContent.length )
//     $fragment = $fragment.add( self.render( preloadContent, scope ) )
    
//   const
//   [ fn, ...args ] = attr.trim().split(/\s*,\s*/),
//   _await = (self[ fn ] || self.__evaluate__( fn, scope )).bind(self) as any
  
//   if( typeof _await !== 'function' )
//     throw new Error(`Undefined <${fn}> handler method`)

//   const _args = args.map( each => (self.__evaluate__( each, scope )) )

//   _await( ..._args )
//   .then( ( response: any ) => {
//     const 
//     resolveContent = $resolve?.contents(),
//     responseScope: VariableScope = {
//       ...scope,
//       response: { value: response, type: 'arg' }
//     }
    
//     resolveContent.length
//     && $fragment.replaceWith( self.render( resolveContent, responseScope ) )
//   })
//   .catch( ( error: unknown ) => {
//     const 
//     catchContent = $catch?.contents(),
//     errorScope: VariableScope = {
//       ...scope,
//       error: { value: error, type: 'arg' }
//     }

//     catchContent.length
//     && $fragment.replaceWith( self.render( catchContent, errorScope ) )
//   })
  
//   /**
//    * BENCHMARK: Tracking total elements rendered
//    */
//   self.benchmark.inc('elementCount')

//   return $fragment
// }

import type { Declaration, Handler, Metavars, MeshRenderer, MeshTemplate } from '..'

export interface Input {
  await: Promise<any>
  then: MeshTemplate
  catch?: MeshTemplate
  finally?: MeshTemplate
  renderer: MeshRenderer
}
export interface State {
  renderer: MeshRenderer | null
  argvalues: any
}

export const declaration: Declaration = {
  name: 'async',
  syntax: true,
  tags: {
    'then': { type: 'child' },
    'catch': { type: 'child', optional: true },
    'finally': { type: 'child', optional: true }
  }
}
export const state: State = {
  renderer: null,
  argvalues: null
}

export const handler: Handler<Metavars<Input, State>> = {
  onInput(){
    console.log('async await --', this.input )
    if( !this.input.await )
      throw new Error('Undefined async <await> attribute')

    if( !(this.input.await instanceof Promise) )
      throw new Error('Expected async <await> attribute value to be a function')

    this.input.await
    .then( ( response: any ) => {
      this.state.renderer = this.input.then.renderer

      const [ rvar ] = this.input.then.renderer.argv
      this.state.argvalues = {
        [rvar]: { value: response, type: 'arg' }
      }
    })
    .catch( ( error: unknown ) => {
      if( !this.input.catch ) return
      
      this.state.renderer = this.input.catch.renderer
      
      const [ evar ] = this.input.then.renderer.argv
      this.state.argvalues = {
        [evar]: { value: error, type: 'arg' }
      }

      console.log( this.state.argvalues )
    })
    .finally( () => {
      if( !this.input.finally ) return
      this.state.renderer = this.input.finally.renderer
    })
  }
}

export default `<{state.renderer} ...state.argvalues/>`