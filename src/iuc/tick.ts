/**
 * A more efficient scheduler using microtasks
 * for component updates
 */
export default class NextTick {
  private pendingComponents = new Set<string>()
  private isPending = false
  private callbacks = new Map<string, Function>()
  
  /**
   * Register a component update callback
   */
  register( ref: string, callback: Function ){
    this.callbacks.set( ref, callback )
  }
  
  /**
   * Unregister a component
   */
  unregister( ref: string ){
    this.callbacks.delete( ref )
  }
  
  /**
   * Queue a component update to be processed
   * in the next tick of the event loop
   */
  queue( ref: string ){
    // Skip if component not registered
    if( !this.callbacks.has( ref ) ) return
    
    // Mark component as pending
    this.pendingComponents.add( ref )
    
    // Schedule processing if not already scheduled
    if( !this.isPending ){
      this.isPending = true
      this.schedule()
    }
  }
  
  /**
   * Schedule update using microtasks
   */
  private schedule(){
    Promise.resolve().then( () => this.process() )
  }
  
  /**
   * Process all pending component updates
   */
  private process(){
    // Capture components to update
    const componentsToUpdate = Array.from( this.pendingComponents )
    
    // Clear queue before processing
    this.pendingComponents.clear()
    this.isPending = false
    
    // Process each component update
    componentsToUpdate.forEach( ref => {
      try {
        const callback = this.callbacks.get( ref )
        if( callback ) callback()
      } 
      catch( error ){
        console.error( `Error updating component ${ref}:`, error )
      }
    })
  }

  /**
   * Clear all pending updates and reset state
   */
  clear(){
    this.pendingComponents.clear()
    this.isPending = false
  }

  /**
   * Complete disposal of all resources
   */
  dispose(){
    this.pendingComponents.clear()
    this.callbacks.clear()
    this.isPending = false
  }
}