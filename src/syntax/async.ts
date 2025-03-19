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