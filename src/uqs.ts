import type { FGUDBatchEntry, Metavars } from './types'
import type Component from './component'

/**
 * Update Queue System for high-frequency DOM updates
 */
export default class UpdateQueue<MT extends Metavars > {
  private pending: Map<number, Set<FGUDBatchEntry>> = new Map()
  private isPending = false
  private component: Component<MT>
  
  // Metrics for tracking performance
  private metrics = {
    batchCount: 0,
    updatesProcessed: 0,
    lastBatchSize: 0,
    avgBatchSize: '0.00'
  }
  
  constructor( component: Component<MT> ){
    this.component = component
  }
  
  /**
   * Queue updates to be processed in the next tick
   */
  queue( entry: FGUDBatchEntry ){
    /**
     * Add priority slot if not
     * 
     * Default => 2
     */
    const priority = entry.priority ?? 2
    if( !this.pending.has( priority ) )
      this.pending.set( priority, new Set() )

    /**
     * TODO: Review the override of pending update
     * of same dependent.
     * 
     * If not functioning as expected. Revert
     * `this.pending` to a `Set` instead of `Map`.
     */
    this.pending.get( priority )?.add( entry )
    this.component.metrics.inc('dependencyUpdateCount')
    
    // Schedule processing if not already pending
    if( !this.isPending ){
      this.isPending = true
      this.scheduleProcessing()
    }
  }
  /**
   * Apply updates
   */
  apply({ dep, deppath }: FGUDBatchEntry, by = 'batch-updator' ){
    try {
      const dependent = this.component.FGUD.get( dep )?.get( deppath )
      if( !dependent ){
        console.warn(`[batch update]: <${deppath}> dependency not found`)
        return
      }

      if( dependent.garbage ){
        // Clear garbage dependent from the dependencies map
        this.component.FGUD.get( dep )?.delete( deppath )
        // Cleanup empty dependency maps
        !this.component.FGUD.get( dep )?.size && this.component.FGUD.delete( dep )

        return
      }

      const memoslot = this.component.FGUDMemory.get( dependent.nodepath )
      if( !memoslot ){
        // console.warn(`unexpected occurence: <${dependent.deppath || dependent.nodepath}> has no memo`)
        return
      }

      // Apply the update
      const sync = dependent.update( memoslot.memo || {}, by )
      if( sync ){
        /**
         * Post-update memo for co-dependency update 
         * processors like partial updates.
         */
        if( typeof sync.memo === 'object' )
          memoslot.memo = sync.memo
        
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
    catch( error ){ console.error( 'Failed to update dependency --', error ) }
  }
  
  /**
   * Schedule processing using microtasks for better performance
   */
  private scheduleProcessing(){
    Promise
    .resolve()
    .then( () => this.processQueue() )
  }
  
  /**
   * Process all queued updates in a batch
   */
  private processQueue(){
    // Deep clone the pending map for process
    const processOnly = new Map<number, Set<FGUDBatchEntry>>()
    this.pending.forEach( ( badge, priority ) => processOnly.set( priority, new Set( badge ) ) )

    // Clear the original pending map for new updates
    this.pending.clear()
    // Reset the pending flag to allow new scheduling
    this.isPending = false

    const exec = ( badge: Set<FGUDBatchEntry> ) => {
      const entries = Array.from( badge )
      // Track batch stats
      this.component.metrics.trackBatch( entries.length )

      // Update metrics
      this.metrics.batchCount++
      this.metrics.lastBatchSize = entries.length
      this.metrics.updatesProcessed += entries.length
      this.metrics.avgBatchSize = (this.metrics.updatesProcessed / this.metrics.batchCount).toFixed(2)
      
      // Apply all updates
      entries.forEach( entry => this.apply( entry ) )
    }

    /**
     * Execute dependency entries by priority x badges
     * 
     * Top-down: (low values = higher priority)
     */
    const order = Array.from( processOnly.keys() ).sort( ( a, b ) => a - b )
    for( const priority of order ){
      const badge = processOnly.get( priority )
      
      badge
      && badge.size
      && exec( badge )
    }
    
    // More updates were queued during processing
    if( this.pending.size > 0 && !this.isPending ){
      this.isPending = true
      this.scheduleProcessing()
    }
  }
  
  /**
   * Get current metrics
   */
  getMetrics(){
    return {
      batchCount: this.metrics.batchCount,
      lastBatchSize: this.metrics.lastBatchSize,
      avgBatchSize: this.metrics.avgBatchSize,
      totalUpdates: this.metrics.updatesProcessed
    }
  }
}