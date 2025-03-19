import Tick from './tick'

/**
 * Internal Update Cycle
 */
export default class IUC {
  private subscriptions = new Map<string, () => void>()
  private tick = new Tick()
  
  /**
   * Register component update function
   */
  register( ref: string, ticker: () => void ){
    this.subscriptions.set( ref, ticker )
    this.tick.register( ref, ticker )
  }
  
  /**
   * Unregister component
   */
  unregister( ref: string ){
    this.subscriptions.delete( ref )
    this.tick.unregister( ref )
  }
  
  /**
   * Queue an immediate update for next tick
   */
  queueUpdate( ref: string ){
    this.tick.queue( ref )
  }
  
  dispose(){
    this.subscriptions.clear()
    this.tick.dispose()
  }

  prepareForPotentialUnload(){
    // Clear all queued updates
    this.tick.clear()
    
    // Release circular references in callbacks
    this.subscriptions.forEach( ( _, ref ) => {
      /**
       * Replace actual functions with empty functions 
       * to breaks potential circular references 
       * while maintaining API
       */
      this.subscriptions.set( ref, () => {} )
    })
  }

  /**
   * Create a state proxy handler to detect mutations
   */
  proxyState<State extends Object>( componentRef: string, state: State ){
    const 
    self = this,
    // Store proxy->target relationships
    proxyMap = new WeakMap(),
    exec = ( __: any ) => {
      // Recursively wrap nested array or map values
      if( __ instanceof Map )
        __.forEach( ( value, key ) => __.set( key, deepProxy( value ) ) )

      // Recursively wrap nested array or map values
      else if( Array.isArray( __ ) )
        __.forEach( (value, index ) => __[ index ] = deepProxy( value ) )

      // Recursively wrap nested object values
      else if( typeof __ === 'object' )
        Object.entries( __ ).forEach( ([ key, value ]) => __[ key ] = deepProxy( value ) )

      let proxy = new Proxy( __, {
        get( target: any, prop: string | symbol ){// Special method to unwrap the proxy and get original structure for JSON
          if( prop === 'toJSON' )
            return function(){
              // Helper function to recursively unwrap proxied objects
              const unwrap = ( value: any ): any => {
                // Handle primitives
                if( !value || typeof value !== 'object' ) return value
                
                // Get the original target when it's a proxy
                if( proxyMap.has( value ) ){
                  const originalTarget = proxyMap.get( value )
                  
                  // Handle different object types
                  if( originalTarget instanceof Map ){
                    // Convert Map to object for JSON serialization
                    const result = {} as any

                    originalTarget.forEach( ( v, k ) => result[ typeof k === 'object' ? JSON.stringify(k) : String(k) ] = unwrap( v ) );
                    return result
                  }
                  
                  if( Array.isArray( originalTarget ) )
                    return originalTarget.map( item => unwrap( item ) )
                  
                  // Regular objects
                  const result = {} as any
                  Object.entries( originalTarget ).forEach(( [ k, v ] ) => result[ k ] = unwrap( v ) )

                  return result
                }
                
                // Handle native toJSON methods (Date, etc.)
                if( typeof value.toJSON === 'function' && !proxyMap.has( value ) )
                  return value.toJSON()
                
                // Not a proxied object, return as is
                return value
              }
              
              return unwrap( proxy )
            }

          if( prop === 'reset' )
            return function(){
              proxy = null
            }

          const value = target[ prop ]

          // Intercept Map methods
          if( __ instanceof Map && typeof value === 'function' )
            return function( ...args: any[] ){
              const methodName = prop.toString()
              
              // Proxy new values being added to the Map
              if( methodName === 'set' && args.length >= 2 )
                args[1] = deepProxy( args[1] )

              const result = value.apply( target, args )
              
              /**
               * Modify the Map and queue update after mutation
               */
              ;['set', 'delete', 'clear'].includes( methodName )
              && self.queueUpdate( componentRef )
              
              return result
            }

          // Intercept Array methods
          if( Array.isArray( __ ) && typeof value === 'function' )
            return function( ...args: any[] ){
              const methodName = prop.toString()
              
              /**
               * Proxy new values being added to the Array
               */
              if( ['push', 'unshift'].includes( methodName ) )
                args = args.map( arg => deepProxy( arg ) )
              
              /**
               * Special handling for splice to proxy only 
               * the new elements
               */
              else if( methodName === 'splice' && args.length > 2 )
                args = [ args[0], args[1], ...args.slice(2).map( arg => deepProxy( arg ) ) ]
              
              const result = value.apply( target, args )
              
              /**
               * These methods mutate the array and queue update
               */
              ;['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill'].includes( methodName )
              && self.queueUpdate( componentRef )
              
              return result
            }

          return value
        },
        
        set( target: any, prop: string | symbol, value: any ){
          // Skip if value hasn't changed
          if( target[ prop ] === value ) return true
          
          // Handle Map assignment (replacing the entire Map)
          if( value instanceof Map && target[ prop ] instanceof Map ){
            // Clear and repopulate the existing Map to maintain references
            const existingMap = target[ prop ]

            existingMap.clear()
            /**
             * Proxy each value as it's added to the Map
             */
            value.forEach( ( v, k ) => existingMap.set( k, deepProxy( v ) ) )
            
            // Queue update
            self.queueUpdate( componentRef )
            return true
          }
          
          /**
           * Update new value and proxy it if needed 
           * before assignment
           */
          target[ prop ] = deepProxy( value )
          // Queue update
          self.queueUpdate( componentRef )
          
          return true
        }
      })

      // Store reference to the original target
      proxyMap.set( proxy, __ )

      return proxy
    },
    deepProxy = ( value: any ) => {
      if( !value ) return value
      
      return value instanceof Map
              || Array.isArray( value )
              || typeof value === 'object'
                      ? exec( value )
                      : value
    }
    
    return exec( state )
  }
}